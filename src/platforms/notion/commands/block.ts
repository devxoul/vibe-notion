import path from 'node:path'

import { Command } from 'commander'

import { internalRequest } from '@/platforms/notion/client'
import {
  extractTableColumnOrder,
  formatBacklinks,
  formatBlockChildren,
  formatBlockValue,
  getRecordValue,
} from '@/platforms/notion/formatters'
import { uploadFile, uploadFileOnly } from '@/platforms/notion/upload'
import { preprocessMarkdownImages } from '@/shared/markdown/preprocess-images'
import { readMarkdownInput } from '@/shared/markdown/read-input'
import { markdownToBlocks } from '@/shared/markdown/to-notion-internal'
import { handleNotionError } from '@/shared/utils/error-handler'
import { formatNotionId } from '@/shared/utils/id'
import { formatOutput } from '@/shared/utils/output'

import {
  type CommandOptions,
  ensureWorkspaceContext,
  generateId,
  getCredentialsOrExit,
  resolveAndSetActiveUserId,
  resolveBacklinkUsers,
  resolveSpaceId,
} from './helpers'

type WorkspaceOptions = CommandOptions & { workspaceId?: string }

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
  command: 'set' | 'listAfter' | 'listBefore' | 'update' | 'listRemove'
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
  startCursor?: string
}

type AppendOptions = WorkspaceOptions & {
  content?: string
  markdown?: string
  markdownFile?: string
  after?: string
  before?: string
}

type UpdateOptions = WorkspaceOptions & {
  content: string
}

type BlockDefinition = {
  type: string
  properties?: Record<string, unknown>
  format?: Record<string, unknown>
  children?: BlockDefinition[]
}

const LOCAL_MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\((?![^)]+:\/\/)[^)]+\)/

function parseBlockDefinitions(content: string): BlockDefinition[] {
  const parsed = JSON.parse(content) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('Content must be a JSON array of block definitions')
  }

  return parsed.map((item) => parseBlockDefinition(item))
}

function parseBlockDefinition(item: unknown): BlockDefinition {
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

  if (
    def.format !== undefined &&
    (typeof def.format !== 'object' || def.format === null || Array.isArray(def.format))
  ) {
    throw new Error('Block definition format must be an object when provided')
  }

  const result: BlockDefinition = {
    type: def.type,
    properties: def.properties as Record<string, unknown> | undefined,
    format: def.format as Record<string, unknown> | undefined,
  }

  if (def.children !== undefined) {
    if (!Array.isArray(def.children)) {
      throw new Error('Block definition children must be an array when provided')
    }
    result.children = def.children.map((child) => parseBlockDefinition(child))
  }

  return result
}

function parseUpdateContent(content: string): Record<string, unknown> {
  const parsed = JSON.parse(content) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Content must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

function unwrapBlockRecord(record: BlockRecord | undefined): BlockValue | undefined {
  if (!record?.value) return undefined
  const outer = record.value as unknown as Record<string, unknown>
  if (typeof outer.role === 'string' && outer.value !== undefined) {
    return outer.value as BlockValue
  }
  return record.value
}

function getBlockById(blockMap: Record<string, BlockRecord>, blockId: string): BlockValue | undefined {
  const direct = unwrapBlockRecord(blockMap[blockId])
  if (direct) return direct

  for (const record of Object.values(blockMap)) {
    const value = unwrapBlockRecord(record)
    if (value?.id === blockId) return value
  }
  return undefined
}

function assertBlock(block: BlockValue | undefined, blockId: string): BlockValue {
  if (!block) {
    throw new Error(`Block not found: ${blockId}`)
  }
  return block
}

type BlockGetOptions = WorkspaceOptions & { backlinks?: boolean }

async function getAction(rawBlockId: string, options: BlockGetOptions): Promise<void> {
  const blockId = formatNotionId(rawBlockId)
  try {
    const creds = await getCredentialsOrExit()
    const ctx = await ensureWorkspaceContext(creds, options.workspaceId, blockId)
    await resolveAndSetActiveUserId(ctx.tokenV2, ctx.workspaceId, {
      warnIfMissing: ctx.workspaceSource === 'explicit',
    })
    const response = (await internalRequest(ctx.tokenV2, 'syncRecordValues', {
      requests: [{ pointer: { table: 'block', id: blockId }, version: -1 }],
    })) as SyncRecordValuesResponse

    const block = assertBlock(getBlockById(response.recordMap.block, blockId), blockId)

    let tableColumnOrder: string[] | undefined
    if (block.type === 'table_row' && block.parent_id) {
      const parentResponse = (await internalRequest(ctx.tokenV2, 'syncRecordValues', {
        requests: [{ pointer: { table: 'block', id: block.parent_id }, version: -1 }],
      })) as SyncRecordValuesResponse
      const parent = getBlockById(parentResponse.recordMap.block, block.parent_id)
      if (parent?.type === 'table') {
        tableColumnOrder = extractTableColumnOrder(parent as Record<string, unknown>)
      }
    }

    const result = formatBlockValue(block as Record<string, unknown>, tableColumnOrder)

    if (options.backlinks) {
      const backlinksResponse = (await internalRequest(ctx.tokenV2, 'getBacklinksForBlock', {
        blockId,
      })) as Record<string, unknown>
      const userLookup = await resolveBacklinkUsers(ctx.tokenV2, backlinksResponse)
      const output = { ...result, backlinks: formatBacklinks(backlinksResponse, userLookup) }
      console.log(formatOutput(output, options.pretty))
    } else {
      console.log(formatOutput(result, options.pretty))
    }
  } catch (error) {
    handleNotionError(error)
  }
}

async function childrenAction(rawBlockId: string, options: ChildListOptions): Promise<void> {
  const blockId = formatNotionId(rawBlockId)
  try {
    const cursor = parsePageChunkCursor(options.startCursor)
    const creds = await getCredentialsOrExit()
    const ctx = await ensureWorkspaceContext(creds, options.workspaceId, blockId)
    await resolveAndSetActiveUserId(ctx.tokenV2, ctx.workspaceId, {
      warnIfMissing: ctx.workspaceSource === 'explicit',
    })
    const response = (await internalRequest(ctx.tokenV2, 'loadPageChunk', {
      pageId: blockId,
      limit: options.limit ? Number(options.limit) : 100,
      cursor,
      chunkNumber: 0,
      verticalColumns: false,
    })) as LoadPageChunkResponse

    const parentBlock = assertBlock(getBlockById(response.recordMap.block, blockId), blockId)
    const childIds = Array.isArray(parentBlock.content) ? parentBlock.content : []
    const childBlocks = childIds
      .map((childId) => getBlockById(response.recordMap.block, childId))
      .filter((block): block is BlockValue => block !== undefined)

    const hasMore = response.cursor.stack.length > 0
    const nextCursor = hasMore ? JSON.stringify(response.cursor) : null
    const parentType = parentBlock.type as string | undefined
    const columnOrder =
      parentType === 'table' ? extractTableColumnOrder(parentBlock as Record<string, unknown>) : undefined
    const output = formatBlockChildren(childBlocks as Array<Record<string, unknown>>, hasMore, nextCursor, columnOrder)

    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    handleNotionError(error)
  }
}

function parsePageChunkCursor(rawCursor: string | undefined): { stack: unknown[] } {
  if (!rawCursor) {
    return { stack: [] }
  }

  const parsed = JSON.parse(rawCursor) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('start-cursor must be a JSON object with a stack array')
  }

  const cursor = parsed as { stack?: unknown }
  if (!Array.isArray(cursor.stack)) {
    throw new Error('start-cursor must be a JSON object with a stack array')
  }

  return { stack: cursor.stack }
}

function appendBlockOperations(
  operations: SaveOperation[],
  def: BlockDefinition,
  blockId: string,
  parentId: string,
  spaceId: string,
  afterId?: string,
  beforeId?: string,
): void {
  operations.push(
    {
      pointer: { table: 'block', id: blockId, spaceId },
      command: 'set',
      path: [],
      args: {
        type: def.type,
        id: blockId,
        version: 1,
        parent_id: parentId,
        parent_table: 'block',
        alive: true,
        properties: def.properties ?? {},
        ...(def.format ? { format: def.format } : {}),
        space_id: spaceId,
      },
    },
    {
      pointer: { table: 'block', id: parentId, spaceId },
      command: beforeId ? 'listBefore' : 'listAfter',
      path: ['content'],
      args: beforeId ? { id: blockId, before: beforeId } : afterId ? { id: blockId, after: afterId } : { id: blockId },
    },
  )
  if (def.children) {
    for (const child of def.children) {
      const childBlockId = generateId()
      appendBlockOperations(operations, child, childBlockId, blockId, spaceId)
    }
  }
}

export async function handleBlockAppend(
  tokenV2: string,
  args: {
    parent_id: string
    content?: string
    markdown?: string
    markdownFile?: string
    after?: string
    before?: string
    workspaceId: string
  },
): Promise<unknown> {
  const parentId = formatNotionId(args.parent_id)
  const hasContent = args.content !== undefined
  const hasMarkdown = args.markdown !== undefined || args.markdownFile !== undefined

  if (hasContent && hasMarkdown) {
    throw new Error('--content and --markdown/--markdown-file are mutually exclusive')
  }

  if (!hasContent && !hasMarkdown) {
    throw new Error('Provide either --content or --markdown/--markdown-file')
  }

  if (args.after && args.before) {
    throw new Error('--after and --before are mutually exclusive')
  }

  let defs: BlockDefinition[]

  if (hasMarkdown) {
    const rawMarkdown = readMarkdownInput({ markdown: args.markdown, markdownFile: args.markdownFile })
    const basePath = args.markdownFile ? path.dirname(path.resolve(args.markdownFile)) : process.cwd()
    const uploadFn = async (filePath: string): Promise<string> => {
      await resolveAndSetActiveUserId(tokenV2, args.workspaceId)
      const spaceId = await resolveSpaceId(tokenV2, parentId)
      const result = await uploadFileOnly(tokenV2, filePath, parentId, spaceId)
      return result.source
    }
    const markdown = LOCAL_MARKDOWN_IMAGE_PATTERN.test(rawMarkdown)
      ? await preprocessMarkdownImages(rawMarkdown, uploadFn, basePath)
      : rawMarkdown
    defs = markdownToBlocks(markdown)
  } else {
    defs = parseBlockDefinitions(args.content!)
  }

  if (defs.length === 0) {
    throw new Error('Content must include at least one block definition')
  }
  await resolveAndSetActiveUserId(tokenV2, args.workspaceId)
  const spaceId = await resolveSpaceId(tokenV2, parentId)
  const operations: SaveOperation[] = []
  const newBlockIds: string[] = []
  let afterId = args.after ? formatNotionId(args.after) : undefined
  let beforeId = args.before ? formatNotionId(args.before) : undefined
  for (const def of defs) {
    const newBlockId = generateId()
    newBlockIds.push(newBlockId)
    appendBlockOperations(operations, def, newBlockId, parentId, spaceId, afterId, beforeId)
    afterId = newBlockId
    beforeId = undefined
  }
  const payload: SaveTransactionsRequest = {
    requestId: generateId(),
    transactions: [{ id: generateId(), spaceId, operations }],
  }
  await internalRequest(tokenV2, 'saveTransactions', payload)
  return { created: newBlockIds }
}

export async function handleBlockUpdate(
  tokenV2: string,
  args: { block_id: string; content: string; workspaceId: string },
): Promise<unknown> {
  const blockId = formatNotionId(args.block_id)
  const content = parseUpdateContent(args.content)
  await resolveAndSetActiveUserId(tokenV2, args.workspaceId)
  const spaceId = await resolveSpaceId(tokenV2, blockId)

  // Merge properties with existing block to prevent silent data loss.
  // Without this, sending {properties: {checked: [["Yes"]]}} would wipe out
  // the title and any other existing properties on the block.
  if (content.properties) {
    const existingResponse = (await internalRequest(tokenV2, 'syncRecordValues', {
      requests: [{ pointer: { table: 'block', id: blockId }, version: -1 }],
    })) as SyncRecordValuesResponse
    const existingBlock = assertBlock(getBlockById(existingResponse.recordMap.block, blockId), blockId)
    if (existingBlock.properties) {
      content.properties = { ...existingBlock.properties, ...(content.properties as Record<string, unknown>) }
    }
  }

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

  await internalRequest(tokenV2, 'saveTransactions', payload)

  const verifyResponse = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'block', id: blockId }, version: -1 }],
  })) as SyncRecordValuesResponse
  const updatedBlock = assertBlock(getBlockById(verifyResponse.recordMap.block, blockId), blockId)

  return formatBlockValue(updatedBlock as Record<string, unknown>)
}

export async function handleBlockDelete(
  tokenV2: string,
  args: { block_id: string; workspaceId: string },
): Promise<unknown> {
  const blockId = formatNotionId(args.block_id)
  await resolveAndSetActiveUserId(tokenV2, args.workspaceId)
  const blockResponse = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'block', id: blockId }, version: -1 }],
  })) as SyncRecordValuesResponse

  const block = assertBlock(getBlockById(blockResponse.recordMap.block, blockId), blockId)
  if (!block.parent_id) {
    throw new Error(`Block has no parent_id: ${blockId}`)
  }

  const parentId = block.parent_id
  const spaceId = await resolveSpaceId(tokenV2, blockId)

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

  await internalRequest(tokenV2, 'saveTransactions', payload)

  return { deleted: true, id: blockId }
}

export async function handleBlockUpload(
  tokenV2: string,
  args: { parent_id: string; file: string; after?: string; before?: string; workspaceId: string },
): Promise<unknown> {
  const parentId = formatNotionId(args.parent_id)
  const afterId = args.after ? formatNotionId(args.after) : undefined
  const beforeId = args.before ? formatNotionId(args.before) : undefined
  await resolveAndSetActiveUserId(tokenV2, args.workspaceId)
  const spaceId = await resolveSpaceId(tokenV2, parentId)
  return uploadFile(tokenV2, parentId, args.file, spaceId, afterId, beforeId)
}

export async function handleBlockMove(
  tokenV2: string,
  args: { block_id: string; parent_id: string; after?: string; before?: string; workspaceId: string },
): Promise<unknown> {
  const blockId = formatNotionId(args.block_id)
  const targetParentId = formatNotionId(args.parent_id)
  const afterId = args.after ? formatNotionId(args.after) : undefined
  const beforeId = args.before ? formatNotionId(args.before) : undefined

  if (afterId && beforeId) {
    throw new Error('--after and --before are mutually exclusive')
  }

  await resolveAndSetActiveUserId(tokenV2, args.workspaceId)

  const blockResponse = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'block', id: blockId }, version: -1 }],
  })) as SyncRecordValuesResponse

  const block = assertBlock(getBlockById(blockResponse.recordMap.block, blockId), blockId)
  if (!block.parent_id) {
    throw new Error(`Block has no parent_id: ${blockId}`)
  }

  const currentParentId = block.parent_id
  const spaceId = await resolveSpaceId(tokenV2, blockId)

  const operations: SaveOperation[] = [
    {
      pointer: { table: 'block', id: currentParentId, spaceId },
      command: 'listRemove',
      path: ['content'],
      args: { id: blockId },
    },
    {
      pointer: { table: 'block', id: targetParentId, spaceId },
      command: beforeId ? 'listBefore' : 'listAfter',
      path: ['content'],
      args: beforeId ? { id: blockId, before: beforeId } : afterId ? { id: blockId, after: afterId } : { id: blockId },
    },
  ]

  if (currentParentId !== targetParentId) {
    operations.push({
      pointer: { table: 'block', id: blockId, spaceId },
      command: 'update',
      path: [],
      args: { parent_id: targetParentId, parent_table: 'block' },
    })
  }

  const payload: SaveTransactionsRequest = {
    requestId: generateId(),
    transactions: [{ id: generateId(), spaceId, operations }],
  }

  await internalRequest(tokenV2, 'saveTransactions', payload)

  return { moved: true, id: blockId, parent_id: targetParentId }
}

async function appendAction(rawParentId: string, options: AppendOptions): Promise<void> {
  try {
    const parentId = formatNotionId(rawParentId)
    const creds = await getCredentialsOrExit()
    const ctx = await ensureWorkspaceContext(creds, options.workspaceId, parentId)
    const result = await handleBlockAppend(ctx.tokenV2, {
      parent_id: parentId,
      content: options.content,
      markdown: options.markdown,
      markdownFile: options.markdownFile,
      after: options.after,
      before: options.before,
      workspaceId: ctx.workspaceId,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleNotionError(error)
  }
}

async function updateAction(rawBlockId: string, options: UpdateOptions): Promise<void> {
  try {
    const blockId = formatNotionId(rawBlockId)
    const creds = await getCredentialsOrExit()
    const ctx = await ensureWorkspaceContext(creds, options.workspaceId, blockId)
    const result = await handleBlockUpdate(ctx.tokenV2, {
      block_id: blockId,
      content: options.content,
      workspaceId: ctx.workspaceId,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleNotionError(error)
  }
}

async function deleteAction(rawBlockId: string, options: WorkspaceOptions): Promise<void> {
  try {
    const blockId = formatNotionId(rawBlockId)
    const creds = await getCredentialsOrExit()
    const ctx = await ensureWorkspaceContext(creds, options.workspaceId, blockId)
    const result = await handleBlockDelete(ctx.tokenV2, {
      block_id: blockId,
      workspaceId: ctx.workspaceId,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleNotionError(error)
  }
}

async function uploadAction(
  rawParentId: string,
  options: { file: string; after?: string; before?: string; workspaceId?: string; pretty?: boolean },
): Promise<void> {
  try {
    const parentId = formatNotionId(rawParentId)
    const creds = await getCredentialsOrExit()
    const ctx = await ensureWorkspaceContext(creds, options.workspaceId, parentId)
    const result = await handleBlockUpload(ctx.tokenV2, {
      parent_id: parentId,
      file: options.file,
      after: options.after,
      before: options.before,
      workspaceId: ctx.workspaceId,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleNotionError(error)
  }
}

type MoveOptions = WorkspaceOptions & { parent: string; after?: string; before?: string }

async function moveAction(rawBlockId: string, options: MoveOptions): Promise<void> {
  try {
    const blockId = formatNotionId(rawBlockId)
    const creds = await getCredentialsOrExit()
    const ctx = await ensureWorkspaceContext(creds, options.workspaceId, blockId)
    const result = await handleBlockMove(ctx.tokenV2, {
      block_id: blockId,
      parent_id: options.parent,
      after: options.after,
      before: options.before,
      workspaceId: ctx.workspaceId,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleNotionError(error)
  }
}

const WORKSPACE_ID_OPTION_DESC = 'Workspace ID (optional; auto-resolved from the target block when omitted)'

export const blockCommand = new Command('block')
  .description('Block commands')
  .addCommand(
    new Command('get')
      .description('Retrieve a block')
      .argument('<block_id>', 'Block ID')
      .option('--workspace-id <id>', WORKSPACE_ID_OPTION_DESC)
      .option('--backlinks', 'Include backlinks (blocks that link to this block)')
      .option('--pretty', 'Pretty print JSON output')
      .action(getAction),
  )
  .addCommand(
    new Command('children')
      .description('List block children')
      .argument('<block_id>', 'Block ID')
      .option('--workspace-id <id>', WORKSPACE_ID_OPTION_DESC)
      .option('--limit <n>', 'Number of child blocks to load')
      .option('--start-cursor <json>', 'Pagination cursor from previous response')
      .option('--pretty', 'Pretty print JSON output')
      .action(childrenAction),
  )
  .addCommand(
    new Command('append')
      .description('Append child blocks')
      .argument('<parent_id>', 'Parent block ID')
      .option('--workspace-id <id>', WORKSPACE_ID_OPTION_DESC)
      .option('--content <json>', 'Block definitions as JSON array')
      .option('--markdown <text>', 'Markdown content to convert to blocks')
      .option('--markdown-file <path>', 'Path to markdown file')
      .option('--after <block_id>', 'Insert after this block ID')
      .option('--before <block_id>', 'Insert before this block ID')
      .option('--pretty', 'Pretty print JSON output')
      .action(appendAction),
  )
  .addCommand(
    new Command('update')
      .description('Update a block')
      .argument('<block_id>', 'Block ID')
      .option('--workspace-id <id>', WORKSPACE_ID_OPTION_DESC)
      .requiredOption('--content <json>', 'Block update content as JSON object')
      .option('--pretty', 'Pretty print JSON output')
      .action(updateAction),
  )
  .addCommand(
    new Command('delete')
      .description('Delete (archive) a block')
      .argument('<block_id>', 'Block ID')
      .option('--workspace-id <id>', WORKSPACE_ID_OPTION_DESC)
      .option('--pretty', 'Pretty print JSON output')
      .action(deleteAction),
  )
  .addCommand(
    new Command('upload')
      .description('Upload a file as a block')
      .argument('<parent_id>', 'Parent block ID')
      .option('--workspace-id <id>', WORKSPACE_ID_OPTION_DESC)
      .requiredOption('--file <path>', 'Path to file to upload')
      .option('--after <block_id>', 'Insert after this block ID')
      .option('--before <block_id>', 'Insert before this block ID')
      .option('--pretty', 'Pretty print JSON output')
      .action(uploadAction),
  )
  .addCommand(
    new Command('move')
      .description('Move a block to a new position')
      .argument('<block_id>', 'Block ID to move')
      .option('--workspace-id <id>', WORKSPACE_ID_OPTION_DESC)
      .requiredOption('--parent <parent_id>', 'Target parent block ID')
      .option('--after <block_id>', 'Place after this block ID')
      .option('--before <block_id>', 'Place before this block ID')
      .option('--pretty', 'Pretty print JSON output')
      .action(moveAction),
  )
