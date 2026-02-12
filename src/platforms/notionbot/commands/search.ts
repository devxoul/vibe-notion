import { Command } from 'commander'
import { handleError } from '../../../shared/utils/error-handler'
import { formatOutput } from '../../../shared/utils/output'
import { getClient } from '../client'

async function searchAction(
  query: string,
  options: {
    filter?: string
    sort?: string
    pageSize?: number
    startCursor?: string
    pretty?: boolean
  },
): Promise<void> {
  try {
    const client = getClient()

    const params: any = {
      query,
    }

    if (options.filter) {
      params.filter = { value: options.filter }
    }

    if (options.sort) {
      params.sort = {
        direction: options.sort === 'asc' ? 'ascending' : 'descending',
        timestamp: 'last_edited_time',
      }
    }

    if (options.pageSize) {
      params.page_size = options.pageSize
    }

    if (options.startCursor) {
      params.start_cursor = options.startCursor
    }

    const response = await client.search(params)

    const output = response.results.map((result: any) => ({
      id: result.id,
      object: result.object,
      title: result.title ? result.title.map((t: any) => t.plain_text).join('') : result.title,
      url: result.url,
      last_edited_time: result.last_edited_time,
    }))

    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

export const searchCommand = new Command('search')
  .description('Search across workspace')
  .argument('<query>', 'Search query')
  .option('--filter <type>', 'Filter by object type (page|database)')
  .option('--sort <direction>', 'Sort by last_edited_time (asc|desc)')
  .option('--page-size <n>', 'Number of results per page', (val) => parseInt(val, 10))
  .option('--start-cursor <cursor>', 'Pagination cursor')
  .option('--pretty', 'Pretty print JSON output')
  .action(searchAction)
