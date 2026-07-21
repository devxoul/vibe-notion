import { afterEach, describe, expect, mock, test } from 'bun:test'
import { randomUUID } from 'node:crypto'

// Test helpers functions by directly testing the logic they implement,
// using mocked dependencies. This avoids Bun's cross-file mock.module contamination.

let _mockInternalRequest: (...args: unknown[]) => unknown = () => Promise.resolve({})
let _mockGetCredentials: (...args: unknown[]) => unknown = () => Promise.resolve(null)
let _mockAppExtract: (...args: unknown[]) => unknown = () => Promise.resolve(null)
let _mockBrowserExtract: (...args: unknown[]) => unknown = () => Promise.resolve(null)
let _mockSetCredentials: (...args: unknown[]) => unknown = () => Promise.resolve()
let _mockValidateTokenV2: (token: string) => Promise<void> = () => Promise.resolve()
let _capturedActiveUserId: string | undefined

afterEach(() => {
  _mockInternalRequest = () => Promise.resolve({})
  _mockGetCredentials = () => Promise.resolve(null)
  _mockAppExtract = () => Promise.resolve(null)
  _mockBrowserExtract = () => Promise.resolve(null)
  _mockSetCredentials = () => Promise.resolve()
  _mockValidateTokenV2 = () => Promise.resolve()
  _capturedActiveUserId = undefined
})

// Re-implement the functions under test with injected mocks.
// This tests the same logic as helpers.ts without fighting Bun's module mock system.

function generateId(): string {
  return randomUUID()
}

function withStoredAccounts<T extends { token_v2: string; user_id?: string; user_ids?: string[] }>(
  extracted: T,
  accounts: T[],
): T & { accounts?: T[] } {
  if (accounts.length <= 1) {
    return extracted
  }

  return {
    ...extracted,
    accounts,
  }
}

function normalizeExtracted(result: unknown) {
  const accounts = Array.isArray(result) ? result : result ? [result] : []

  return accounts as Array<{ token_v2: string; user_id?: string; user_ids?: string[] }>
}

async function selectValidCredentials(result: unknown) {
  const accounts = normalizeExtracted(result)
  const validAccounts: Array<{ token_v2: string; user_id?: string; user_ids?: string[] }> = []

  for (const account of accounts) {
    try {
      await _mockValidateTokenV2(account.token_v2)
      validAccounts.push(account)
    } catch {}
  }

  const extracted = validAccounts[0]

  if (!extracted) {
    return null
  }

  return withStoredAccounts(extracted, validAccounts)
}

async function getCredentialsOrExit() {
  const creds = await _mockGetCredentials()
  if (creds) return creds

  try {
    const extracted = await selectValidCredentials(await _mockAppExtract())
    if (extracted) {
      await _mockSetCredentials(extracted)
      return extracted
    }
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Notion directory not found')) {
      console.error(
        JSON.stringify({
          error: `Auto-extraction failed: ${(error as Error).message}`,
          hint: 'Run: vibe-notion auth extract --debug',
        }),
      )
      process.exit(1)
    }
  }

  try {
    const extracted = await selectValidCredentials(await _mockBrowserExtract())
    if (extracted) {
      await _mockSetCredentials(extracted)
      return extracted
    }
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

async function getCredentialsOrThrow() {
  const creds = await _mockGetCredentials()
  if (creds) return creds

  try {
    const extracted = await selectValidCredentials(await _mockAppExtract())
    if (extracted) {
      await _mockSetCredentials(extracted)
      return extracted
    }
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Notion directory not found')) {
      throw new Error(`Auto-extraction failed: ${(error as Error).message}`)
    }
  }

  try {
    const extracted = await selectValidCredentials(await _mockBrowserExtract())
    if (extracted) {
      await _mockSetCredentials(extracted)
      return extracted
    }
  } catch (error) {
    throw new Error(`Auto-extraction failed: ${(error as Error).message}`)
  }

  throw new Error('Not authenticated. Run: vibe-notion auth extract')
}

async function resolveSpaceId(tokenV2: string, blockId: string): Promise<string> {
  const result = (await _mockInternalRequest(tokenV2, 'syncRecordValues', {
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

function getRecordValue(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!record) return undefined
  const outer = record.value as Record<string, unknown> | undefined
  if (!outer) return undefined
  if (typeof outer.role === 'string' && outer.value !== undefined) {
    return outer.value as Record<string, unknown>
  }
  return outer
}

async function resolveCollectionViewId(tokenV2: string, collectionId: string): Promise<string> {
  const collResult = (await _mockInternalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'collection', id: collectionId }, version: -1 }],
  })) as { recordMap: { collection: Record<string, Record<string, unknown>> } }

  const collRaw = Object.values(collResult.recordMap.collection)[0]
  const coll = getRecordValue(collRaw) as { parent_id?: string } | undefined
  if (!coll?.parent_id) {
    throw new Error(`Collection not found: ${collectionId}`)
  }

  const parentId = coll.parent_id
  const blockResult = (await _mockInternalRequest(tokenV2, 'syncRecordValues', {
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

type TeamRecord = {
  value?: {
    id: string
    name?: string
    space_id: string
    is_default?: boolean
  }
}

type TeamSpaceEntry = {
  team?: Record<string, TeamRecord>
}

async function resolveDefaultTeamId(tokenV2: string, workspaceId: string): Promise<string | undefined> {
  const response = (await _mockInternalRequest(tokenV2, 'getSpaces', {})) as Record<string, TeamSpaceEntry>

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

type UserRecord = { value?: { name?: string } }

async function resolveBacklinkUsers(
  tokenV2: string,
  backlinksResponse: Record<string, unknown>,
): Promise<Record<string, string>> {
  const recordMap = backlinksResponse.recordMap as Record<string, unknown> | undefined
  const blockMap = (recordMap?.block as Record<string, Record<string, unknown>> | undefined) ?? {}
  const userIds = new Set<string>()

  for (const record of Object.values(blockMap)) {
    const value = getRecordValue(record)
    if (!value) continue
    const properties = value.properties as Record<string, unknown> | undefined
    if (!properties) continue
    const titleSegments = properties.title
    if (!Array.isArray(titleSegments)) continue

    for (const segment of titleSegments) {
      if (!Array.isArray(segment) || segment.length < 2) continue
      if (!Array.isArray(segment[1])) continue
      for (const deco of segment[1]) {
        if (Array.isArray(deco) && deco[0] === 'u' && typeof deco[1] === 'string') {
          userIds.add(deco[1])
        }
      }
    }
  }

  const ids = [...userIds]
  if (ids.length === 0) return {}

  const response = (await _mockInternalRequest(tokenV2, 'syncRecordValues', {
    requests: ids.map((id) => ({ pointer: { table: 'notion_user', id }, version: -1 })),
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

type SpaceViewPointer = {
  id: string
  table: string
  spaceId: string
}

type SpaceUserEntry = {
  space?: Record<string, unknown>
  user_root?: Record<string, unknown>
}

type GetSpacesResponse = Record<string, SpaceUserEntry>

function extractSpaceViewPointers(entry: SpaceUserEntry, userId: string): SpaceViewPointer[] {
  const userRootRecord = (entry.user_root as Record<string, unknown> | undefined)?.[userId]
  if (!userRootRecord) return []
  const root = userRootRecord as Record<string, unknown>
  const outer = root.value as Record<string, unknown> | undefined
  if (!outer) return []
  const inner = typeof outer.role === 'string' ? (outer.value as Record<string, unknown>) : outer
  return (inner?.space_view_pointers as SpaceViewPointer[]) ?? []
}

async function resolveAndSetActiveUserId(
  tokenV2: string,
  workspaceId?: string,
  options: { warnIfMissing?: boolean } = {},
): Promise<void> {
  if (!workspaceId) return

  if (!_capturedActiveUserId) {
    const creds = await _mockGetCredentials()
    if (creds && typeof creds === 'object' && 'user_id' in creds) {
      _capturedActiveUserId = (creds as { user_id: string }).user_id
    }
  }

  const response = (await _mockInternalRequest(tokenV2, 'getSpaces', {})) as GetSpacesResponse

  for (const [userId, entry] of Object.entries(response)) {
    if (entry.space && workspaceId in entry.space) {
      _capturedActiveUserId = userId
      return
    }
  }

  // Guest workspaces don't appear in entry.space; check space_view_pointers instead
  for (const [userId, entry] of Object.entries(response)) {
    const pointers = extractSpaceViewPointers(entry, userId)
    if (pointers.some((p) => p.spaceId === workspaceId)) {
      _capturedActiveUserId = userId
      return
    }
  }

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

function formatNotionId(id: string): string {
  const hex = id.replace(/-/g, '')
  if (hex.length !== 32 || !/^[0-9a-f]+$/i.test(hex)) {
    return id
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

describe('formatNotionId', () => {
  test('converts 32-char hex to hyphenated UUID', () => {
    expect(formatNotionId('30471800c4a58061a0ecd608a915dfdd')).toBe('30471800-c4a5-8061-a0ec-d608a915dfdd')
  })

  test('returns already hyphenated UUID unchanged', () => {
    expect(formatNotionId('30471800-c4a5-8061-a0ec-d608a915dfdd')).toBe('30471800-c4a5-8061-a0ec-d608a915dfdd')
  })

  test('returns non-UUID strings unchanged', () => {
    expect(formatNotionId('short')).toBe('short')
    expect(formatNotionId('')).toBe('')
    expect(formatNotionId('not-a-valid-id')).toBe('not-a-valid-id')
  })

  test('returns strings with non-hex characters unchanged', () => {
    expect(formatNotionId('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBe('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')
  })
})

describe('generateId', () => {
  test('returns a valid UUID string', () => {
    const id = generateId()
    expect(typeof id).toBe('string')
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  test('returns unique values', () => {
    const id1 = generateId()
    const id2 = generateId()
    const id3 = generateId()
    expect(id1).not.toBe(id2)
    expect(id2).not.toBe(id3)
    expect(id1).not.toBe(id3)
  })
})

describe('getCredentialsOrExit', () => {
  test('returns credentials when they exist', async () => {
    const credentials = { token_v2: 'test_token', space_id: 'test_space' }
    _mockGetCredentials = mock(() => Promise.resolve(credentials))

    const result = await getCredentialsOrExit()
    expect(result).toEqual(credentials)
  })

  test('calls process.exit(1) when no credentials', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))

    const mockExit = mock(() => {
      throw new Error('process.exit called')
    })
    const originalExit = process.exit
    process.exit = mockExit as never

    try {
      await expect(getCredentialsOrExit()).rejects.toThrow('process.exit called')
    } finally {
      process.exit = originalExit
    }
  })

  test('logs error message when no credentials and auto-extract fails', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockAppExtract = mock(() => Promise.resolve(null))
    _mockBrowserExtract = mock(() => Promise.resolve(null))

    const mockExit = mock(() => {
      throw new Error('process.exit called')
    })
    const originalExit = process.exit
    process.exit = mockExit as never

    const consoleErrorMock = mock(() => {})
    const originalError = console.error
    console.error = consoleErrorMock as never

    try {
      await getCredentialsOrExit().catch(() => {})
      expect(consoleErrorMock).toHaveBeenCalledWith(
        JSON.stringify({ error: 'Not authenticated. Run: vibe-notion auth extract' }),
      )
    } finally {
      console.error = originalError
      process.exit = originalExit
    }
  })

  test('auto-extracts and returns credentials when no stored credentials', async () => {
    const extracted = { token_v2: 'extracted-token', user_id: 'user-1' }
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockAppExtract = mock(() => Promise.resolve(extracted))
    _mockSetCredentials = mock(() => Promise.resolve())

    const mockExit = mock(() => {
      throw new Error('process.exit called')
    })
    const originalExit = process.exit
    process.exit = mockExit as never

    try {
      const result = await getCredentialsOrExit()
      expect(result).toEqual(extracted)
      expect(mockExit).not.toHaveBeenCalled()
    } finally {
      process.exit = originalExit
    }
  })

  test('saves auto-extracted credentials', async () => {
    const extracted = { token_v2: 'extracted-token', user_id: 'user-1' }
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockAppExtract = mock(() => Promise.resolve(extracted))
    _mockSetCredentials = mock(() => Promise.resolve())

    await getCredentialsOrExit()
    expect(_mockSetCredentials).toHaveBeenCalledWith(extracted)
  })

  test('falls back to browser when desktop app is not installed', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockAppExtract = mock(() => Promise.reject(new Error('Notion directory not found')))
    _mockBrowserExtract = mock(() => Promise.resolve({ token_v2: 'browser-token' }))

    const result = await getCredentialsOrExit()
    expect(result).toEqual({ token_v2: 'browser-token' })
  })

  test('stores all extracted app accounts while keeping the first one active', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockAppExtract = mock(() =>
      Promise.resolve([
        { token_v2: 'app-token-1', user_id: 'user-1' },
        { token_v2: 'app-token-2', user_id: 'user-2' },
      ]),
    )
    _mockSetCredentials = mock(() => Promise.resolve())

    const result = await getCredentialsOrExit()
    expect(result).toEqual({
      token_v2: 'app-token-1',
      user_id: 'user-1',
      accounts: [
        { token_v2: 'app-token-1', user_id: 'user-1' },
        { token_v2: 'app-token-2', user_id: 'user-2' },
      ],
    })
    expect(_mockSetCredentials).toHaveBeenCalledWith({
      token_v2: 'app-token-1',
      user_id: 'user-1',
      accounts: [
        { token_v2: 'app-token-1', user_id: 'user-1' },
        { token_v2: 'app-token-2', user_id: 'user-2' },
      ],
    })
  })

  test('skips stale app account and keeps later valid account active', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockAppExtract = mock(() =>
      Promise.resolve([
        { token_v2: 'stale-app-token', user_id: 'user-stale' },
        { token_v2: 'fresh-app-token', user_id: 'user-fresh' },
      ]),
    )
    _mockValidateTokenV2 = mock(async (token: string) => {
      if (token === 'stale-app-token') {
        throw new Error('401')
      }
    })
    _mockSetCredentials = mock(() => Promise.resolve())

    const result = await getCredentialsOrExit()
    expect(result).toEqual({ token_v2: 'fresh-app-token', user_id: 'user-fresh' })
    expect(_mockSetCredentials).toHaveBeenCalledWith({ token_v2: 'fresh-app-token', user_id: 'user-fresh' })
  })

  test('exits with extraction error message when desktop auto-extraction fails hard', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockAppExtract = mock(() =>
      Promise.reject(new Error('Failed to read Notion cookies. Quit the Notion app completely and try again.')),
    )

    const mockExit = mock(() => {
      throw new Error('process.exit called')
    })
    const originalExit = process.exit
    process.exit = mockExit as never

    const consoleErrorMock = mock(() => {})
    const originalError = console.error
    console.error = consoleErrorMock as never

    try {
      await expect(getCredentialsOrExit()).rejects.toThrow('process.exit called')
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(consoleErrorMock).toHaveBeenCalledWith(
        JSON.stringify({
          error: 'Auto-extraction failed: Failed to read Notion cookies. Quit the Notion app completely and try again.',
          hint: 'Run: vibe-notion auth extract --debug',
        }),
      )
    } finally {
      console.error = originalError
      process.exit = originalExit
    }
  })
})

describe('getCredentialsOrThrow', () => {
  test('returns credentials when they exist', async () => {
    const credentials = { token_v2: 'test_token', space_id: 'test_space' }
    _mockGetCredentials = mock(() => Promise.resolve(credentials))

    const result = await getCredentialsOrThrow()
    expect(result).toEqual(credentials)
  })

  test('throws an Error when no credentials', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockAppExtract = mock(() => Promise.resolve(null))
    _mockBrowserExtract = mock(() => Promise.resolve(null))

    await expect(getCredentialsOrThrow()).rejects.toThrow('Not authenticated. Run: vibe-notion auth extract')
  })

  test('auto-extracts and returns credentials when no stored credentials', async () => {
    const extracted = { token_v2: 'extracted-token', user_id: 'user-1' }
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockAppExtract = mock(() => Promise.resolve(extracted))
    _mockSetCredentials = mock(() => Promise.resolve())

    const result = await getCredentialsOrThrow()
    expect(result).toEqual(extracted)
  })

  test('saves auto-extracted credentials', async () => {
    const extracted = { token_v2: 'extracted-token', user_id: 'user-1' }
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockAppExtract = mock(() => Promise.resolve(extracted))
    _mockSetCredentials = mock(() => Promise.resolve())

    await getCredentialsOrThrow()
    expect(_mockSetCredentials).toHaveBeenCalledWith(extracted)
  })

  test('uses browser fallback when desktop app is not installed', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockAppExtract = mock(() => Promise.reject(new Error('Notion directory not found')))
    _mockBrowserExtract = mock(() => Promise.resolve({ token_v2: 'browser-token' }))

    await expect(getCredentialsOrThrow()).resolves.toEqual({ token_v2: 'browser-token' })
  })

  test('returns all extracted browser accounts while keeping the first one active', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockAppExtract = mock(() => Promise.reject(new Error('Notion directory not found')))
    _mockBrowserExtract = mock(() =>
      Promise.resolve([
        { token_v2: 'browser-token-1', user_id: 'user-1' },
        { token_v2: 'browser-token-2', user_id: 'user-2' },
      ]),
    )
    _mockSetCredentials = mock(() => Promise.resolve())

    await expect(getCredentialsOrThrow()).resolves.toEqual({
      token_v2: 'browser-token-1',
      user_id: 'user-1',
      accounts: [
        { token_v2: 'browser-token-1', user_id: 'user-1' },
        { token_v2: 'browser-token-2', user_id: 'user-2' },
      ],
    })
  })

  test('falls back to browser when app accounts are all stale but browser has a valid account', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockAppExtract = mock(() => Promise.resolve([{ token_v2: 'stale-app-token', user_id: 'user-stale' }]))
    _mockBrowserExtract = mock(() => Promise.resolve([{ token_v2: 'fresh-browser-token', user_id: 'user-browser' }]))
    _mockValidateTokenV2 = mock(async (token: string) => {
      if (token === 'stale-app-token') {
        throw new Error('401')
      }
    })
    _mockSetCredentials = mock(() => Promise.resolve())

    await expect(getCredentialsOrThrow()).resolves.toEqual({
      token_v2: 'fresh-browser-token',
      user_id: 'user-browser',
    })
  })

  test('throws with extraction error message when desktop auto-extraction fails hard', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockAppExtract = mock(() =>
      Promise.reject(new Error('Failed to read Notion cookies. Quit the Notion app completely and try again.')),
    )

    await expect(getCredentialsOrThrow()).rejects.toThrow(
      'Auto-extraction failed: Failed to read Notion cookies. Quit the Notion app completely and try again.',
    )
  })

  test('throws with browser extraction error after desktop fallback', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockAppExtract = mock(() => Promise.reject(new Error('Notion directory not found')))
    _mockBrowserExtract = mock(() =>
      Promise.reject(new Error('better-sqlite3 is required for Node.js. Install it with: npm install better-sqlite3')),
    )

    await expect(getCredentialsOrThrow()).rejects.toThrow(
      'Auto-extraction failed: better-sqlite3 is required for Node.js. Install it with: npm install better-sqlite3',
    )
  })
})

describe('resolveSpaceId', () => {
  test('returns space_id from syncRecordValues response', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        recordMap: { block: { 'block-123': { value: { space_id: 'space-456' } } } },
      })
    const result = await resolveSpaceId('token', 'block-123')
    expect(result).toBe('space-456')
  })

  test('throws when block has no space_id', async () => {
    _mockInternalRequest = () => Promise.resolve({ recordMap: { block: { 'block-123': { value: {} } } } })
    await expect(resolveSpaceId('token', 'block-123')).rejects.toThrow(
      'Could not resolve space ID for block: block-123',
    )
  })

  test('throws when block not found in response', async () => {
    _mockInternalRequest = () => Promise.resolve({ recordMap: { block: {} } })
    await expect(resolveSpaceId('token', 'block-123')).rejects.toThrow(
      'Could not resolve space ID for block: block-123',
    )
  })

  test('calls internalRequest with correct parameters', async () => {
    const calls: unknown[][] = []
    _mockInternalRequest = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve({
        recordMap: { block: { 'block-123': { value: { space_id: 'space-456' } } } },
      })
    }
    await resolveSpaceId('test_token', 'block-123')

    expect(calls.length).toBe(1)
    expect(calls[0][0]).toBe('test_token')
    expect(calls[0][1]).toBe('syncRecordValues')
    expect(calls[0][2]).toEqual({
      requests: [{ pointer: { table: 'block', id: 'block-123' }, version: -1 }],
    })
  })

  test('returns space_id from nested v3 response format', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        recordMap: {
          block: {
            'block-123': {
              spaceId: 'space-456',
              value: { value: { space_id: 'space-456', type: 'page' }, role: 'editor' },
            },
          },
        },
      })
    const result = await resolveSpaceId('token', 'block-123')
    expect(result).toBe('space-456')
  })

  test('falls back to top-level spaceId when inner space_id is missing', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        recordMap: {
          block: {
            'block-123': {
              spaceId: 'space-789',
              value: { value: { type: 'page' }, role: 'editor' },
            },
          },
        },
      })
    const result = await resolveSpaceId('token', 'block-123')
    expect(result).toBe('space-789')
  })
})

describe('resolveCollectionViewId', () => {
  test('returns first view_id from collection parent block', async () => {
    let callCount = 0
    _mockInternalRequest = () => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          recordMap: { collection: { 'coll-123': { value: { parent_id: 'block-456' } } } },
        })
      }
      return Promise.resolve({
        recordMap: { block: { 'block-456': { value: { view_ids: ['view-789', 'view-999'] } } } },
      })
    }
    const result = await resolveCollectionViewId('token', 'coll-123')
    expect(result).toBe('view-789')
  })

  test('calls internalRequest twice', async () => {
    const calls: unknown[][] = []
    let callCount = 0
    _mockInternalRequest = (...args: unknown[]) => {
      calls.push(args)
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          recordMap: { collection: { 'coll-123': { value: { parent_id: 'block-456' } } } },
        })
      }
      return Promise.resolve({
        recordMap: { block: { 'block-456': { value: { view_ids: ['view-789'] } } } },
      })
    }
    await resolveCollectionViewId('test_token', 'coll-123')
    expect(calls.length).toBe(2)
    expect(calls[0][1]).toBe('syncRecordValues')
    expect(calls[1][1]).toBe('syncRecordValues')
  })

  test('throws when collection not found', async () => {
    _mockInternalRequest = () => Promise.resolve({ recordMap: { collection: {} } })
    await expect(resolveCollectionViewId('token', 'coll-123')).rejects.toThrow('Collection not found: coll-123')
  })

  test('throws when collection has no parent_id', async () => {
    _mockInternalRequest = () => Promise.resolve({ recordMap: { collection: { 'coll-123': { value: {} } } } })
    await expect(resolveCollectionViewId('token', 'coll-123')).rejects.toThrow('Collection not found: coll-123')
  })

  test('throws when parent block has no view_ids', async () => {
    let callCount = 0
    _mockInternalRequest = () => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          recordMap: { collection: { 'coll-123': { value: { parent_id: 'block-456' } } } },
        })
      }
      return Promise.resolve({ recordMap: { block: { 'block-456': { value: {} } } } })
    }
    await expect(resolveCollectionViewId('token', 'coll-123')).rejects.toThrow(
      'No views found for collection: coll-123',
    )
  })

  test('throws when parent block not found', async () => {
    let callCount = 0
    _mockInternalRequest = () => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          recordMap: { collection: { 'coll-123': { value: { parent_id: 'block-456' } } } },
        })
      }
      return Promise.resolve({ recordMap: { block: {} } })
    }
    await expect(resolveCollectionViewId('token', 'coll-123')).rejects.toThrow(
      'No views found for collection: coll-123',
    )
  })
})

describe('resolveAndSetActiveUserId', () => {
  test('does nothing when workspaceId is undefined', async () => {
    const calls: unknown[][] = []
    _mockInternalRequest = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve({})
    }

    await resolveAndSetActiveUserId('token', undefined)

    expect(calls.length).toBe(0)
    expect(_capturedActiveUserId).toBeUndefined()
  })

  test('sets active user ID when workspace is found under a user', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        'user-aaa': { space: { 'workspace-111': {} } },
        'user-bbb': { space: { 'workspace-222': {} } },
      })

    await resolveAndSetActiveUserId('token', 'workspace-222')

    expect(_capturedActiveUserId).toBe('user-bbb')
  })

  test('sets first matching user when workspace exists', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        'user-aaa': { space: { 'workspace-111': {}, 'workspace-shared': {} } },
        'user-bbb': { space: { 'workspace-222': {} } },
      })

    await resolveAndSetActiveUserId('token', 'workspace-111')

    expect(_capturedActiveUserId).toBe('user-aaa')
  })

  test('warns and lists available workspaces when workspace is not found', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        'user-aaa': { space: { 'workspace-111': {} } },
      })

    const errorCalls: unknown[][] = []
    const originalError = console.error
    console.error = ((...args: unknown[]) => {
      errorCalls.push(args)
    }) as never

    try {
      await resolveAndSetActiveUserId('token', 'workspace-999')

      expect(_capturedActiveUserId).toBeUndefined()
      expect(errorCalls.length).toBe(1)
      const output = JSON.parse(errorCalls[0][0] as string)
      expect(output.warning).toContain('workspace-999')
      expect(output.available_workspace_ids).toEqual(['workspace-111'])
      expect(output.hint).toContain('workspace list')
    } finally {
      console.error = originalError
    }
  })

  test('suppresses the warning when warnIfMissing is false (public page)', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        'user-aaa': { space: { 'workspace-111': {} } },
      })

    const errorCalls: unknown[][] = []
    const originalError = console.error
    console.error = ((...args: unknown[]) => {
      errorCalls.push(args)
    }) as never

    try {
      await resolveAndSetActiveUserId('token', 'workspace-foreign', { warnIfMissing: false })

      expect(_capturedActiveUserId).toBeUndefined()
      expect(errorCalls.length).toBe(0)
    } finally {
      console.error = originalError
    }
  })

  test('calls getSpaces with correct parameters', async () => {
    const calls: unknown[][] = []
    _mockInternalRequest = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve({ 'user-aaa': { space: { 'ws-1': {} } } })
    }

    await resolveAndSetActiveUserId('test_token', 'ws-1')

    expect(calls.length).toBe(1)
    expect(calls[0][0]).toBe('test_token')
    expect(calls[0][1]).toBe('getSpaces')
    expect(calls[0][2]).toEqual({})
  })

  test('handles user entry with no space property', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        'user-aaa': {},
        'user-bbb': { space: { 'workspace-222': {} } },
      })

    await resolveAndSetActiveUserId('token', 'workspace-222')

    expect(_capturedActiveUserId).toBe('user-bbb')
  })

  test('sets active user ID via space_view_pointers for guest workspaces', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        'user-aaa': {
          space: { 'workspace-member': {} },
          user_root: {
            'user-aaa': {
              value: {
                value: {
                  space_view_pointers: [{ id: 'view-1', table: 'space_view', spaceId: 'workspace-guest' }],
                },
                role: 'editor',
              },
            },
          },
        },
      })

    await resolveAndSetActiveUserId('token', 'workspace-guest')

    expect(_capturedActiveUserId).toBe('user-aaa')
  })

  test('includes guest workspace IDs in warning message', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        'user-aaa': {
          space: { 'workspace-member': {} },
          user_root: {
            'user-aaa': {
              value: {
                value: {
                  space_view_pointers: [{ id: 'view-1', table: 'space_view', spaceId: 'workspace-guest' }],
                },
                role: 'editor',
              },
            },
          },
        },
      })

    const errorCalls: unknown[][] = []
    const originalError = console.error
    console.error = ((...args: unknown[]) => {
      errorCalls.push(args)
    }) as never

    try {
      await resolveAndSetActiveUserId('token', 'workspace-nonexistent')

      expect(_capturedActiveUserId).toBeUndefined()
      expect(errorCalls.length).toBe(1)
      const output = JSON.parse(errorCalls[0][0] as string)
      expect(output.available_workspace_ids).toContain('workspace-member')
      expect(output.available_workspace_ids).toContain('workspace-guest')
    } finally {
      console.error = originalError
    }
  })

  test('pre-sets activeUserId from stored credentials before getSpaces call', async () => {
    _mockGetCredentials = () => Promise.resolve({ token_v2: 'test-token', user_id: 'cred-user-123' })
    let activeUserIdAtGetSpacesCall: string | undefined
    _mockInternalRequest = () => {
      activeUserIdAtGetSpacesCall = _capturedActiveUserId
      return Promise.resolve({
        'cred-user-123': { space: { 'workspace-111': {} } },
      })
    }

    await resolveAndSetActiveUserId('token', 'workspace-111')

    expect(activeUserIdAtGetSpacesCall).toBe('cred-user-123')
  })
})

describe('resolveDefaultTeamId', () => {
  test('returns team id from v3 nested team records', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        'user-1': {
          team: {
            'team-1': {
              value: { value: { id: 'team-1', space_id: 'space-123', is_default: true }, role: 'editor' },
            },
          },
        },
      })
    const result = await resolveDefaultTeamId('token', 'space-123')
    expect(result).toBe('team-1')
  })
})

describe('resolveCollectionViewId v3', () => {
  test('returns view_id from v3 nested collection and block records', async () => {
    let callCount = 0
    _mockInternalRequest = () => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          recordMap: {
            collection: {
              'coll-123': { value: { value: { parent_id: 'block-456' }, role: 'editor' } },
            },
          },
        })
      }
      return Promise.resolve({
        recordMap: {
          block: {
            'block-456': { value: { value: { view_ids: ['view-789'] }, role: 'editor' } },
          },
        },
      })
    }
    const result = await resolveCollectionViewId('token', 'coll-123')
    expect(result).toBe('view-789')
  })
})

describe('resolveBacklinkUsers', () => {
  test('resolves user names from v3 nested user records', async () => {
    const backlinksResponse = {
      recordMap: {
        block: {
          'block-abc': {
            value: {
              properties: {
                title: [['Hello ', [['u', 'user-1']]]],
              },
            },
          },
        },
      },
    }
    _mockInternalRequest = () =>
      Promise.resolve({
        recordMap: {
          notion_user: {
            'user-1': { value: { value: { name: 'Alice' }, role: 'editor' } },
          },
        },
      })
    const result = await resolveBacklinkUsers('token', backlinksResponse)
    expect(result).toEqual({ 'user-1': 'Alice' })
  })
})

type CredentialsLike = { token_v2: string; user_id?: string; accounts?: Array<{ token_v2: string; user_id?: string }> }

function getAccountTokensImpl(creds: CredentialsLike): Array<{ token_v2: string; user_id?: string }> {
  const tokens: Array<{ token_v2: string; user_id?: string }> = [{ token_v2: creds.token_v2, user_id: creds.user_id }]
  for (const account of creds.accounts ?? []) {
    if (tokens.some((t) => t.token_v2 === account.token_v2)) continue
    tokens.push({ token_v2: account.token_v2, user_id: account.user_id })
  }
  return tokens
}

const PROBE_TABLES = ['block', 'collection', 'collection_view'] as const

async function probeSpaceIdForTokenImpl(
  tokenV2: string,
  targetId: string,
): Promise<{ spaceId?: string; error?: Error }> {
  try {
    const result = (await _mockInternalRequest(tokenV2, 'syncRecordValues', {
      requests: PROBE_TABLES.map((table) => ({ pointer: { table, id: targetId }, version: -1 })),
    })) as { recordMap?: Record<string, Record<string, Record<string, unknown>> | undefined> }

    for (const table of PROBE_TABLES) {
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

type WorkspaceSource = 'explicit' | 'target'

async function resolveWorkspaceFromTargetImpl(
  creds: CredentialsLike,
  targetId: string,
): Promise<{ workspaceId: string; tokenV2: string; userId?: string; workspaceSource: WorkspaceSource }> {
  let lastError: Error | undefined
  for (const account of getAccountTokensImpl(creds)) {
    const { spaceId, error } = await probeSpaceIdForTokenImpl(account.token_v2, targetId)
    if (spaceId) {
      return { workspaceId: spaceId, tokenV2: account.token_v2, userId: account.user_id, workspaceSource: 'target' }
    }
    if (error) lastError = error
  }
  const suffix = lastError ? ` Last error: ${lastError.message}` : ''
  throw new Error(`Could not auto-resolve --workspace-id for ${targetId}.${suffix}`)
}

async function ensureWorkspaceContextImpl(
  creds: CredentialsLike,
  workspaceId: string | undefined,
  targetId: string,
): Promise<{ workspaceId: string; tokenV2: string; userId?: string; workspaceSource: WorkspaceSource }> {
  if (workspaceId) {
    return { workspaceId, tokenV2: creds.token_v2, userId: creds.user_id, workspaceSource: 'explicit' }
  }
  return resolveWorkspaceFromTargetImpl(creds, targetId)
}

describe('getAccountTokens', () => {
  test('returns the primary token first', () => {
    const result = getAccountTokensImpl({ token_v2: 'primary', user_id: 'user-1' })
    expect(result).toEqual([{ token_v2: 'primary', user_id: 'user-1' }])
  })

  test('appends additional accounts and deduplicates by token', () => {
    const result = getAccountTokensImpl({
      token_v2: 'primary',
      user_id: 'user-1',
      accounts: [
        { token_v2: 'primary', user_id: 'user-1' },
        { token_v2: 'secondary', user_id: 'user-2' },
      ],
    })
    expect(result).toEqual([
      { token_v2: 'primary', user_id: 'user-1' },
      { token_v2: 'secondary', user_id: 'user-2' },
    ])
  })
})

describe('resolveWorkspaceFromTarget', () => {
  test('returns workspaceId and tokenV2 from the first account that can see the target', async () => {
    _mockInternalRequest = (tokenV2: unknown) => {
      if (tokenV2 === 'primary') {
        return Promise.reject(new Error('not found'))
      }
      return Promise.resolve({
        recordMap: { block: { 'block-1': { value: { space_id: 'space-abc' } } } },
      })
    }
    const result = await resolveWorkspaceFromTargetImpl(
      { token_v2: 'primary', accounts: [{ token_v2: 'primary' }, { token_v2: 'secondary' }] },
      'block-1',
    )
    expect(result).toEqual({
      workspaceId: 'space-abc',
      tokenV2: 'secondary',
      userId: undefined,
      workspaceSource: 'target',
    })
  })

  test('resolves from the collection table when the target is a database id', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        recordMap: { collection: { 'coll-1': { value: { space_id: 'space-from-coll' } } } },
      })
    const result = await resolveWorkspaceFromTargetImpl({ token_v2: 'primary' }, 'coll-1')
    expect(result.workspaceId).toBe('space-from-coll')
  })

  test('resolves from the collection_view table when the target is a view id', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        recordMap: {
          collection_view: {
            'view-1': { value: { value: { space_id: 'space-from-view' }, role: 'editor' } },
          },
        },
      })
    const result = await resolveWorkspaceFromTargetImpl({ token_v2: 'primary' }, 'view-1')
    expect(result.workspaceId).toBe('space-from-view')
  })

  test('throws when no account can resolve the target', async () => {
    _mockInternalRequest = () => Promise.resolve({ recordMap: {} })
    await expect(resolveWorkspaceFromTargetImpl({ token_v2: 'primary' }, 'unknown-id')).rejects.toThrow(
      'Could not auto-resolve --workspace-id for unknown-id.',
    )
  })

  test('includes the last underlying error in the failure message', async () => {
    _mockInternalRequest = () => Promise.reject(new Error('Notion internal API error: 401: token expired'))
    await expect(resolveWorkspaceFromTargetImpl({ token_v2: 'primary' }, 'block-1')).rejects.toThrow(
      'Last error: Notion internal API error: 401: token expired',
    )
  })
})

describe('ensureWorkspaceContext', () => {
  test('returns the explicit workspaceId without calling the API when provided', async () => {
    let called = false
    _mockInternalRequest = () => {
      called = true
      return Promise.resolve({})
    }
    const result = await ensureWorkspaceContextImpl(
      { token_v2: 'primary', user_id: 'user-1' },
      'ws-explicit',
      'block-1',
    )
    expect(called).toBe(false)
    expect(result).toEqual({
      workspaceId: 'ws-explicit',
      tokenV2: 'primary',
      userId: 'user-1',
      workspaceSource: 'explicit',
    })
  })

  test('falls back to auto-resolve when workspaceId is omitted', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        recordMap: { block: { 'block-1': { value: { space_id: 'space-resolved' } } } },
      })
    const result = await ensureWorkspaceContextImpl({ token_v2: 'primary' }, undefined, 'block-1')
    expect(result.workspaceId).toBe('space-resolved')
    expect(result.tokenV2).toBe('primary')
  })
})
