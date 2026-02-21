import { Command } from 'commander'
import { internalRequest } from '@/platforms/notion/client'
import { formatBacklinks, formatBlockRecord, formatPageGet } from '@/platforms/notion/formatters'
import { readMarkdownInput } from '@/shared/markdown/read-input'
import { markdownToBlocks } from '@/shared/markdown/to-notion-internal'
import { formatNotionId } from '@/shared/utils/id'
import { formatOutput } from '@/shared/utils/output'
import {
  type CommandOptions,
  generateId,
  getCredentialsOrExit,
  resolveAndSetActiveUserId,
  resolveBacklinkUsers,
  resolveSpaceId,
} from './helpers'

type WorkspaceOptions = CommandOptions & { workspaceId: string }
type ListPageOptions = WorkspaceOptions & { depth?: string }
type LoadPageChunkOptions = WorkspaceOptions & { limit?: string; backlinks?: boolean }
type CreatePageOptions = WorkspaceOptions & { parent: string; title: string; markdown?: string; markdownFile?: string }
type UpdatePageOptions = WorkspaceOptions & {
  title?: string
  icon?: string
  replaceContent?: boolean
  markdown?: string
  markdownFile?: string
}
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
  }
}

type SyncRecordValuesResponse = {
  recordMap: {
    block: Record<string, BlockRecord>
  }
}

type Operation = {
  pointer: {
    table: 'block' | 'collection'
    id: string
    spaceId: string
  }
  command: 'set' | 'listAfter' | 'update' | 'listRemove'
  path: string[]
  args: unknown
}

function pickBlock(response: SyncRecordValuesResponse, blockId: string): BlockRecord | undefined {
  return response.recordMap.block[blockId] ?? Object.values(response.recordMap.block)[0]
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

  const space = allSpaces.find((s) => s.value.id === spaceId)

  if (!space) {
    throw new Error(`Space not found: ${spaceId}`)
  }

  return { id: space.value.id, pages: space.value.pages ?? [] }
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
    if (!record?.value) continue

    const block = record.value
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
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

async function getAction(rawPageId: string, options: LoadPageChunkOptions): Promise<void> {
  const pageId = formatNotionId(rawPageId)
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)

    let cursor: { stack: unknown[] } = { stack: [] }
    let chunkNumber = 0
    const blocks: Record<string, BlockRecord> = {}

    do {
      const chunk = (await internalRequest(creds.token_v2, 'loadPageChunk', {
        pageId,
        limit: options.limit ? Number(options.limit) : 100,
        cursor,
        chunkNumber,
        verticalColumns: false,
      })) as LoadPageChunkResponse

      Object.assign(blocks, chunk.recordMap.block)
      cursor = chunk.cursor
      chunkNumber += 1
    } while (cursor.stack.length > 0)

    const result = formatPageGet(blocks as unknown as Record<string, Record<string, unknown>>, pageId)

    if (options.backlinks) {
      const backlinksResponse = (await internalRequest(creds.token_v2, 'getBacklinksForBlock', {
        blockId: pageId,
      })) as Record<string, unknown>
      const userLookup = await resolveBacklinkUsers(creds.token_v2, backlinksResponse)
      const output = { ...result, backlinks: formatBacklinks(backlinksResponse, userLookup) }
      console.log(formatOutput(output, options.pretty))
    } else {
      console.log(formatOutput(result, options.pretty))
    }
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

export async function handlePageCreate(
  tokenV2: string,
  args: { parent: string; title: string; markdown?: string; markdownFile?: string; workspaceId: string },
): Promise<unknown> {
  const parent = formatNotionId(args.parent)
  await resolveAndSetActiveUserId(tokenV2, args.workspaceId)
  const spaceId = await resolveSpaceId(tokenV2, parent)
  const newPageId = generateId()

  const operations: Operation[] = [
    {
      pointer: { table: 'block', id: newPageId, spaceId },
      command: 'set',
      path: [],
      args: {
        type: 'page',
        id: newPageId,
        version: 1,
        parent_id: parent,
        parent_table: 'block',
        alive: true,
        properties: { title: [[args.title]] },
        space_id: spaceId,
      },
    },
    {
      pointer: { table: 'block', id: parent, spaceId },
      command: 'listAfter',
      path: ['content'],
      args: { id: newPageId },
    },
  ]

  await internalRequest(tokenV2, 'saveTransactions', {
    requestId: generateId(),
    transactions: [{ id: generateId(), spaceId, operations }],
  })

  if (args.markdown || args.markdownFile) {
    const markdown = readMarkdownInput({ markdown: args.markdown, markdownFile: args.markdownFile })
    const blockDefs = markdownToBlocks(markdown)

    if (blockDefs.length > 0) {
      const blockOperations: Operation[] = []

      for (const def of blockDefs) {
        const newBlockId = generateId()

        blockOperations.push(
          {
            pointer: { table: 'block', id: newBlockId, spaceId },
            command: 'set',
            path: [],
            args: {
              type: def.type,
              id: newBlockId,
              version: 1,
              parent_id: newPageId,
              parent_table: 'block',
              alive: true,
              properties: def.properties ?? {},
              space_id: spaceId,
            },
          },
          {
            pointer: { table: 'block', id: newPageId, spaceId },
            command: 'listAfter',
            path: ['content'],
            args: { id: newBlockId },
          },
        )
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
    const result = await handlePageCreate(creds.token_v2, {
      parent: options.parent,
      title: options.title,
      markdown: options.markdown,
      markdownFile: options.markdownFile,
      workspaceId: options.workspaceId,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
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

    const md = readMarkdownInput({ markdown: args.markdown, markdownFile: args.markdownFile })
    const newBlocks = markdownToBlocks(md)

    const pageChunk = (await internalRequest(tokenV2, 'loadPageChunk', {
      pageId,
      limit: 100,
      cursor: { stack: [] },
      chunkNumber: 0,
      verticalColumns: false,
    })) as LoadPageChunkResponse

    const parentBlock = pageChunk.recordMap.block[pageId]?.value
    const existingChildIds = (parentBlock?.content as string[] | undefined) ?? []

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

    const appendOps: Operation[] = newBlocks.flatMap((def) => {
      const newBlockId = generateId()
      return [
        {
          pointer: { table: 'block' as const, id: newBlockId, spaceId },
          command: 'set' as const,
          path: [] as string[],
          args: {
            type: def.type,
            id: newBlockId,
            version: 1,
            parent_id: pageId,
            parent_table: 'block',
            alive: true,
            properties: def.properties ?? {},
            space_id: spaceId,
          },
        },
        {
          pointer: { table: 'block' as const, id: pageId, spaceId },
          command: 'listAfter' as const,
          path: ['content'],
          args: { id: newBlockId },
        },
      ]
    })

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
    const creds = await getCredentialsOrExit()
    const result = await handlePageUpdate(creds.token_v2, {
      page_id: rawPageId,
      title: options.title,
      icon: options.icon,
      replaceContent: options.replaceContent,
      markdown: options.markdown,
      markdownFile: options.markdownFile,
      workspaceId: options.workspaceId,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
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

  if (!parentId || !spaceId) {
    throw new Error(`Could not determine parent_id or space_id for page: ${pageId}`)
  }

  const operations: Operation[] = [
    {
      pointer: { table: 'block', id: pageId, spaceId },
      command: 'update',
      path: [],
      args: { alive: false },
    },
    {
      pointer: { table: 'block', id: parentId, spaceId },
      command: 'listRemove',
      path: ['content'],
      args: { id: pageId },
    },
  ]

  await internalRequest(tokenV2, 'saveTransactions', {
    requestId: generateId(),
    transactions: [{ id: generateId(), spaceId, operations }],
  })

  return { archived: true, id: pageId }
}

async function archiveAction(rawPageId: string, options: ArchivePageOptions): Promise<void> {
  try {
    const creds = await getCredentialsOrExit()
    const result = await handlePageArchive(creds.token_v2, {
      page_id: rawPageId,
      workspaceId: options.workspaceId,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

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
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--limit <n>', 'Block limit')
      .option('--backlinks', 'Include backlinks (pages that link to this page)')
      .option('--pretty', 'Pretty print JSON output')
      .action(getAction),
  )
  .addCommand(
    new Command('create')
      .description('Create a new page')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .requiredOption('--parent <id>', 'Parent page or block ID')
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
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--title <title>', 'New title')
      .option('--icon <emoji>', 'Page icon emoji')
      .option('--replace-content', 'Replace all page content')
      .option('--markdown <text>', 'Markdown content')
      .option('--markdown-file <path>', 'Path to markdown file')
      .option('--pretty', 'Pretty print JSON output')
      .action(updateAction),
  )
  .addCommand(
    new Command('archive')
      .description('Archive a page')
      .argument('<page_id>')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--pretty', 'Pretty print JSON output')
      .action(archiveAction),
  )
