import { Command } from 'commander'
import { internalRequest } from '@/platforms/notion/client'
import {
  collectReferenceIds,
  enrichProperties,
  extractCollectionName,
  formatBlockRecord,
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
  | 'relation'
  | 'rollup'
  | 'formula'
  | 'auto_increment_id'
  | (string & {})

type CollectionProperty = {
  name: string
  type: CollectionPropertyType
  options?: unknown[]
  [key: string]: unknown
}

type CollectionOption = {
  id: string
  color: string
  value: string
}

type CollectionSchema = Record<string, CollectionProperty>

const OPTION_COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']

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

type SyncRecordValuesResponse = {
  recordMap?: {
    block?: Record<string, Record<string, unknown>>
    notion_user?: Record<string, Record<string, unknown>>
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
  filter?: string
  sort?: string
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

type AddRowOptions = WorkspaceOptions & {
  title: string
  properties?: string
}

type DeletePropertyOptions = WorkspaceOptions & {
  property: string
}

type ViewGetOptions = WorkspaceOptions

type ViewUpdateOptions = WorkspaceOptions & {
  show?: string
  hide?: string
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

function generateOptionId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function getOptionValue(option: unknown): string | undefined {
  if (!option || typeof option !== 'object') {
    return undefined
  }
  const value = (option as { value?: unknown }).value
  return typeof value === 'string' ? value : undefined
}

function getRecordValue(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const outer = record.value as Record<string, unknown> | undefined
  if (!outer) return undefined
  if (typeof outer.role === 'string' && outer.value !== undefined) {
    return outer.value as Record<string, unknown>
  }
  return outer
}

function buildPageLookup(blockMap: Record<string, Record<string, unknown>> | undefined): Record<string, string> {
  const lookup: Record<string, string> = {}
  if (!blockMap) return lookup

  for (const [id, record] of Object.entries(blockMap)) {
    const value = getRecordValue(record)
    if (!value) continue
    const properties = value.properties as Record<string, unknown> | undefined
    const titleSegments = properties?.title
    if (Array.isArray(titleSegments)) {
      const title = titleSegments
        .map((seg: unknown) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
        .join('')
      if (title) {
        lookup[id] = title
      }
    }
  }

  return lookup
}

function buildUserLookup(userMap: Record<string, Record<string, unknown>> | undefined): Record<string, string> {
  const lookup: Record<string, string> = {}
  if (!userMap) return lookup

  for (const [id, record] of Object.entries(userMap)) {
    const value = getRecordValue(record)
    if (!value) continue
    const name = value.name
    if (typeof name === 'string') {
      lookup[id] = name
    }
  }

  return lookup
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

    const loader: Record<string, unknown> = {
      type: 'reducer',
      reducers: {
        collection_group_results: {
          type: 'results',
          limit: options.limit ? Number(options.limit) : 50,
        },
      },
      searchQuery: options.searchQuery || '',
      userTimeZone: options.timezone || 'UTC',
    }

    if (options.filter) {
      loader.filter = JSON.parse(options.filter)
    }
    if (options.sort) {
      loader.sort = JSON.parse(options.sort)
    }

    const response = (await internalRequest(creds.token_v2, 'queryCollection', {
      collectionId,
      collectionViewId: viewId,
      loader,
    })) as QueryCollectionResponse

    const formatted = formatQueryCollectionResponse(response as Record<string, unknown>)
    const refs = collectReferenceIds(formatted.results)

    if (refs.pageIds.length > 0 || refs.userIds.length > 0) {
      const batch = (await internalRequest(creds.token_v2, 'syncRecordValues', {
        requests: [
          ...refs.pageIds.map((id) => ({ pointer: { table: 'block', id }, version: -1 })),
          ...refs.userIds.map((id) => ({ pointer: { table: 'notion_user', id }, version: -1 })),
        ],
      })) as SyncRecordValuesResponse

      const pageLookup = buildPageLookup(batch.recordMap?.block)
      const userLookup = buildUserLookup(batch.recordMap?.notion_user)
      enrichProperties(formatted.results, pageLookup, userLookup)
    }

    console.log(formatOutput(formatted, options.pretty))
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

async function deletePropertyAction(rawCollectionId: string, options: DeletePropertyOptions): Promise<void> {
  const collectionId = formatNotionId(rawCollectionId)
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
    const current = await fetchCollection(creds.token_v2, collectionId)
    const schema = current.schema ?? {}

    const nameToId: Record<string, string> = {}
    for (const [propId, prop] of Object.entries(schema)) {
      if (prop.alive === false) continue
      nameToId[prop.name] = propId
    }

    const propId = nameToId[options.property]
    if (!propId) {
      throw new Error(
        `Unknown property: "${options.property}". Available: ${Object.values(schema)
          .filter((p) => p.alive !== false)
          .map((p) => p.name)
          .join(', ')}`,
      )
    }

    if (schema[propId].type === 'title') {
      throw new Error('Cannot delete the title property')
    }

    const parentId = current.parent_id
    if (!parentId) {
      throw new Error(`Could not resolve parent block for collection: ${collectionId}`)
    }

    const spaceId = await resolveSpaceId(creds.token_v2, parentId)

    const newSchema = { ...schema }
    delete newSchema[propId]

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
              path: ['schema'],
              args: newSchema,
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

async function addRowAction(rawCollectionId: string, options: AddRowOptions): Promise<void> {
  const collectionId = formatNotionId(rawCollectionId)
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)

    const collection = await fetchCollection(creds.token_v2, collectionId)
    const parentBlockId = collection.parent_id
    if (!parentBlockId) {
      throw new Error(`Could not resolve parent block for collection: ${collectionId}`)
    }
    const spaceId = await resolveSpaceId(creds.token_v2, parentBlockId)

    const schema = collection.schema ?? {}
    const optionValuesToRegister: Record<string, string[]> = {}

    const registerSchemaOptionValue = (propId: string, value: string) => {
      const schemaEntry = schema[propId]
      const existingOptions = Array.isArray(schemaEntry.options) ? schemaEntry.options : []
      const existsInSchema = existingOptions.some((option) => getOptionValue(option) === value)
      if (existsInSchema) {
        return
      }

      const pendingValues = optionValuesToRegister[propId] ?? []
      if (!pendingValues.includes(value)) {
        optionValuesToRegister[propId] = [...pendingValues, value]
      }
    }

    const newRowId = generateId()
    const properties: Record<string, unknown> = { title: [[options.title]] }

    if (options.properties) {
      const nameToId: Record<string, string> = {}
      for (const [propId, prop] of Object.entries(schema)) {
        nameToId[prop.name] = propId
      }

      const parsed = JSON.parse(options.properties) as Record<string, unknown>
      for (const [name, value] of Object.entries(parsed)) {
        const propId = nameToId[name]
        if (!propId) {
          throw new Error(
            `Unknown property: "${name}". Available: ${Object.values(schema)
              .map((p) => p.name)
              .join(', ')}`,
          )
        }
        const propType = schema[propId].type
        if (propType === 'auto_increment_id') {
        } else if (propType === 'title') {
          properties.title = [[value as string]]
        } else if (propType === 'select' || propType === 'status') {
          const selectValue = value as string
          properties[propId] = [[selectValue]]
          if (propType === 'select') {
            registerSchemaOptionValue(propId, selectValue)
          }
        } else if (propType === 'multi_select') {
          const values = value as string[]
          const segments: string[] = []
          for (let i = 0; i < values.length; i++) {
            if (i > 0) segments.push(',')
            segments.push(values[i])
            registerSchemaOptionValue(propId, values[i])
          }
          properties[propId] = [segments]
        } else if (propType === 'number') {
          properties[propId] = [[String(value)]]
        } else if (propType === 'checkbox') {
          properties[propId] = [[value ? 'Yes' : 'No']]
        } else if (propType === 'date') {
          const dateValue = value as { start: string; end?: string }
          const dateArgs: Record<string, string> = {
            type: 'date',
            start_date: dateValue.start,
          }
          if (dateValue.end) {
            dateArgs.end_date = dateValue.end
          }
          properties[propId] = [['‣', [['d', dateArgs]]]]
        } else if (propType === 'url' || propType === 'email' || propType === 'phone_number') {
          properties[propId] = [[value as string]]
        } else if (propType === 'text') {
          properties[propId] = [[value as string]]
        } else if (propType === 'person') {
          const userIds = value as string[]
          const segments: unknown[] = []
          for (let i = 0; i < userIds.length; i++) {
            if (i > 0) {
              segments.push([','])
            }
            segments.push(['‣', [['u', userIds[i]]]])
          }
          properties[propId] = segments
        } else if (propType === 'relation') {
          const pageIds = value as string[]
          const segments: unknown[] = []
          for (let i = 0; i < pageIds.length; i++) {
            if (i > 0) {
              segments.push([','])
            }
            segments.push(['‣', [['p', formatNotionId(pageIds[i])]]])
          }
          properties[propId] = segments
        } else {
          properties[propId] = [[value as string]]
        }
      }
    }

    const viewId = await resolveCollectionViewId(creds.token_v2, collectionId)

    const schemaUpdateOperations = Object.entries(optionValuesToRegister).map(([propId, values]) => {
      const schemaEntry = schema[propId]
      const existingOptions = Array.isArray(schemaEntry.options) ? schemaEntry.options : []
      const newOptions: CollectionOption[] = values.map((value, index) => ({
        id: generateOptionId(),
        color: OPTION_COLORS[(existingOptions.length + index) % OPTION_COLORS.length],
        value,
      }))

      return {
        pointer: { table: 'collection' as const, id: collectionId, spaceId },
        command: 'update' as const,
        path: ['schema', propId],
        args: {
          ...schemaEntry,
          options: [...existingOptions, ...newOptions],
        },
      }
    })

    const operations = [
      ...schemaUpdateOperations,
      {
        pointer: { table: 'block' as const, id: newRowId, spaceId },
        command: 'set' as const,
        path: [] as string[],
        args: {
          type: 'page',
          id: newRowId,
          version: 1,
          parent_id: collectionId,
          parent_table: 'collection',
          alive: true,
          properties,
          space_id: spaceId,
        },
      },
      {
        pointer: { table: 'collection_view' as const, id: viewId, spaceId },
        command: 'listAfter' as const,
        path: ['page_sort'],
        args: { id: newRowId },
      },
    ]

    await internalRequest(creds.token_v2, 'saveTransactions', {
      requestId: generateId(),
      transactions: [{ id: generateId(), spaceId, operations }],
    })

    const created = (await internalRequest(creds.token_v2, 'syncRecordValues', {
      requests: [{ pointer: { table: 'block', id: newRowId }, version: -1 }],
    })) as { recordMap: { block: Record<string, Record<string, unknown>> } }

    const createdBlock = Object.values(created.recordMap.block)[0]
    console.log(formatOutput(formatBlockRecord(createdBlock), options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

type ViewRecord = {
  value: {
    id: string
    type: string
    name?: string
    format?: {
      collection_pointer?: { id: string; spaceId: string }
      [key: string]: unknown
    }
    parent_id?: string
    [key: string]: unknown
  }
}

type SyncViewResponse = {
  recordMap: {
    collection_view: Record<string, ViewRecord>
  }
}

type ViewProperty = {
  property: string
  visible: boolean
  width?: number
}

function viewPropertiesKey(viewType: string): string {
  return `${viewType}_properties`
}

async function fetchView(tokenV2: string, viewId: string): Promise<ViewRecord['value']> {
  const response = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'collection_view', id: viewId }, version: -1 }],
  })) as SyncViewResponse

  const view = Object.values(response.recordMap.collection_view)[0]?.value
  if (!view) {
    throw new Error(`View not found: ${viewId}`)
  }
  return view
}

async function resolveCollectionFromView(tokenV2: string, view: ViewRecord['value']): Promise<CollectionValue> {
  const collectionId = view.format?.collection_pointer?.id
  if (collectionId) {
    return fetchCollection(tokenV2, collectionId)
  }

  const parentId = view.parent_id
  if (!parentId) {
    throw new Error('Could not determine collection for view')
  }

  const blockResp = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'block', id: parentId }, version: -1 }],
  })) as { recordMap: { block: Record<string, { value: { collection_id?: string } }> } }

  const blockCollectionId = Object.values(blockResp.recordMap.block)[0]?.value?.collection_id
  if (!blockCollectionId) {
    throw new Error('Could not determine collection for view')
  }

  return fetchCollection(tokenV2, blockCollectionId)
}

async function viewGetAction(rawViewId: string, options: ViewGetOptions): Promise<void> {
  const viewId = formatNotionId(rawViewId)
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)

    const view = await fetchView(creds.token_v2, viewId)
    const viewType = view.type
    const format = view.format ?? {}

    const collection = await resolveCollectionFromView(creds.token_v2, view)
    const schema = collection.schema ?? {}

    const propsKey = viewPropertiesKey(viewType)
    const viewProps = (format[propsKey] ?? []) as ViewProperty[]

    const properties = Object.entries(schema).map(([propId, prop]) => {
      const viewProp = viewProps.find((vp) => vp.property === propId)
      return {
        name: prop.name,
        type: prop.type,
        visible: viewProp?.visible ?? propId === 'title',
      }
    })

    const output = {
      id: viewId,
      type: viewType,
      name: (view.name as string) || '',
      properties,
    }

    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

async function viewUpdateAction(rawViewId: string, options: ViewUpdateOptions): Promise<void> {
  const viewId = formatNotionId(rawViewId)
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)

    if (!options.show && !options.hide) {
      throw new Error('Provide --show or --hide with comma-separated property names')
    }

    const view = await fetchView(creds.token_v2, viewId)
    const viewType = view.type
    const format = view.format ?? {}

    const collection = await resolveCollectionFromView(creds.token_v2, view)
    const schema = collection.schema ?? {}

    const nameToId: Record<string, string> = {}
    for (const [propId, prop] of Object.entries(schema)) {
      nameToId[prop.name] = propId
    }

    const propsKey = viewPropertiesKey(viewType)
    const currentProps = (format[propsKey] ?? []) as ViewProperty[]

    const updatedProps = new Map<string, ViewProperty>()
    for (const vp of currentProps) {
      updatedProps.set(vp.property, { ...vp })
    }

    for (const propId of Object.keys(schema)) {
      if (!updatedProps.has(propId)) {
        updatedProps.set(propId, { property: propId, visible: propId === 'title' })
      }
    }

    const showNames = options.show ? options.show.split(',').map((s) => s.trim()) : []
    const hideNames = options.hide ? options.hide.split(',').map((s) => s.trim()) : []

    for (const name of showNames) {
      const propId = nameToId[name]
      if (!propId) {
        throw new Error(
          `Unknown property: "${name}". Available: ${Object.values(schema)
            .map((p) => p.name)
            .join(', ')}`,
        )
      }
      const entry = updatedProps.get(propId) ?? { property: propId, visible: false }
      entry.visible = true
      updatedProps.set(propId, entry)
    }

    for (const name of hideNames) {
      const propId = nameToId[name]
      if (!propId) {
        throw new Error(
          `Unknown property: "${name}". Available: ${Object.values(schema)
            .map((p) => p.name)
            .join(', ')}`,
        )
      }
      const entry = updatedProps.get(propId) ?? { property: propId, visible: true }
      entry.visible = false
      updatedProps.set(propId, entry)
    }

    const newProps = Array.from(updatedProps.values())

    const spaceId = format.collection_pointer?.spaceId
    if (!spaceId) {
      throw new Error('Could not determine space ID from view')
    }

    await internalRequest(creds.token_v2, 'saveTransactions', {
      requestId: generateId(),
      transactions: [
        {
          id: generateId(),
          spaceId,
          operations: [
            {
              pointer: { table: 'collection_view', id: viewId, spaceId },
              command: 'set',
              path: ['format', propsKey],
              args: newProps,
            },
          ],
        },
      ],
    })

    const updatedView = await fetchView(creds.token_v2, viewId)
    const updatedFormat = updatedView.format ?? {}
    const finalProps = (updatedFormat[propsKey] ?? []) as ViewProperty[]

    const properties = Object.entries(schema).map(([propId, prop]) => {
      const viewProp = finalProps.find((vp) => vp.property === propId)
      return {
        name: prop.name,
        type: prop.type,
        visible: viewProp?.visible ?? propId === 'title',
      }
    })

    console.log(
      formatOutput(
        {
          id: viewId,
          type: viewType,
          name: (updatedView.name as string) || '',
          properties,
        },
        options.pretty,
      ),
    )
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
      .option('--filter <json>', 'Filter as JSON (uses property IDs from database get schema)')
      .option('--sort <json>', 'Sort as JSON (uses property IDs from database get schema)')
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
  .addCommand(
    new Command('delete-property')
      .description('Delete a property from a database')
      .argument('<collection_id>')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .requiredOption('--property <name>', 'Property name to delete')
      .option('--pretty')
      .action(deletePropertyAction),
  )
  .addCommand(
    new Command('add-row')
      .description('Add a row to a database')
      .argument('<collection_id>')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .requiredOption('--title <title>', 'Row title (Name property)')
      .option('--properties <json>', 'Row properties as JSON (use property names from schema)')
      .option('--pretty')
      .action(addRowAction),
  )
  .addCommand(
    new Command('view-get')
      .description('Get view configuration and property visibility')
      .argument('<view_id>')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--pretty')
      .action(viewGetAction),
  )
  .addCommand(
    new Command('view-update')
      .description('Update property visibility on a view')
      .argument('<view_id>')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--show <names>', 'Comma-separated property names to show')
      .option('--hide <names>', 'Comma-separated property names to hide')
      .option('--pretty')
      .action(viewUpdateAction),
  )
