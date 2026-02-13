import { Command } from 'commander'
import { internalRequest } from '@/platforms/notion/client'
import {
  extractCollectionName,
  formatCollectionValue,
  formatQueryCollectionResponse,
} from '@/platforms/notion/formatters'
import { formatNotionId } from '@/shared/utils/id'
import { formatOutput } from '@/shared/utils/output'
import {
  type CommandOptions,
  generateId,
  getCredentialsOrExit,
  resolveAndSetActiveUserId,
  resolveCollectionViewId,
  resolveSpaceId,
} from './helpers'

type WorkspaceOptions = CommandOptions & { workspaceId: string }

type CollectionPropertyType =
  | 'title'
  | 'text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'date'
  | 'person'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone_number'
  | 'status'

type CollectionProperty = {
  name: string
  type: CollectionPropertyType
  options?: unknown[]
  [key: string]: unknown
}

type CollectionSchema = Record<string, CollectionProperty>

type CollectionValue = {
  id: string
  name?: unknown
  schema?: CollectionSchema
  parent_id?: string
  parent_table?: string
  alive?: boolean
  space_id?: string
  [key: string]: unknown
}

type CollectionRecord = {
  value: CollectionValue
}

type SyncCollectionResponse = {
  recordMap: {
    collection?: Record<string, CollectionRecord>
  }
}

type QueryCollectionResponse = {
  result?: {
    reducerResults?: {
      collection_group_results?: {
        blockIds?: string[]
        hasMore?: boolean
        [key: string]: unknown
      }
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  recordMap?: {
    block?: Record<string, unknown>
    collection?: Record<string, unknown>
    [key: string]: unknown
  }
}

type LoadUserContentResponse = {
  recordMap: {
    collection?: Record<string, CollectionRecord>
  }
}

type GetOptions = WorkspaceOptions

type QueryOptions = WorkspaceOptions & {
  viewId?: string
  limit?: string
  searchQuery?: string
  timezone?: string
}

type ListOptions = WorkspaceOptions

type CreateOptions = WorkspaceOptions & {
  parent: string
  title: string
  properties?: string
}

type UpdateOptions = WorkspaceOptions & {
  title?: string
  properties?: string
}

function parseSchemaProperties(raw?: string): CollectionSchema {
  if (!raw) {
    return {}
  }

  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('properties must be a JSON object')
  }

  return parsed as CollectionSchema
}

async function fetchCollection(tokenV2: string, collectionId: string): Promise<CollectionValue> {
  const response = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'collection', id: collectionId }, version: -1 }],
  })) as SyncCollectionResponse

  const collection = Object.values(response.recordMap.collection ?? {})[0]?.value
  if (!collection) {
    throw new Error(`Collection not found: ${collectionId}`)
  }

  return collection
}

async function getAction(rawCollectionId: string, options: GetOptions): Promise<void> {
  const collectionId = formatNotionId(rawCollectionId)
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
    const collection = await fetchCollection(creds.token_v2, collectionId)
    console.log(formatOutput(formatCollectionValue(collection as Record<string, unknown>), options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

async function queryAction(rawCollectionId: string, options: QueryOptions): Promise<void> {
  const collectionId = formatNotionId(rawCollectionId)
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
    const viewId = options.viewId ?? (await resolveCollectionViewId(creds.token_v2, collectionId))

    const response = (await internalRequest(creds.token_v2, 'queryCollection', {
      collectionId,
      collectionViewId: viewId,
      loader: {
        type: 'reducer',
        reducers: {
          collection_group_results: {
            type: 'results',
            limit: options.limit ? Number(options.limit) : 50,
          },
        },
        searchQuery: options.searchQuery || '',
        userTimeZone: options.timezone || 'UTC',
      },
    })) as QueryCollectionResponse

    console.log(formatOutput(formatQueryCollectionResponse(response as Record<string, unknown>), options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

async function listAction(options: ListOptions): Promise<void> {
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
    const response = (await internalRequest(creds.token_v2, 'loadUserContent', {})) as LoadUserContentResponse

    const output = Object.values(response.recordMap.collection ?? {}).map((record) => {
      const collection = record.value
      const schema = collection.schema ?? {}
      return {
        id: collection.id,
        name: extractCollectionName(collection.name),
        schema_properties: Object.keys(schema),
      }
    })

    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

async function createAction(options: CreateOptions): Promise<void> {
  const parent = formatNotionId(options.parent)
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
    const spaceId = await resolveSpaceId(creds.token_v2, parent)
    const collId = generateId()
    const viewId = generateId()
    const blockId = generateId()
    const parsedProperties = parseSchemaProperties(options.properties)

    await internalRequest(creds.token_v2, 'saveTransactions', {
      requestId: generateId(),
      transactions: [
        {
          id: generateId(),
          spaceId,
          operations: [
            {
              pointer: { table: 'collection', id: collId, spaceId },
              command: 'set',
              path: [],
              args: {
                id: collId,
                name: [[options.title]],
                schema: {
                  title: { name: 'Name', type: 'title' },
                  ...parsedProperties,
                },
                parent_id: blockId,
                parent_table: 'block',
                alive: true,
                space_id: spaceId,
              },
            },
            {
              pointer: { table: 'collection_view', id: viewId, spaceId },
              command: 'set',
              path: [],
              args: {
                id: viewId,
                type: 'table',
                name: 'Default view',
                parent_id: blockId,
                parent_table: 'block',
                alive: true,
                version: 1,
              },
            },
            {
              pointer: { table: 'block', id: blockId, spaceId },
              command: 'set',
              path: [],
              args: {
                type: 'collection_view_page',
                id: blockId,
                collection_id: collId,
                view_ids: [viewId],
                parent_id: parent,
                parent_table: 'block',
                alive: true,
                space_id: spaceId,
                version: 1,
              },
            },
            {
              pointer: { table: 'block', id: parent, spaceId },
              command: 'listAfter',
              path: ['content'],
              args: { id: blockId },
            },
          ],
        },
      ],
    })

    const created = await fetchCollection(creds.token_v2, collId)
    console.log(formatOutput(formatCollectionValue(created as Record<string, unknown>), options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

async function updateAction(rawCollectionId: string, options: UpdateOptions): Promise<void> {
  const collectionId = formatNotionId(rawCollectionId)
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
    const current = await fetchCollection(creds.token_v2, collectionId)

    if (!options.title && !options.properties) {
      console.log(formatOutput(formatCollectionValue(current as Record<string, unknown>), options.pretty))
      return
    }

    const parentId = current.parent_id
    if (!parentId) {
      throw new Error(`Could not resolve parent block for collection: ${collectionId}`)
    }

    const spaceId = await resolveSpaceId(creds.token_v2, parentId)
    const updateArgs: {
      name?: string[][]
      schema?: CollectionSchema
    } = {}

    if (options.title) {
      updateArgs.name = [[options.title]]
    }

    if (options.properties) {
      const parsedProperties = parseSchemaProperties(options.properties)
      updateArgs.schema = {
        ...(current.schema ?? {}),
        ...parsedProperties,
      }
    }

    await internalRequest(creds.token_v2, 'saveTransactions', {
      requestId: generateId(),
      transactions: [
        {
          id: generateId(),
          spaceId,
          operations: [
            {
              pointer: { table: 'collection', id: collectionId, spaceId },
              command: 'update',
              path: [],
              args: updateArgs,
            },
          ],
        },
      ],
    })

    const updated = await fetchCollection(creds.token_v2, collectionId)
    console.log(formatOutput(formatCollectionValue(updated as Record<string, unknown>), options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

export const databaseCommand = new Command('database')
  .description('Database commands')
  .addCommand(
    new Command('get')
      .description('Retrieve database schema')
      .argument('<collection_id>')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--pretty')
      .action(getAction),
  )
  .addCommand(
    new Command('query')
      .description('Query a database')
      .argument('<collection_id>')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--view-id <id>', 'Collection view ID (auto-resolved if omitted)')
      .option('--limit <n>', 'Results limit')
      .option('--search-query <q>', 'Search within results')
      .option('--timezone <tz>', 'User timezone')
      .option('--pretty')
      .action(queryAction),
  )
  .addCommand(
    new Command('list')
      .description('List all databases')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--pretty')
      .action(listAction),
  )
  .addCommand(
    new Command('create')
      .description('Create a database')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .requiredOption('--parent <id>', 'Parent page ID')
      .requiredOption('--title <title>', 'Database title')
      .option('--properties <json>', 'Schema properties as JSON')
      .option('--pretty')
      .action(createAction),
  )
  .addCommand(
    new Command('update')
      .description('Update database')
      .argument('<collection_id>')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--title <title>', 'New title')
      .option('--properties <json>', 'Schema properties as JSON')
      .option('--pretty')
      .action(updateAction),
  )
