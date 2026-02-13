import { Command } from 'commander'
import { internalRequest } from '@/platforms/notion/client'
import { formatOutput } from '@/shared/utils/output'
import { type CommandOptions, getCredentialsOrExit, resolveAndSetActiveUserId } from './helpers'

type SearchOptions = CommandOptions & {
  workspaceId: string
  limit?: string
  startCursor?: string
  navigableOnly?: boolean
}

type SearchResult = {
  id: string
  highlight?: {
    title?: string
  }
  score: number
  spaceId: string
}

type SearchResponse = {
  results: SearchResult[]
  total: number
}

async function searchAction(query: string, options: SearchOptions): Promise<void> {
  try {
    const limit = options.limit ? Number(options.limit) : 20
    const startOffset = parseStartCursor(options.startCursor)
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
    const spaceId = options.workspaceId
    const body = {
      type: 'BlocksInSpace',
      query: query,
      ...(spaceId ? { spaceId } : {}),
      limit,
      ...(options.startCursor ? { start: startOffset } : {}),
      filters: {
        isDeletedOnly: false,
        excludeTemplates: false,
        navigableBlockContentOnly: options.navigableOnly !== false,
        requireEditPermissions: false,
        ancestors: [],
        createdBy: [],
        editedBy: [],
        lastEditedTime: {},
        createdTime: {},
      },
      sort: { field: 'relevance' },
      source: 'quick_find',
    }

    const data = (await internalRequest(creds.token_v2, 'search', body)) as SearchResponse
    const hasMore = data.results.length === limit && startOffset + data.results.length < data.total
    const output = {
      results: data.results.map((r) => ({
        id: r.id,
        title: r.highlight?.title || '',
        score: r.score,
      })),
      has_more: hasMore,
      next_cursor: hasMore ? String(startOffset + data.results.length) : null,
      total: data.total,
    }

    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

function parseStartCursor(rawCursor: string | undefined): number {
  if (!rawCursor) {
    return 0
  }

  const parsed = Number(rawCursor)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('start-cursor must be a non-negative integer')
  }
  return parsed
}

export const searchCommand = new Command('search')
  .description('Search across workspace')
  .argument('<query>', 'Search query')
  .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
  .option('--limit <n>', 'Number of results')
  .option('--start-cursor <n>', 'Pagination offset from previous response')
  .option('--pretty', 'Pretty print JSON output')
  .action(searchAction)
