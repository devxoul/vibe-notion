import path from 'node:path'

import { Command } from 'commander'

import { internalRequest } from '@/platforms/notion/client'
import {
  buildPageLookup,
  buildSchemaMapFromCollection,
  buildUserLookup,
  collectReferenceIds,
  enrichProperties,
  extractNotionTitle,
  formatBacklinks,
  formatBlockRecord,
  formatPageGet,
  formatRowProperties,
  getRecordValue,
} from '@/platforms/notion/formatters'
import { uploadFileOnly } from '@/platforms/notion/upload'
import { preprocessMarkdownImages } from '@/shared/markdown/preprocess-images'
import { readMarkdownInput } from '@/shared/markdown/read-input'
import { markdownToBlocks } from '@/shared/markdown/to-notion-internal'
import type { InternalBlockDefinition } from '@/shared/markdown/types'
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
  resolveDefaultTeamId,
  resolveSpaceId,
  type WorkspaceSource,
} from './helpers'

type WorkspaceOptions = CommandOptions & { workspaceId?: string }
type ListPageOptions = CommandOptions & { workspaceId: string; depth?: string }
type LoadPageChunkOptions = WorkspaceOptions & { limit?: string; backlinks?: boolean }
type CreatePageOptions = WorkspaceOptions & {
  parent?: string
  title: string
  markdown?: string
  markdownFile?: string
}
type UpdatePageOptions = WorkspaceOptions & {
  title?: string
  icon?: string
  replaceContent?: boolean
  markdown?: string
  markdownFile?: string
}
type PropertiesOptions = WorkspaceOptions
type ArchivePageOptions = WorkspaceOptions

type BlockValue = {
  parent_id?: string
  space_id?: string
  [key: string]: unknown
}

type BlockRecord = {
  value: BlockValue
  role: string
}

type LoadPageChunkResponse = {
  cursor: {
    stack: unknown[]
  }
  recordMap: {
    block: Record<string, BlockRecord>
    [key: string]: unknown
  }
}

type SyncRecordValuesResponse = {
  recordMap: {
    block: Record<string, BlockRecord>
  }
}

type Operation = {
  pointer: {
    table: 'block' | 'collection' | 'space' | 'team'
    id: string
    spaceId: string
  }
  command: 'set' | 'listAfter' | 'update' | 'listRemove'
  path: string[]
  args: unknown
}

const LOCAL_MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\((?![^)]+:\/\/)[^)]+\)/

function appendBlockOperations(
  operations: Operation[],
  def: InternalBlockDefinition,
  blockId: string,
  parentId: string,
  spaceId: string,
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
      command: 'listAfter',
      path: ['content'],
      args: { id: blockId },
    },
  )

  for (const child of def.children ?? []) {
    appendBlockOperations(operations, child, generateId(), blockId, spaceId)
  }
}

function pickBlock(response: SyncRecordValuesResponse, blockId: string): BlockRecord | undefined {
  const raw = response.recordMap.block[blockId] ?? Object.values(response.recordMap.block)[0]
  if (!raw) return undefined
  // Handle v3 nested format: { value: { value: {...}, role } }
  const outer = raw.value as unknown as Record<string, unknown>
  if (typeof outer?.role === 'string' && outer.value !== undefined) {
    return { value: outer.value as BlockValue, role: outer.role as string }
  }
  return raw
}

type SpaceRecord = {
  value: {
    id: string
    name?: string
    pages?: string[]
    [key: string]: unknown
  }
}

type GetSpacesResponse = Record<string, { space: Record<string, SpaceRecord> }>

type PageEntry = {
  id: string
  title: string
  type: string
  children?: PageEntry[]
}

async function getSpace(tokenV2: string, spaceId: string): Promise<{ id: string; pages: string[] }> {
  const spacesData = (await internalRequest(tokenV2, 'getSpaces', {})) as GetSpacesResponse
  const allSpaces = Object.values(spacesData).flatMap((entry) => Object.values(entry.space ?? {}))

  for (const raw of allSpaces) {
    const value = getRecordValue(raw as unknown as Record<string, unknown>) as SpaceRecord['value'] | undefined
    if (value?.id === spaceId) {
      return { id: value.id, pages: value.pages ?? [] }
    }
  }

  throw new Error(`Space not found: ${spaceId}`)
}

function extractTitle(block: BlockValue): string {
  const title = block.properties as { title?: string[][] } | undefined
  if (title?.title) {
    return title.title.map((segment: string[]) => segment[0]).join('')
  }
  return ''
}

async function walkPages(
  tokenV2: string,
  pageIds: string[],
  maxDepth: number,
  currentDepth: number,
): Promise<PageEntry[]> {
  if (pageIds.length === 0) return []

  const response = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: pageIds.map((id) => ({ pointer: { table: 'block', id }, version: -1 })),
  })) as SyncRecordValuesResponse

  const entries: PageEntry[] = []

  for (const pageId of pageIds) {
    const record = response.recordMap.block[pageId]
    if (!record) continue

    const block = getRecordValue(record as unknown as Record<string, unknown>)
    if (!block) continue
    const type = (block.type as string) ?? 'unknown'
    const isPage = type === 'page' || type === 'collection_view_page' || type === 'collection_view'

    if (!isPage) continue
    if ((block.alive as boolean | undefined) === false) continue

    const entry: PageEntry = {
      id: pageId,
      title: extractTitle(block),
      type,
    }

    if (currentDepth < maxDepth) {
      const childIds = (block.content as string[] | undefined) ?? []
      if (childIds.length > 0) {
        const children = await walkPages(tokenV2, childIds, maxDepth, currentDepth + 1)
        if (children.length > 0) {
          entry.children = children
        }
      }
    }

    entries.push(entry)
  }

  return entries
}

async function listAction(options: ListPageOptions): Promise<void> {
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
    const space = await getSpace(creds.token_v2, options.workspaceId)
    const maxDepth = options.depth ? Number(options.depth) : 1

    const pages = await walkPages(creds.token_v2, space.pages, maxDepth, 0)

    const output = {
      pages,
      total: pages.length,
    }

    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    handleNotionError(error)
  }
}

async function getAction(rawPageId: string, options: LoadPageChunkOptions): Promise<void> {
  const pageId = formatNotionId(rawPageId)
  try {
    const creds = await getCredentialsOrExit()
    const ctx = await ensureWorkspaceContext(creds, options.workspaceId, pageId)
    await resolveAndSetActiveUserId(ctx.tokenV2, ctx.workspaceId, {
      warnIfMissing: ctx.workspaceSource === 'explicit',
    })

    let cursor: { stack: unknown[] } = { stack: [] }
    let chunkNumber = 0
    const blocks: Record<string, BlockRecord> = {}
    const extraRecordMap: Record<string, Record<string, unknown>> = {}

    do {
      const chunk = (await internalRequest(ctx.tokenV2, 'loadPageChunk', {
        pageId,
        limit: options.limit ? Number(options.limit) : 100,
        cursor,
        chunkNumber,
        verticalColumns: false,
      })) as LoadPageChunkResponse

      Object.assign(blocks, chunk.recordMap.block)
      for (const [key, value] of Object.entries(chunk.recordMap)) {
        if (key === 'block') continue
        if (!extraRecordMap[key]) extraRecordMap[key] = {}
        Object.assign(extraRecordMap[key], value as Record<string, unknown>)
      }
      cursor = chunk.cursor
      chunkNumber += 1
    } while (cursor.stack.length > 0)

    const result = formatPageGet(blocks as unknown as Record<string, Record<string, unknown>>, pageId, extraRecordMap)

    if (options.backlinks) {
      const backlinksResponse = (await internalRequest(ctx.tokenV2, 'getBacklinksForBlock', {
        blockId: pageId,
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

export async function handlePageCreate(
  tokenV2: string,
  args: { parent?: string; title: string; markdown?: string; markdownFile?: string; workspaceId: string },
): Promise<unknown> {
  await resolveAndSetActiveUserId(tokenV2, args.workspaceId)
  const newPageId = generateId()
  const isRootPage = !args.parent

  let spaceId: string
  let parentId: string
  let parentTable: 'block' | 'space' | 'team'
  let listAfterPath: string[]
  let listAfterTable: 'block' | 'space' | 'team'

  if (isRootPage) {
    spaceId = args.workspaceId
    const defaultTeamId = await resolveDefaultTeamId(tokenV2, args.workspaceId)
    if (defaultTeamId) {
      // Team workspace: parent is the default teamspace
      parentId = defaultTeamId
      parentTable = 'team'
      listAfterPath = ['team_pages']
      listAfterTable = 'team'
    } else {
      // Personal workspace: parent is the space itself
      parentId = args.workspaceId
      parentTable = 'space'
      listAfterPath = ['pages']
      listAfterTable = 'space'
    }
  } else {
    // Child page: parent is a block
    const parent = formatNotionId(args.parent!)
    spaceId = await resolveSpaceId(tokenV2, parent)
    parentId = parent
    parentTable = 'block'
    listAfterPath = ['content']
    listAfterTable = 'block'
  }

  const operations: Operation[] = [
    {
      pointer: { table: 'block', id: newPageId, spaceId },
      command: 'set',
      path: [],
      args: {
        type: 'page',
        id: newPageId,
        version: 1,
        parent_id: parentId,
        parent_table: parentTable,
        alive: true,
        properties: { title: [[args.title]] },
        space_id: spaceId,
      },
    },
    {
      pointer: { table: listAfterTable, id: parentId, spaceId },
      command: 'listAfter',
      path: listAfterPath,
      args: { id: newPageId },
    },
  ]

  await internalRequest(tokenV2, 'saveTransactions', {
    requestId: generateId(),
    transactions: [{ id: generateId(), spaceId, operations }],
  })

  if (args.markdown || args.markdownFile) {
    const rawMarkdown = readMarkdownInput({ markdown: args.markdown, markdownFile: args.markdownFile })
    const basePath = args.markdownFile ? path.dirname(path.resolve(args.markdownFile)) : process.cwd()
    const uploadFn = async (filePath: string): Promise<string> => {
      await resolveAndSetActiveUserId(tokenV2, args.workspaceId)
      const result = await uploadFileOnly(tokenV2, filePath, newPageId, spaceId)
      return result.source
    }
    const markdown = LOCAL_MARKDOWN_IMAGE_PATTERN.test(rawMarkdown)
      ? await preprocessMarkdownImages(rawMarkdown, uploadFn, basePath)
      : rawMarkdown
    const blockDefs = markdownToBlocks(markdown)

    if (blockDefs.length > 0) {
      const blockOperations: Operation[] = []

      for (const def of blockDefs) {
        appendBlockOperations(blockOperations, def, generateId(), newPageId, spaceId)
      }

      await internalRequest(tokenV2, 'saveTransactions', {
        requestId: generateId(),
        transactions: [{ id: generateId(), spaceId, operations: blockOperations }],
      })
    }
  }

  const created = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'block', id: newPageId }, version: -1 }],
  })) as SyncRecordValuesResponse

  const createdPage = pickBlock(created, newPageId)
  return formatBlockRecord(createdPage as unknown as Record<string, unknown>)
}

async function createAction(options: CreatePageOptions): Promise<void> {
  try {
    const creds = await getCredentialsOrExit()
    let workspaceId = options.workspaceId
    let tokenV2 = creds.token_v2
    if (options.parent) {
      const ctx = await ensureWorkspaceContext(creds, workspaceId, formatNotionId(options.parent))
      workspaceId = ctx.workspaceId
      tokenV2 = ctx.tokenV2
    } else if (!workspaceId) {
      throw new Error(
        'Creating a root page requires --workspace-id. Provide --parent to auto-resolve, or pass --workspace-id explicitly.',
      )
    }
    const result = await handlePageCreate(tokenV2, {
      parent: options.parent,
      title: options.title,
      markdown: options.markdown,
      markdownFile: options.markdownFile,
      workspaceId,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleNotionError(error)
  }
}

export async function handlePageUpdate(
  tokenV2: string,
  args: {
    page_id: string
    title?: string
    icon?: string
    replaceContent?: boolean
    markdown?: string
    markdownFile?: string
    workspaceId: string
  },
): Promise<unknown> {
  const pageId = formatNotionId(args.page_id)
  await resolveAndSetActiveUserId(tokenV2, args.workspaceId)
  const spaceId = await resolveSpaceId(tokenV2, pageId)

  const operations: Operation[] = []

  if (args.title) {
    operations.push({
      pointer: { table: 'block', id: pageId, spaceId },
      command: 'set',
      path: ['properties', 'title'],
      args: [[args.title]],
    })
  }

  if (args.icon) {
    // For collection_view_page, the icon lives on the collection record
    const blockResponse = (await internalRequest(tokenV2, 'syncRecordValues', {
      requests: [{ pointer: { table: 'block', id: pageId }, version: -1 }],
    })) as SyncRecordValuesResponse
    const block = pickBlock(blockResponse, pageId)
    const blockType = block?.value?.type as string | undefined
    const collectionId = block?.value?.collection_id as string | undefined

    if (blockType === 'collection_view_page' && collectionId) {
      operations.push({
        pointer: { table: 'collection', id: collectionId, spaceId },
        command: 'set',
        path: ['icon'],
        args: args.icon,
      })
    } else {
      operations.push({
        pointer: { table: 'block', id: pageId, spaceId },
        command: 'set',
        path: ['format', 'page_icon'],
        args: args.icon,
      })
    }
  }

  if (operations.length === 0 && !args.replaceContent) {
    throw new Error('No updates provided. Use --title, --icon, or --replace-content with --markdown')
  }

  if (operations.length > 0) {
    await internalRequest(tokenV2, 'saveTransactions', {
      requestId: generateId(),
      transactions: [{ id: generateId(), spaceId, operations }],
    })
  }

  if (args.replaceContent) {
    if (!args.markdown && !args.markdownFile) {
      throw new Error('--replace-content requires --markdown or --markdown-file')
    }

    const rawMarkdown = readMarkdownInput({ markdown: args.markdown, markdownFile: args.markdownFile })
    const basePath = args.markdownFile ? path.dirname(path.resolve(args.markdownFile)) : process.cwd()
    const uploadFn = async (filePath: string): Promise<string> => {
      await resolveAndSetActiveUserId(tokenV2, args.workspaceId)
      const result = await uploadFileOnly(tokenV2, filePath, pageId, spaceId)
      return result.source
    }
    const md = LOCAL_MARKDOWN_IMAGE_PATTERN.test(rawMarkdown)
      ? await preprocessMarkdownImages(rawMarkdown, uploadFn, basePath)
      : rawMarkdown
    const newBlocks = markdownToBlocks(md)

    const pageChunk = (await internalRequest(tokenV2, 'loadPageChunk', {
      pageId,
      limit: 100,
      cursor: { stack: [] },
      chunkNumber: 0,
      verticalColumns: false,
    })) as LoadPageChunkResponse

    const rawParentBlock = pageChunk.recordMap.block[pageId]?.value as Record<string, unknown> | undefined
    const parentBlock =
      typeof rawParentBlock?.role === 'string' ? (rawParentBlock.value as Record<string, unknown>) : rawParentBlock
    const existingChildIds = (parentBlock?.content as string[]) ?? []

    if (existingChildIds.length > 0) {
      const deleteOps: Operation[] = existingChildIds.flatMap((childId) => [
        {
          pointer: { table: 'block' as const, id: childId, spaceId },
          command: 'update' as const,
          path: [] as string[],
          args: { alive: false },
        },
        {
          pointer: { table: 'block' as const, id: pageId, spaceId },
          command: 'listRemove' as const,
          path: ['content'],
          args: { id: childId },
        },
      ])

      await internalRequest(tokenV2, 'saveTransactions', {
        requestId: generateId(),
        transactions: [{ id: generateId(), spaceId, operations: deleteOps }],
      })
    }

    const appendOps: Operation[] = []
    for (const def of newBlocks) {
      appendBlockOperations(appendOps, def, generateId(), pageId, spaceId)
    }

    try {
      await internalRequest(tokenV2, 'saveTransactions', {
        requestId: generateId(),
        transactions: [{ id: generateId(), spaceId, operations: appendOps }],
      })
    } catch (appendError) {
      throw new Error(`Page content cleared but new content failed to append: ${(appendError as Error).message}`)
    }
  }

  const updated = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'block', id: pageId }, version: -1 }],
  })) as SyncRecordValuesResponse

  const updatedPage = pickBlock(updated, pageId)
  return formatBlockRecord(updatedPage as unknown as Record<string, unknown>)
}

async function updateAction(rawPageId: string, options: UpdatePageOptions): Promise<void> {
  try {
    const pageId = formatNotionId(rawPageId)
    const creds = await getCredentialsOrExit()
    const ctx = await ensureWorkspaceContext(creds, options.workspaceId, pageId)
    const result = await handlePageUpdate(ctx.tokenV2, {
      page_id: pageId,
      title: options.title,
      icon: options.icon,
      replaceContent: options.replaceContent,
      markdown: options.markdown,
      markdownFile: options.markdownFile,
      workspaceId: ctx.workspaceId,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleNotionError(error)
  }
}

export async function handlePageProperties(
  tokenV2: string,
  args: { page_id: string; workspaceId: string; workspaceSource: WorkspaceSource },
): Promise<unknown> {
  const pageId = formatNotionId(args.page_id)
  await resolveAndSetActiveUserId(tokenV2, args.workspaceId, {
    warnIfMissing: args.workspaceSource === 'explicit',
  })

  const response = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'block', id: pageId }, version: -1 }],
  })) as SyncRecordValuesResponse

  const record = pickBlock(response, pageId)
  if (!record?.value) {
    throw new Error(`Page not found: ${pageId}`)
  }

  const block = record.value
  const parentTable = block.parent_table as string | undefined
  const parentId = block.parent_id as string | undefined

  if (parentTable === 'collection' && parentId) {
    const collResponse = (await internalRequest(tokenV2, 'syncRecordValues', {
      requests: [{ pointer: { table: 'collection', id: parentId }, version: -1 }],
    })) as { recordMap: { collection: Record<string, { value: Record<string, unknown> }> } }

    const collection = collResponse.recordMap.collection
      ? Object.values(collResponse.recordMap.collection)[0]?.value
      : undefined
    if (collection) {
      const schemaMap = buildSchemaMapFromCollection(collection)
      const properties = formatRowProperties(block as unknown as Record<string, unknown>, schemaMap)

      const row = { id: pageId, properties }
      const refs = collectReferenceIds([row])

      if (refs.pageIds.length > 0 || refs.userIds.length > 0) {
        const batch = (await internalRequest(tokenV2, 'syncRecordValues', {
          requests: [
            ...refs.pageIds.map((id) => ({ pointer: { table: 'block', id }, version: -1 })),
            ...refs.userIds.map((id) => ({ pointer: { table: 'notion_user', id }, version: -1 })),
          ],
        })) as {
          recordMap?: {
            block?: Record<string, Record<string, unknown>>
            notion_user?: Record<string, Record<string, unknown>>
          }
        }

        const pageLookup = buildPageLookup(batch.recordMap?.block)
        const userLookup = buildUserLookup(batch.recordMap?.notion_user)
        enrichProperties([row], pageLookup, userLookup)
      }

      return row
    }
  }

  return {
    id: pageId,
    title: extractNotionTitle(block as unknown as Record<string, unknown>),
    type: (block.type as string) ?? 'page',
  }
}

async function propertiesAction(rawPageId: string, options: PropertiesOptions): Promise<void> {
  try {
    const pageId = formatNotionId(rawPageId)
    const creds = await getCredentialsOrExit()
    const ctx = await ensureWorkspaceContext(creds, options.workspaceId, pageId)
    const result = await handlePageProperties(ctx.tokenV2, {
      page_id: pageId,
      workspaceId: ctx.workspaceId,
      workspaceSource: ctx.workspaceSource,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleNotionError(error)
  }
}

export async function handlePageArchive(
  tokenV2: string,
  args: { page_id: string; workspaceId: string },
): Promise<unknown> {
  const pageId = formatNotionId(args.page_id)
  await resolveAndSetActiveUserId(tokenV2, args.workspaceId)

  const pageResponse = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'block', id: pageId }, version: -1 }],
  })) as SyncRecordValuesResponse

  const pageBlock = pickBlock(pageResponse, pageId)
  const parentId = pageBlock?.value.parent_id
  const spaceId = pageBlock?.value.space_id
  const parentTable = pageBlock?.value.parent_table as string | undefined

  if (!parentId || !spaceId) {
    throw new Error(`Could not determine parent_id or space_id for page: ${pageId}`)
  }

  let listRemoveOp: Operation
  if (parentTable === 'team') {
    listRemoveOp = {
      pointer: { table: 'team', id: parentId, spaceId },
      command: 'listRemove',
      path: ['team_pages'],
      args: { id: pageId },
    }
  } else if (parentTable === 'space') {
    listRemoveOp = {
      pointer: { table: 'space', id: parentId, spaceId },
      command: 'listRemove',
      path: ['pages'],
      args: { id: pageId },
    }
  } else {
    listRemoveOp = {
      pointer: { table: 'block', id: parentId, spaceId },
      command: 'listRemove',
      path: ['content'],
      args: { id: pageId },
    }
  }

  const operations: Operation[] = [
    {
      pointer: { table: 'block', id: pageId, spaceId },
      command: 'update',
      path: [],
      args: { alive: false },
    },
    listRemoveOp,
  ]

  await internalRequest(tokenV2, 'saveTransactions', {
    requestId: generateId(),
    transactions: [{ id: generateId(), spaceId, operations }],
  })

  return { archived: true, id: pageId }
}

async function archiveAction(rawPageId: string, options: ArchivePageOptions): Promise<void> {
  try {
    const pageId = formatNotionId(rawPageId)
    const creds = await getCredentialsOrExit()
    const ctx = await ensureWorkspaceContext(creds, options.workspaceId, pageId)
    const result = await handlePageArchive(ctx.tokenV2, {
      page_id: pageId,
      workspaceId: ctx.workspaceId,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleNotionError(error)
  }
}

const WORKSPACE_ID_OPTION_DESC = 'Workspace ID (optional; auto-resolved from the target page when omitted)'

export const pageCommand = new Command('page')
  .description('Page commands')
  .addCommand(
    new Command('list')
      .description('List pages in a space')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--depth <n>', 'Recursion depth (default: 1)', '1')
      .option('--pretty', 'Pretty print JSON output')
      .action(listAction),
  )
  .addCommand(
    new Command('get')
      .description('Retrieve a page and its content')
      .argument('<page_id>')
      .option('--workspace-id <id>', WORKSPACE_ID_OPTION_DESC)
      .option('--limit <n>', 'Block limit')
      .option('--backlinks', 'Include backlinks (pages that link to this page)')
      .option('--pretty', 'Pretty print JSON output')
      .action(getAction),
  )
  .addCommand(
    new Command('create')
      .description('Create a new page')
      .option('--workspace-id <id>', 'Workspace ID (auto-resolved from --parent when omitted; required for root pages)')
      .option('--parent <id>', 'Parent page or block ID (optional, creates at workspace root if omitted)')
      .requiredOption('--title <title>', 'Page title')
      .option('--markdown <text>', 'Markdown content for page body')
      .option('--markdown-file <path>', 'Path to markdown file for page body')
      .option('--pretty', 'Pretty print JSON output')
      .action(createAction),
  )
  .addCommand(
    new Command('update')
      .description('Update page properties')
      .argument('<page_id>')
      .option('--workspace-id <id>', WORKSPACE_ID_OPTION_DESC)
      .option('--title <title>', 'New title')
      .option('--icon <emoji>', 'Page icon emoji')
      .option('--replace-content', 'Replace all page content')
      .option('--markdown <text>', 'Markdown content')
      .option('--markdown-file <path>', 'Path to markdown file')
      .option('--pretty', 'Pretty print JSON output')
      .action(updateAction),
  )
  .addCommand(
    new Command('properties')
      .description('Get page or database row properties (without content blocks)')
      .argument('<page_id>')
      .option('--workspace-id <id>', WORKSPACE_ID_OPTION_DESC)
      .option('--pretty', 'Pretty print JSON output')
      .action(propertiesAction),
  )
  .addCommand(
    new Command('archive')
      .description('Archive a page')
      .argument('<page_id>')
      .option('--workspace-id <id>', WORKSPACE_ID_OPTION_DESC)
      .option('--pretty', 'Pretty print JSON output')
      .action(archiveAction),
  )
