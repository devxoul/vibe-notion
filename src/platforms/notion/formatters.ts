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
} {
  const content = toStringArray(block.content)

  return {
    id: toStringValue(block.id),
    type: toStringValue(block.type),
    text: extractBlockText(block),
    content: content.length > 0 ? content : undefined,
    parent_id: toOptionalString(block.parent_id),
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

export function formatQueryCollectionResponse(response: Record<string, unknown>): {
  results: Array<{ id: string; type: string; text: string }>
  has_more: boolean
} {
  const result = toRecord(response.result)
  const reducerResults = toRecord(result?.reducerResults)
  const collectionGroupResults = toRecord(reducerResults?.collection_group_results)
  const blockIds = toStringArray(collectionGroupResults?.blockIds)
  const hasMore = collectionGroupResults?.hasMore === true

  const recordMap = toRecord(response.recordMap)
  const blockMap = toRecordMap(recordMap?.block)

  const results = blockIds
    .map((blockId) => {
      const blockValue = getRecordValue(blockMap[blockId])
      if (!blockValue) {
        return undefined
      }

      return {
        id: toStringValue(blockValue.id),
        type: toStringValue(blockValue.type),
        text: extractBlockText(blockValue),
      }
    })
    .filter((entry): entry is { id: string; type: string; text: string } => entry !== undefined)

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
  return toRecord(record?.value)
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
