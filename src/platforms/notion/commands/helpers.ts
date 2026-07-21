import { randomUUID } from 'node:crypto'

import { BrowserTokenExtractor } from '@/platforms/notion/browser-token-extractor'
import { getActiveUserId, internalRequest, setActiveSpaceId, setActiveUserId } from '@/platforms/notion/client'
import { CredentialManager, type NotionCredentials } from '@/platforms/notion/credential-manager'
import { validateCandidates, withStoredAccounts } from '@/platforms/notion/extracted-token-validation'
import { collectBacklinkUserIds, getRecordValue } from '@/platforms/notion/formatters'
import { TokenExtractor } from '@/platforms/notion/token-extractor'
import { formatNotionId } from '@/shared/utils/id'

export type CommandOptions = { pretty?: boolean }

type TeamRecord = {
  value?: {
    id: string
    name?: string
    space_id: string
    is_default?: boolean
  }
}

type SpaceViewPointer = {
  id: string
  table: string
  spaceId: string
}

type SpaceUserEntry = {
  space?: Record<string, unknown>
  team?: Record<string, TeamRecord>
  user_root?: Record<string, unknown>
}

type GetSpacesResponse = Record<string, SpaceUserEntry>

export function generateId(): string {
  return randomUUID()
}

function shouldFallbackToBrowser(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.includes('Notion directory not found')
}

async function autoExtract(manager: CredentialManager): Promise<NotionCredentials | null> {
  try {
    const appExtractor = new TokenExtractor()
    const appAccounts = await appExtractor.extractAll()
    const appValidation = await validateCandidates(appAccounts, 'app')
    if (appValidation.extracted) {
      const storedCredentials = withStoredAccounts(appValidation.extracted, appValidation.accounts)
      await manager.setCredentials(storedCredentials)
      return storedCredentials
    }
  } catch (error) {
    if (!shouldFallbackToBrowser(error)) {
      throw error
    }
  }

  const browserExtractor = new BrowserTokenExtractor()
  const browserAccounts = await browserExtractor.extractAll()
  const browserValidation = await validateCandidates(browserAccounts, 'browser')
  if (browserValidation.extracted) {
    const storedCredentials = withStoredAccounts(browserValidation.extracted, browserValidation.accounts)
    await manager.setCredentials(storedCredentials)
    return storedCredentials
  }

  return null
}

export async function getCredentialsOrExit(): Promise<NotionCredentials> {
  const manager = new CredentialManager()
  const creds = await manager.getCredentials()
  if (creds) return creds

  try {
    const extracted = await autoExtract(manager)
    if (extracted) return extracted
  } catch (error) {
    console.error(
      JSON.stringify({
        error: `Auto-extraction failed: ${(error as Error).message}`,
        hint: 'Run: vibe-notion auth extract --debug',
      }),
    )
    process.exit(1)
  }

  console.error(JSON.stringify({ error: 'Not authenticated. Run: vibe-notion auth extract' }))
  process.exit(1)
}

export async function getCredentialsOrThrow(): Promise<NotionCredentials> {
  const manager = new CredentialManager()
  const creds = await manager.getCredentials()
  if (creds) return creds

  try {
    const extracted = await autoExtract(manager)
    if (extracted) return extracted
  } catch (error) {
    throw new Error(`Auto-extraction failed: ${(error as Error).message}`)
  }

  throw new Error('Not authenticated. Run: vibe-notion auth extract')
}

export async function resolveSpaceId(tokenV2: string, blockId: string): Promise<string> {
  const result = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'block', id: blockId }, version: -1 }],
  })) as { recordMap: { block: Record<string, Record<string, unknown>> } }

  const raw = Object.values(result.recordMap.block)[0] as Record<string, unknown> | undefined
  const outer = raw?.value as Record<string, unknown> | undefined
  const inner = typeof outer?.role === 'string' ? (outer.value as Record<string, unknown>) : outer
  const spaceId = (inner?.space_id as string) ?? (raw?.spaceId as string)
  if (!spaceId) {
    throw new Error(`Could not resolve space ID for block: ${blockId}`)
  }
  return spaceId
}

export function getAccountTokens(creds: NotionCredentials): Array<{ token_v2: string; user_id?: string }> {
  const tokens: Array<{ token_v2: string; user_id?: string }> = [{ token_v2: creds.token_v2, user_id: creds.user_id }]

  for (const account of creds.accounts ?? []) {
    if (tokens.some((t) => t.token_v2 === account.token_v2)) continue
    tokens.push({ token_v2: account.token_v2, user_id: account.user_id })
  }

  return tokens
}

// Targets the agent may hand us span across multiple Notion record tables:
// pages and blocks live in `block`, databases in `collection`, view IDs in
// `collection_view`. Probing all three in one request keeps auto-resolve
// correct without paying for three sequential round-trips.
const SPACE_ID_PROBE_TABLES = ['block', 'collection', 'collection_view'] as const

type ProbeOutcome = { spaceId?: string; error?: Error }

async function probeSpaceIdForToken(tokenV2: string, targetId: string): Promise<ProbeOutcome> {
  try {
    const result = (await internalRequest(tokenV2, 'syncRecordValues', {
      requests: SPACE_ID_PROBE_TABLES.map((table) => ({ pointer: { table, id: targetId }, version: -1 })),
    })) as { recordMap?: Record<string, Record<string, Record<string, unknown>> | undefined> }

    for (const table of SPACE_ID_PROBE_TABLES) {
      const records = result.recordMap?.[table]
      if (!records) continue
      const matched = records[targetId] ?? Object.values(records)[0]
      const outer = matched?.value as Record<string, unknown> | undefined
      const inner = typeof outer?.role === 'string' ? (outer.value as Record<string, unknown>) : outer
      const spaceId =
        (inner?.space_id as string) ?? ((matched as Record<string, unknown> | undefined)?.spaceId as string)
      if (spaceId) return { spaceId }
    }
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }
}

// `target` is inferred from the record's space_id: it proves API access to the
// record but NOT workspace membership (e.g. public pages), so callers must not
// treat a missing `target` workspace as an access failure.
export type WorkspaceSource = 'explicit' | 'target'

export type ResolvedWorkspaceContext = {
  workspaceId: string
  tokenV2: string
  userId?: string
  workspaceSource: WorkspaceSource
}

export async function resolveWorkspaceFromTarget(
  creds: NotionCredentials,
  targetId: string,
): Promise<ResolvedWorkspaceContext> {
  const normalizedId = formatNotionId(targetId)
  let lastError: Error | undefined
  for (const account of getAccountTokens(creds)) {
    const { spaceId, error } = await probeSpaceIdForToken(account.token_v2, normalizedId)
    if (spaceId) {
      return { workspaceId: spaceId, tokenV2: account.token_v2, userId: account.user_id, workspaceSource: 'target' }
    }
    if (error) lastError = error
  }
  const suffix = lastError ? ` Last error: ${lastError.message}` : ''
  throw new Error(
    `Could not auto-resolve --workspace-id for ${targetId}. Pass --workspace-id explicitly or run 'vibe-notion workspace resolve ${targetId}' to inspect.${suffix}`,
  )
}

export async function ensureWorkspaceContext(
  creds: NotionCredentials,
  workspaceId: string | undefined,
  targetId: string,
): Promise<ResolvedWorkspaceContext> {
  if (workspaceId) {
    return { workspaceId, tokenV2: creds.token_v2, userId: creds.user_id, workspaceSource: 'explicit' }
  }
  return resolveWorkspaceFromTarget(creds, targetId)
}

function extractSpaceViewPointers(entry: SpaceUserEntry, userId: string): SpaceViewPointer[] {
  const userRootRecord = (entry.user_root as Record<string, unknown> | undefined)?.[userId]
  if (!userRootRecord) return []
  const root = userRootRecord as Record<string, unknown>
  const outer = root.value as Record<string, unknown> | undefined
  if (!outer) return []
  const inner = typeof outer.role === 'string' ? (outer.value as Record<string, unknown>) : outer
  return (inner?.space_view_pointers as SpaceViewPointer[]) ?? []
}

export type ResolveActiveUserOptions = { warnIfMissing?: boolean }

export async function resolveAndSetActiveUserId(
  tokenV2: string,
  workspaceId?: string,
  options: ResolveActiveUserOptions = {},
): Promise<void> {
  if (!workspaceId) return

  if (!getActiveUserId()) {
    const manager = new CredentialManager()
    const creds = await manager.getCredentials()
    if (creds?.user_id) {
      setActiveUserId(creds.user_id)
    }
  }

  const response = (await internalRequest(tokenV2, 'getSpaces', {})) as GetSpacesResponse

  for (const [userId, entry] of Object.entries(response)) {
    if (entry.space && workspaceId in entry.space) {
      setActiveUserId(userId)
      setActiveSpaceId(workspaceId)
      return
    }
  }

  // Guest workspaces don't appear in entry.space; check space_view_pointers instead
  for (const [userId, entry] of Object.entries(response)) {
    const pointers = extractSpaceViewPointers(entry, userId)
    if (pointers.some((p) => p.spaceId === workspaceId)) {
      setActiveUserId(userId)
      setActiveSpaceId(workspaceId)
      return
    }
  }

  // A workspace auto-resolved from the target isn't expected to be a member
  // space (e.g. public pages), so warning there is a false alarm.
  if (options.warnIfMissing === false) return

  const memberIds = Object.values(response).flatMap((entry) => (entry.space ? Object.keys(entry.space) : []))
  const allPointerIds = Object.entries(response).flatMap(([userId, entry]) =>
    extractSpaceViewPointers(entry, userId).map((p) => p.spaceId),
  )
  const allIds = [...new Set([...memberIds, ...allPointerIds])]
  console.error(
    JSON.stringify({
      warning: `Workspace ${workspaceId} not found in your spaces`,
      available_workspace_ids: allIds,
      hint: 'Run: vibe-notion workspace list',
    }),
  )
}

export async function resolveDefaultTeamId(tokenV2: string, workspaceId: string): Promise<string | undefined> {
  const response = (await internalRequest(tokenV2, 'getSpaces', {})) as GetSpacesResponse

  for (const entry of Object.values(response)) {
    if (!entry.team) continue
    for (const team of Object.values(entry.team)) {
      const value = getRecordValue(team as unknown as Record<string, unknown>) as TeamRecord['value'] | undefined
      if (value?.space_id === workspaceId && value?.is_default) {
        return value.id
      }
    }
  }
  return undefined
}

export async function resolveCollectionViewId(tokenV2: string, collectionId: string): Promise<string> {
  const collResult = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'collection', id: collectionId }, version: -1 }],
  })) as { recordMap: { collection: Record<string, Record<string, unknown>> } }

  const collRaw = Object.values(collResult.recordMap.collection)[0]
  const coll = getRecordValue(collRaw) as { parent_id?: string } | undefined
  if (!coll?.parent_id) {
    throw new Error(`Collection not found: ${collectionId}`)
  }

  const parentId = coll.parent_id
  const blockResult = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'block', id: parentId }, version: -1 }],
  })) as { recordMap: { block: Record<string, Record<string, unknown>> } }

  const blockRaw = Object.values(blockResult.recordMap.block)[0]
  const parentBlock = getRecordValue(blockRaw) as { view_ids?: string[] } | undefined
  const viewId = parentBlock?.view_ids?.[0]
  if (!viewId) {
    throw new Error(`No views found for collection: ${collectionId}`)
  }
  return viewId
}

type UserRecord = { value?: { name?: string } }

export async function resolveBacklinkUsers(
  tokenV2: string,
  backlinksResponse: Record<string, unknown>,
): Promise<Record<string, string>> {
  const userIds = collectBacklinkUserIds(backlinksResponse)
  if (userIds.length === 0) return {}

  const response = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: userIds.map((id) => ({ pointer: { table: 'notion_user', id }, version: -1 })),
  })) as { recordMap: { notion_user?: Record<string, UserRecord> } }

  const lookup: Record<string, string> = {}
  const userMap = response.recordMap.notion_user ?? {}
  for (const [id, record] of Object.entries(userMap)) {
    const value = getRecordValue(record as unknown as Record<string, unknown>) as { name?: string } | undefined
    if (value?.name) {
      lookup[id] = value.name
    }
  }
  return lookup
}
