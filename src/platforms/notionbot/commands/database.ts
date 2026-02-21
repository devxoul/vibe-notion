import { Command } from 'commander'
import { getClient, type NotionClient } from '@/platforms/notionbot/client'
import { formatDatabase, formatDatabaseListResults, formatDatabaseQueryResults } from '@/platforms/notionbot/formatters'
import { handleError } from '@/shared/utils/error-handler'
import { formatNotionId } from '@/shared/utils/id'
import { formatOutput } from '@/shared/utils/output'

interface PrettyOption {
  pretty?: boolean
}

async function getAction(rawDatabaseId: string, options: PrettyOption): Promise<void> {
  const databaseId = formatNotionId(rawDatabaseId)
  try {
    const client = getClient()
    const result = await client.databases.retrieve({ database_id: databaseId })
    console.log(formatOutput(formatDatabase(result as Record<string, unknown>), options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function queryAction(
  rawDatabaseId: string,
  options: PrettyOption & {
    filter?: string
    sort?: string
    pageSize?: string
    startCursor?: string
  },
): Promise<void> {
  const databaseId = formatNotionId(rawDatabaseId)
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
    console.log(formatOutput(formatDatabaseQueryResults(result as Record<string, unknown>), options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function createAction(
  options: PrettyOption & { parent: string; title: string; properties?: string },
): Promise<void> {
  try {
    const client = getClient()
    const result = await handleDatabaseCreate(client, {
      parent: options.parent,
      title: options.title,
      properties: options.properties,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function updateAction(
  rawDatabaseId: string,
  options: PrettyOption & { title?: string; properties?: string },
): Promise<void> {
  try {
    const client = getClient()
    const result = await handleDatabaseUpdate(client, {
      database_id: rawDatabaseId,
      title: options.title,
      properties: options.properties,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function deletePropertyAction(
  rawDatabaseId: string,
  options: PrettyOption & { property: string },
): Promise<void> {
  try {
    const client = getClient()
    const result = await handleDatabaseDeleteProperty(client, {
      database_id: rawDatabaseId,
      property: options.property,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function listAction(options: PrettyOption & { pageSize?: string; startCursor?: string }): Promise<void> {
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
    console.log(formatOutput(formatDatabaseListResults(result as Record<string, unknown>), options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

export async function handleDatabaseCreate(
  client: NotionClient,
  args: { parent: string; title: string; properties?: string },
): Promise<unknown> {
  const parentId = formatNotionId(args.parent)
  const parsed = args.properties ? JSON.parse(args.properties) : {}
  const hasTitleProperty = Object.values(parsed).some((v: any) => v && typeof v === 'object' && 'title' in v)
  const properties = hasTitleProperty ? parsed : { Name: { title: {} }, ...parsed }

  // Use client.request() directly because the SDK (v5+) strips `properties`
  // from the body params of databases.create, causing the API to reject the request.
  const result = await client.request({
    path: 'databases',
    method: 'post',
    body: {
      parent: { type: 'page_id', page_id: parentId },
      title: [{ type: 'text', text: { content: args.title } }],
      properties,
    },
  })
  return formatDatabase(result as Record<string, unknown>)
}

export async function handleDatabaseUpdate(
  client: NotionClient,
  args: { database_id: string; title?: string; properties?: string },
): Promise<unknown> {
  const databaseId = formatNotionId(args.database_id)
  const body: Record<string, unknown> = {}

  if (args.title) {
    body.title = [{ type: 'text', text: { content: args.title } }]
  }
  if (args.properties) {
    body.properties = JSON.parse(args.properties)
  }

  // Use client.request() directly — same SDK workaround as handleDatabaseCreate
  const result = await client.request({
    path: `databases/${databaseId}`,
    method: 'patch',
    body,
  })
  return formatDatabase(result as Record<string, unknown>)
}

export async function handleDatabaseDeleteProperty(
  client: NotionClient,
  args: { database_id: string; property: string },
): Promise<unknown> {
  const databaseId = formatNotionId(args.database_id)
  const result = await client.request({
    path: `databases/${databaseId}`,
    method: 'patch',
    body: {
      properties: { [args.property]: null },
    },
  })
  return formatDatabase(result as Record<string, unknown>)
}

export const databaseCommand = new Command('database')
  .description('Database commands')
  .addCommand(
    new Command('get')
      .description('Retrieve a database schema')
      .argument('<database_id>', 'Database ID')
      .option('--pretty', 'Pretty print JSON output')
      .action(getAction),
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
      .action(queryAction),
  )
  .addCommand(
    new Command('create')
      .description('Create a database')
      .requiredOption('--parent <page_id>', 'Parent page ID')
      .requiredOption('--title <title>', 'Database title')
      .option('--properties <json>', 'Properties schema as JSON string')
      .option('--pretty', 'Pretty print JSON output')
      .action(createAction),
  )
  .addCommand(
    new Command('update')
      .description('Update a database schema')
      .argument('<database_id>', 'Database ID')
      .option('--title <title>', 'New database title')
      .option('--properties <json>', 'Properties schema as JSON string')
      .option('--pretty', 'Pretty print JSON output')
      .action(updateAction),
  )
  .addCommand(
    new Command('delete-property')
      .description('Delete a property from a database')
      .argument('<database_id>', 'Database ID')
      .requiredOption('--property <name>', 'Property name to delete')
      .option('--pretty', 'Pretty print JSON output')
      .action(deletePropertyAction),
  )
  .addCommand(
    new Command('list')
      .description('List all databases')
      .option('--page-size <n>', 'Number of results per page')
      .option('--start-cursor <cursor>', 'Pagination cursor')
      .option('--pretty', 'Pretty print JSON output')
      .action(listAction),
  )
