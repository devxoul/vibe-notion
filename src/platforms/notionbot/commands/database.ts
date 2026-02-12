import { Command } from 'commander'
import { handleError } from '../../../shared/utils/error-handler'
import { formatOutput } from '../../../shared/utils/output'
import { getClient } from '../client'

interface PrettyOption {
  pretty?: boolean
}

async function getAction(databaseId: string, options: PrettyOption): Promise<void> {
  try {
    const client = getClient()
    const result = await client.databases.retrieve({ database_id: databaseId })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function queryAction(
  databaseId: string,
  options: PrettyOption & {
    filter?: string
    sort?: string
    pageSize?: string
    startCursor?: string
  }
): Promise<void> {
  try {
    const client = getClient()
    const body: Record<string, unknown> = {}

    if (options.filter) {
      body.filter = JSON.parse(options.filter)
    }
    if (options.sort) {
      body.sorts = JSON.parse(options.sort)
    }
    if (options.pageSize) {
      body.page_size = Number(options.pageSize)
    }
    if (options.startCursor) {
      body.start_cursor = options.startCursor
    }

    const result = await client.request({
      method: 'post',
      path: `databases/${databaseId}/query`,
      body,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function createAction(
  options: PrettyOption & { parent: string; title: string; properties?: string }
): Promise<void> {
  try {
    const client = getClient()
    const properties = options.properties ? JSON.parse(options.properties) : {}

    const result = await client.databases.create({
      parent: { type: 'page_id', page_id: options.parent },
      title: [{ type: 'text', text: { content: options.title } }],
      properties,
    } as any)
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function updateAction(
  databaseId: string,
  options: PrettyOption & { title?: string; properties?: string }
): Promise<void> {
  try {
    const client = getClient()
    const params: Record<string, unknown> = { database_id: databaseId }

    if (options.title) {
      params.title = [{ type: 'text', text: { content: options.title } }]
    }
    if (options.properties) {
      params.properties = JSON.parse(options.properties)
    }

    const result = await client.databases.update(params as any)
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function listAction(
  options: PrettyOption & { pageSize?: string; startCursor?: string }
): Promise<void> {
  try {
    const client = getClient()
    const params: Record<string, unknown> = {
      filter: { property: 'object', value: 'database' },
    }

    if (options.pageSize) {
      params.page_size = Number(options.pageSize)
    }
    if (options.startCursor) {
      params.start_cursor = options.startCursor
    }

    const result = await client.search(params as any)
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

export const databaseCommand = new Command('database')
  .description('Database commands')
  .addCommand(
    new Command('get')
      .description('Retrieve a database schema')
      .argument('<database_id>', 'Database ID')
      .option('--pretty', 'Pretty print JSON output')
      .action(getAction)
  )
  .addCommand(
    new Command('query')
      .description('Query a database')
      .argument('<database_id>', 'Database ID')
      .option('--filter <json>', 'Filter as JSON string')
      .option('--sort <json>', 'Sort as JSON string')
      .option('--page-size <n>', 'Number of results per page')
      .option('--start-cursor <cursor>', 'Pagination cursor')
      .option('--pretty', 'Pretty print JSON output')
      .action(queryAction)
  )
  .addCommand(
    new Command('create')
      .description('Create a database')
      .requiredOption('--parent <page_id>', 'Parent page ID')
      .requiredOption('--title <title>', 'Database title')
      .option('--properties <json>', 'Properties schema as JSON string')
      .option('--pretty', 'Pretty print JSON output')
      .action(createAction)
  )
  .addCommand(
    new Command('update')
      .description('Update a database schema')
      .argument('<database_id>', 'Database ID')
      .option('--title <title>', 'New database title')
      .option('--properties <json>', 'Properties schema as JSON string')
      .option('--pretty', 'Pretty print JSON output')
      .action(updateAction)
  )
  .addCommand(
    new Command('list')
      .description('List all databases')
      .option('--page-size <n>', 'Number of results per page')
      .option('--start-cursor <cursor>', 'Pagination cursor')
      .option('--pretty', 'Pretty print JSON output')
      .action(listAction)
  )
