import { Command } from 'commander'
import { internalRequest } from '@/platforms/notion/client'
import { formatBlockChildren, formatBlockValue } from '@/platforms/notion/formatters'
import { formatNotionId } from '@/shared/utils/id'
import { formatOutput } from '@/shared/utils/output'
import {
  type CommandOptions,
  generateId,
  getCredentialsOrExit,
  resolveAndSetActiveUserId,
  resolveSpaceId,
} from './helpers'

type WorkspaceOptions = CommandOptions & { workspaceId: string }

type BlockValue = {
  id: string
  version: number
  type: string
  properties?: Record<string, unknown>
  content?: string[]
  parent_id?: string
  parent_table?: string
  alive?: boolean
  space_id?: string
  created_time?: number
  last_edited_time?: number
  created_by_id?: string
  last_edited_by_id?: string
  [key: string]: unknown
}

type BlockRecord = {
  value?: BlockValue
  role: string
}

type SyncRecordValuesResponse = {
  recordMap: {
    block: Record<string, BlockRecord>
  }
}

type LoadPageChunkResponse = {
  cursor: {
    stack: unknown[]
  }
  recordMap: {
    block: Record<string, BlockRecord>
  }
}

type SaveOperation = {
  pointer: {
    table: 'block'
    id: string
    spaceId: string
  }
  command: 'set' | 'listAfter' | 'update' | 'listRemove'
  path: string[]
  args: Record<string, unknown>
}

type SaveTransactionsRequest = {
  requestId: string
  transactions: Array<{
    id: string
    spaceId: string
    operations: SaveOperation[]
  }>
}

type ChildListOptions = WorkspaceOptions & {
  limit?: string
}

type AppendOptions = WorkspaceOptions & {
  content: string
}

type UpdateOptions = WorkspaceOptions & {
  content: string
}

type BlockDefinition = {
  type: string
  properties?: Record<string, unknown>
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function parseBlockDefinitions(content: string): BlockDefinition[] {
  const parsed = JSON.parse(content) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('Content must be a JSON array of block definitions')
  }

  return parsed.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Each block definition must be an object')
    }

    const def = item as Record<string, unknown>
    if (typeof def.type !== 'string' || !def.type.trim()) {
      throw new Error('Each block definition must include a non-empty string type')
    }

    if (
      def.properties !== undefined &&
      (typeof def.properties !== 'object' || def.properties === null || Array.isArray(def.properties))
    ) {
      throw new Error('Block definition properties must be an object when provided')
    }

    return {
      type: def.type,
      properties: def.properties as Record<string, unknown> | undefined,
    }
  })
}

function parseUpdateContent(content: string): Record<string, unknown> {
  const parsed = JSON.parse(content) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Content must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

function getBlockById(blockMap: Record<string, BlockRecord>, blockId: string): BlockValue | undefined {
  const direct = blockMap[blockId]?.value
  if (direct) {
    return direct
  }

  return Object.values(blockMap).find((record) => record.value?.id === blockId)?.value
}

function assertBlock(block: BlockValue | undefined, blockId: string): BlockValue {
  if (!block) {
    throw new Error(`Block not found: ${blockId}`)
  }
  return block
}

async function getAction(rawBlockId: string, options: WorkspaceOptions): Promise<void> {
  const blockId = formatNotionId(rawBlockId)
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
    const response = (await internalRequest(creds.token_v2, 'syncRecordValues', {
      requests: [{ pointer: { table: 'block', id: blockId }, version: -1 }],
    })) as SyncRecordValuesResponse

    const block = assertBlock(getBlockById(response.recordMap.block, blockId), blockId)
    console.log(formatOutput(formatBlockValue(block as Record<string, unknown>), options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: getErrorMessage(error) }))
    process.exit(1)
  }
}

async function childrenAction(rawBlockId: string, options: ChildListOptions): Promise<void> {
  const blockId = formatNotionId(rawBlockId)
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
    const response = (await internalRequest(creds.token_v2, 'loadPageChunk', {
      pageId: blockId,
      limit: options.limit ? Number(options.limit) : 100,
      cursor: { stack: [] },
      chunkNumber: 0,
      verticalColumns: false,
    })) as LoadPageChunkResponse

    const parentBlock = assertBlock(getBlockById(response.recordMap.block, blockId), blockId)
    const childIds = Array.isArray(parentBlock.content) ? parentBlock.content : []
    const childBlocks = childIds
      .map((childId) => getBlockById(response.recordMap.block, childId))
      .filter((block): block is BlockValue => block !== undefined)

    const output = formatBlockChildren(childBlocks as Array<Record<string, unknown>>, response.cursor.stack.length > 0)

    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: getErrorMessage(error) }))
    process.exit(1)
  }
}

async function appendAction(rawParentId: string, options: AppendOptions): Promise<void> {
  const parentId = formatNotionId(rawParentId)
  try {
    const defs = parseBlockDefinitions(options.content)
    if (defs.length === 0) {
      throw new Error('Content must include at least one block definition')
    }

    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
    const spaceId = await resolveSpaceId(creds.token_v2, parentId)
    const operations: SaveOperation[] = []
    const newBlockIds: string[] = []

    for (const def of defs) {
      const newBlockId = generateId()
      newBlockIds.push(newBlockId)

      operations.push(
        {
          pointer: { table: 'block', id: newBlockId, spaceId },
          command: 'set',
          path: [],
          args: {
            type: def.type,
            id: newBlockId,
            version: 1,
            parent_id: parentId,
            parent_table: 'block',
            alive: true,
            properties: def.properties ?? {},
            space_id: spaceId,
          },
        },
        {
          pointer: { table: 'block', id: parentId, spaceId },
          command: 'listAfter',
          path: ['content'],
          args: { id: newBlockId },
        },
      )
    }

    const payload: SaveTransactionsRequest = {
      requestId: generateId(),
      transactions: [{ id: generateId(), spaceId, operations }],
    }
    await internalRequest(creds.token_v2, 'saveTransactions', payload)

    console.log(formatOutput({ created: newBlockIds }, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: getErrorMessage(error) }))
    process.exit(1)
  }
}

async function updateAction(rawBlockId: string, options: UpdateOptions): Promise<void> {
  const blockId = formatNotionId(rawBlockId)
  try {
    const content = parseUpdateContent(options.content)
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
    const spaceId = await resolveSpaceId(creds.token_v2, blockId)

    const payload: SaveTransactionsRequest = {
      requestId: generateId(),
      transactions: [
        {
          id: generateId(),
          spaceId,
          operations: [
            {
              pointer: { table: 'block', id: blockId, spaceId },
              command: 'update',
              path: [],
              args: content,
            },
          ],
        },
      ],
    }

    await internalRequest(creds.token_v2, 'saveTransactions', payload)

    const verifyResponse = (await internalRequest(creds.token_v2, 'syncRecordValues', {
      requests: [{ pointer: { table: 'block', id: blockId }, version: -1 }],
    })) as SyncRecordValuesResponse
    const updatedBlock = assertBlock(getBlockById(verifyResponse.recordMap.block, blockId), blockId)

    console.log(formatOutput(formatBlockValue(updatedBlock as Record<string, unknown>), options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: getErrorMessage(error) }))
    process.exit(1)
  }
}

async function deleteAction(rawBlockId: string, options: WorkspaceOptions): Promise<void> {
  const blockId = formatNotionId(rawBlockId)
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
    const blockResponse = (await internalRequest(creds.token_v2, 'syncRecordValues', {
      requests: [{ pointer: { table: 'block', id: blockId }, version: -1 }],
    })) as SyncRecordValuesResponse

    const block = assertBlock(getBlockById(blockResponse.recordMap.block, blockId), blockId)
    if (!block.parent_id) {
      throw new Error(`Block has no parent_id: ${blockId}`)
    }

    const parentId = block.parent_id
    const spaceId = await resolveSpaceId(creds.token_v2, blockId)

    const payload: SaveTransactionsRequest = {
      requestId: generateId(),
      transactions: [
        {
          id: generateId(),
          spaceId,
          operations: [
            {
              pointer: { table: 'block', id: blockId, spaceId },
              command: 'update',
              path: [],
              args: { alive: false },
            },
            {
              pointer: { table: 'block', id: parentId, spaceId },
              command: 'listRemove',
              path: ['content'],
              args: { id: blockId },
            },
          ],
        },
      ],
    }

    await internalRequest(creds.token_v2, 'saveTransactions', payload)

    console.log(formatOutput({ deleted: true, id: blockId }, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: getErrorMessage(error) }))
    process.exit(1)
  }
}

export const blockCommand = new Command('block')
  .description('Block commands')
  .addCommand(
    new Command('get')
      .description('Retrieve a block')
      .argument('<block_id>', 'Block ID')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--pretty', 'Pretty print JSON output')
      .action(getAction),
  )
  .addCommand(
    new Command('children')
      .description('List block children')
      .argument('<block_id>', 'Block ID')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--limit <n>', 'Number of child blocks to load')
      .option('--pretty', 'Pretty print JSON output')
      .action(childrenAction),
  )
  .addCommand(
    new Command('append')
      .description('Append child blocks')
      .argument('<parent_id>', 'Parent block ID')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .requiredOption('--content <json>', 'Block definitions as JSON array')
      .option('--pretty', 'Pretty print JSON output')
      .action(appendAction),
  )
  .addCommand(
    new Command('update')
      .description('Update a block')
      .argument('<block_id>', 'Block ID')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .requiredOption('--content <json>', 'Block update content as JSON object')
      .option('--pretty', 'Pretty print JSON output')
      .action(updateAction),
  )
  .addCommand(
    new Command('delete')
      .description('Delete (archive) a block')
      .argument('<block_id>', 'Block ID')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--pretty', 'Pretty print JSON output')
      .action(deleteAction),
  )
