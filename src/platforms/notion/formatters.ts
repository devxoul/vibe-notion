export type SimplifiedBlock = {
  id: string
  type: string
  text: string
  children?: SimplifiedBlock[]
}

export function extractNotionTitle(block: Record<string, unknown>): string {
  const title = block.properties as { title?: string[][] } | undefined
  if (title?.title) {
    return title.title.map((segment: string[]) => segment[0]).join('')
  }
  return ''
}

export function extractBlockText(block: Record<string, unknown>): string {
  return extractNotionTitle(block)
}

export function formatBlockValue(block: Record<string, unknown>): {
  id: string
  type: string
  text: string
  content: string[] | undefined
  parent_id: string | undefined
  collection_id?: string
  view_ids?: string[]
} {
  const content = toStringArray(block.content)
  const type = toStringValue(block.type)
  const isCollection = type === 'collection_view' || type === 'collection_view_page'
  const viewIds = isCollection ? toStringArray(block.view_ids) : []
  const collectionId = isCollection ? toOptionalString(block.collection_id) : undefined

  return {
    id: toStringValue(block.id),
    type,
    text: extractBlockText(block),
    content: content.length > 0 ? content : undefined,
    parent_id: toOptionalString(block.parent_id),
    ...(collectionId ? { collection_id: collectionId } : {}),
    ...(viewIds.length > 0 ? { view_ids: viewIds } : {}),
  }
}

export function formatBlockChildren(
  blocks: Array<Record<string, unknown>>,
  hasMore: boolean,
): {
  results: Array<{ id: string; type: string; text: string }>
  has_more: boolean
} {
  return {
    results: blocks.map((block) => ({
      id: toStringValue(block.id),
      type: toStringValue(block.type),
      text: extractBlockText(block),
    })),
    has_more: hasMore,
  }
}

export function formatBlockUpdate(block: Record<string, unknown>): {
  id: string
  type: string
} {
  return {
    id: toStringValue(block.id),
    type: toStringValue(block.type),
  }
}

export function formatPageGet(blocks: Record<string, Record<string, unknown>>, pageId: string): SimplifiedBlock[] {
  const root = getRecordValue(blocks[pageId])
  const content = toStringArray(root?.content)

  return buildPageChildren(blocks, content)
}

export function formatBlockRecord(record: Record<string, unknown>): {
  id: string
  title: string
  type: string
} {
  const value = toRecord(record.value) ?? {}

  return {
    id: toStringValue(value.id),
    title: extractNotionTitle(value),
    type: toStringValue(value.type),
  }
}

export function simplifyCollectionSchema(schema: Record<string, Record<string, unknown>>): Record<string, string> {
  const simplified: Record<string, string> = {}

  for (const entry of Object.values(schema)) {
    const name = toOptionalString(entry.name)
    const type = toOptionalString(entry.type)

    if (!name || !type) {
      continue
    }

    simplified[name] = type
  }

  return simplified
}

export function extractCollectionName(name: unknown): string {
  if (!Array.isArray(name)) {
    return ''
  }

  return name
    .map((segment) => {
      if (!Array.isArray(segment)) {
        return ''
      }
      return typeof segment[0] === 'string' ? segment[0] : ''
    })
    .join('')
}

export function formatCollectionValue(collection: Record<string, unknown>): {
  id: string
  name: string
  schema: Record<string, string>
} {
  return {
    id: toStringValue(collection.id),
    name: extractCollectionName(collection.name),
    schema: simplifyCollectionSchema(toRecordMap(collection.schema)),
  }
}

export function formatQueryCollectionResponse(
  response: Record<string, unknown>,
  fullBlocks?: Record<string, unknown>,
  schema?: Record<string, unknown>,
): {
  results: Array<{ id: string; properties: Record<string, string> }>
  has_more: boolean
} {
  const result = toRecord(response.result)
  const reducerResults = toRecord(result?.reducerResults)
  const collectionGroupResults = toRecord(reducerResults?.collection_group_results)
  const blockIds = toStringArray(collectionGroupResults?.blockIds)
  const hasMore = collectionGroupResults?.hasMore === true

  const recordMap = toRecord(response.recordMap)
  const blockMap = toRecordMap(fullBlocks ?? recordMap?.block)
  const schemaMap = simplifySchemaMap(schema ?? extractSchemaFromRecordMap(recordMap))

  const results = blockIds
    .map((blockId) => {
      const blockValue = getRecordValue(blockMap[blockId])
      if (!blockValue) {
        return undefined
      }

      return {
        id: toStringValue(blockValue.id),
        properties: formatRowProperties(blockValue, schemaMap),
      }
    })
    .filter((entry): entry is { id: string; properties: Record<string, string> } => entry !== undefined)

  return {
    results,
    has_more: hasMore,
  }
}

export function formatUserValue(user: Record<string, unknown>): {
  id: string
  name: string | undefined
  email: string | undefined
} {
  return {
    id: toStringValue(user.id),
    name: toOptionalString(user.name),
    email: toOptionalString(user.email),
  }
}

function buildPageChildren(blocks: Record<string, Record<string, unknown>>, childIds: string[]): SimplifiedBlock[] {
  const children: SimplifiedBlock[] = []

  for (const childId of childIds) {
    const child = getRecordValue(blocks[childId])
    if (!child) {
      continue
    }

    const node: SimplifiedBlock = {
      id: toStringValue(child.id),
      type: toStringValue(child.type),
      text: extractBlockText(child),
    }

    const nestedIds = toStringArray(child.content)
    if (nestedIds.length > 0) {
      node.children = buildPageChildren(blocks, nestedIds)
    }

    children.push(node)
  }

  return children
}

function getRecordValue(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!record) return undefined
  if (typeof record.spaceId === 'string') {
    const inner = toRecord(record.value)
    return inner ? toRecord(inner.value) : undefined
  }
  return toRecord(record.value)
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return value as Record<string, unknown>
}

function toRecordMap(value: unknown): Record<string, Record<string, unknown>> {
  const source = toRecord(value)
  if (!source) {
    return {}
  }

  const map: Record<string, Record<string, unknown>> = {}

  for (const [key, entry] of Object.entries(source)) {
    const record = toRecord(entry)
    if (record) {
      map[key] = record
    }
  }

  return map
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((entry): entry is string => typeof entry === 'string')
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function extractSchemaFromRecordMap(recordMap: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!recordMap) return {}
  const collMap = toRecordMap(recordMap.collection)
  const firstColl = getRecordValue(Object.values(collMap)[0])
  if (!firstColl) return {}

  return toRecordMap(firstColl.schema)
}

function simplifySchemaMap(schema: Record<string, unknown>): Record<string, string> {
  const schemaMap = toRecordMap(schema)
  const result: Record<string, string> = {}
  for (const [propId, entry] of Object.entries(schemaMap)) {
    const name = toOptionalString(entry.name)
    if (name) {
      result[propId] = name
    }
  }
  return result
}

function formatRowProperties(
  block: Record<string, unknown>,
  schemaMap: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {}
  const properties = toRecord(block.properties)
  if (!properties) return result

  if (Object.keys(schemaMap).length === 0) {
    const title = extractPropertyText(properties.title)
    if (title) {
      result.title = title
    }
    return result
  }

  for (const [propId, propName] of Object.entries(schemaMap)) {
    result[propName] = extractPropertyText(properties[propId])
  }
  return result
}

function extractPropertyText(value: unknown): string {
  if (!Array.isArray(value)) return ''

  const parts: string[] = []
  for (const segment of value) {
    if (!Array.isArray(segment) || segment.length === 0) continue

    const text = segment[0]
    if (typeof text === 'string' && text !== '‣') {
      parts.push(text)
      continue
    }

    if (Array.isArray(segment[1])) {
      for (const deco of segment[1]) {
        if (!Array.isArray(deco) || deco.length < 2) continue
        const [marker, val] = deco
        if (marker === 'd' && val && typeof val === 'object' && !Array.isArray(val)) {
          const dateStr = toOptionalString((val as Record<string, unknown>).start_date)
          if (dateStr) parts.push(dateStr)
        } else if ((marker === 'u' || marker === 'p') && typeof val === 'string') {
          parts.push(val)
        }
      }
    }
  }
  return parts.join('')
}
