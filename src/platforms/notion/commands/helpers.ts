import { randomUUID } from 'node:crypto'
import { internalRequest } from '../client'
import { CredentialManager, type NotionCredentials } from '../credential-manager'

export type CommandOptions = { pretty?: boolean }

export function generateId(): string {
  return randomUUID()
}

export async function getCredentialsOrExit(): Promise<NotionCredentials> {
  const manager = new CredentialManager()
  const creds = await manager.getCredentials()
  if (!creds) {
    console.error(JSON.stringify({ error: 'Not authenticated. Run: agent-notion auth extract' }))
    process.exit(1)
  }
  return creds
}

export async function resolveSpaceId(tokenV2: string, blockId: string): Promise<string> {
  const result = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'block', id: blockId }, version: -1 }],
  })) as { recordMap: { block: Record<string, { value: { space_id: string } }> } }

  const block = Object.values(result.recordMap.block)[0]
  if (!block?.value?.space_id) {
    throw new Error(`Could not resolve space ID for block: ${blockId}`)
  }
  return block.value.space_id
}

export async function resolveCollectionViewId(tokenV2: string, collectionId: string): Promise<string> {
  const collResult = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'collection', id: collectionId }, version: -1 }],
  })) as { recordMap: { collection: Record<string, { value: { parent_id: string } }> } }

  const coll = Object.values(collResult.recordMap.collection)[0]
  if (!coll?.value?.parent_id) {
    throw new Error(`Collection not found: ${collectionId}`)
  }

  const parentId = coll.value.parent_id
  const blockResult = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'block', id: parentId }, version: -1 }],
  })) as { recordMap: { block: Record<string, { value: { view_ids?: string[] } }> } }

  const parentBlock = Object.values(blockResult.recordMap.block)[0]
  const viewId = parentBlock?.value?.view_ids?.[0]
  if (!viewId) {
    throw new Error(`No views found for collection: ${collectionId}`)
  }
  return viewId
}
