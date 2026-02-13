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
type UpdatePageOptions = WorkspaceOptions & { title?: string; icon?: string }
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

type BlockOperation = {
  pointer: {
    table: 'block'
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

async function createAction(options: CreatePageOptions): Promise<void> {
  const parent = formatNotionId(options.parent)
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
    const spaceId = await resolveSpaceId(creds.token_v2, parent)
    const newPageId = generateId()

    const operations: BlockOperation[] = [
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
          properties: { title: [[options.title]] },
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

    await internalRequest(creds.token_v2, 'saveTransactions', {
      requestId: generateId(),
      transactions: [{ id: generateId(), spaceId, operations }],
    })

    if (options.markdown || options.markdownFile) {
      const markdown = readMarkdownInput({ markdown: options.markdown, markdownFile: options.markdownFile })
      const blockDefs = markdownToBlocks(markdown)

      if (blockDefs.length > 0) {
        const blockOperations: BlockOperation[] = []

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

        await internalRequest(creds.token_v2, 'saveTransactions', {
          requestId: generateId(),
          transactions: [{ id: generateId(), spaceId, operations: blockOperations }],
        })
      }
    }

    const created = (await internalRequest(creds.token_v2, 'syncRecordValues', {
      requests: [{ pointer: { table: 'block', id: newPageId }, version: -1 }],
    })) as SyncRecordValuesResponse

    const createdPage = pickBlock(created, newPageId)
    console.log(formatOutput(formatBlockRecord(createdPage as unknown as Record<string, unknown>), options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

async function updateAction(rawPageId: string, options: UpdatePageOptions): Promise<void> {
  const pageId = formatNotionId(rawPageId)
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
    const spaceId = await resolveSpaceId(creds.token_v2, pageId)

    const operations: BlockOperation[] = []

    if (options.title) {
      operations.push({
        pointer: { table: 'block', id: pageId, spaceId },
        command: 'set',
        path: ['properties', 'title'],
        args: [[options.title]],
      })
    }

    if (options.icon) {
      operations.push({
        pointer: { table: 'block', id: pageId, spaceId },
        command: 'set',
        path: ['format', 'page_icon'],
        args: options.icon,
      })
    }

    if (operations.length === 0) {
      throw new Error('No updates provided. Use --title and/or --icon')
    }

    await internalRequest(creds.token_v2, 'saveTransactions', {
      requestId: generateId(),
      transactions: [{ id: generateId(), spaceId, operations }],
    })

    const updated = (await internalRequest(creds.token_v2, 'syncRecordValues', {
      requests: [{ pointer: { table: 'block', id: pageId }, version: -1 }],
    })) as SyncRecordValuesResponse

    const updatedPage = pickBlock(updated, pageId)
    console.log(formatOutput(formatBlockRecord(updatedPage as unknown as Record<string, unknown>), options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

async function archiveAction(rawPageId: string, options: ArchivePageOptions): Promise<void> {
  const pageId = formatNotionId(rawPageId)
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)

    const pageResponse = (await internalRequest(creds.token_v2, 'syncRecordValues', {
      requests: [{ pointer: { table: 'block', id: pageId }, version: -1 }],
    })) as SyncRecordValuesResponse

    const pageBlock = pickBlock(pageResponse, pageId)
    const parentId = pageBlock?.value.parent_id
    const spaceId = pageBlock?.value.space_id

    if (!parentId || !spaceId) {
      throw new Error(`Could not determine parent_id or space_id for page: ${pageId}`)
    }

    const operations: BlockOperation[] = [
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

    await internalRequest(creds.token_v2, 'saveTransactions', {
      requestId: generateId(),
      transactions: [{ id: generateId(), spaceId, operations }],
    })

    console.log(formatOutput({ archived: true, id: pageId }, options.pretty))
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
      .option('--pretty')
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
      .option('--pretty')
      .action(createAction),
  )
  .addCommand(
    new Command('update')
      .description('Update page properties')
      .argument('<page_id>')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--title <title>', 'New title')
      .option('--icon <emoji>', 'Page icon emoji')
      .option('--pretty')
      .action(updateAction),
  )
  .addCommand(
    new Command('archive')
      .description('Archive a page')
      .argument('<page_id>')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--pretty')
      .action(archiveAction),
  )
