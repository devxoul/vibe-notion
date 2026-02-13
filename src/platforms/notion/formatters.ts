export type MentionRef = { id: string; type: 'page'; title?: string } | { id: string; type: 'user'; name?: string }

export type PropertyValue =
  | { type: 'title'; value: string; mentions?: MentionRef[] }
  | { type: 'text'; value: string; mentions?: MentionRef[] }
  | { type: 'number'; value: number | null }
  | { type: 'select'; value: string }
  | { type: 'multi_select'; value: string[] }
  | { type: 'date'; value: string | null }
  | { type: 'person'; value: string[] | Array<{ id: string; name: string }> }
  | { type: 'relation'; value: string[] | Array<{ id: string; title: string }> }
  | { type: 'rollup'; value: unknown }
  | { type: 'checkbox'; value: boolean }
  | { type: 'url'; value: string }
  | { type: 'email'; value: string }
  | { type: 'phone_number'; value: string }
  | { type: 'status'; value: string }
  | { type: 'formula'; value: unknown }
  | { type: string; value: unknown }

export type BacklinkEntry = {
  id: string
  title: string
}

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

export function formatPageGet(
  blocks: Record<string, Record<string, unknown>>,
  pageId: string,
): {
  id: string
  title: string
  blocks: SimplifiedBlock[]
} {
  const root = getRecordValue(blocks[pageId])
  const content = toStringArray(root?.content)

  return {
    id: pageId,
    title: root ? extractNotionTitle(root) : '',
    blocks: buildPageChildren(blocks, content),
  }
}

export function formatBacklinks(response: Record<string, unknown>): BacklinkEntry[] {
  const backlinks = response.backlinks
  if (!Array.isArray(backlinks)) return []

  const blockMap = toRecordMap(toRecord(response.recordMap)?.block)
  const seen = new Set<string>()

  return backlinks
    .map((entry) => {
      const record = toRecord(entry)
      if (!record) return undefined

      const mentionedFrom = toRecord(record.mentioned_from)
      const sourceBlockId = toOptionalString(mentionedFrom?.block_id)
      if (!sourceBlockId) return undefined
      if (seen.has(sourceBlockId)) return undefined
      seen.add(sourceBlockId)

      const blockValue = getRecordValue(blockMap[sourceBlockId])
      const title = blockValue ? extractNotionTitle(blockValue) : ''

      return { id: sourceBlockId, title }
    })
    .filter((entry): entry is BacklinkEntry => entry !== undefined)
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
  results: Array<{ id: string; properties: Record<string, PropertyValue> }>
  has_more: boolean
} {
  const result = toRecord(response.result)
  const reducerResults = toRecord(result?.reducerResults)
  const collectionGroupResults = toRecord(reducerResults?.collection_group_results)
  const blockIds = toStringArray(collectionGroupResults?.blockIds)
  const hasMore = collectionGroupResults?.hasMore === true

  const recordMap = toRecord(response.recordMap)
  const blockMap = toRecordMap(recordMap?.block)
  const schemaMap = extractSchemaMap(recordMap)

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
    .filter((entry): entry is { id: string; properties: Record<string, PropertyValue> } => entry !== undefined)

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

export function collectReferenceIds(results: Array<{ id: string; properties: Record<string, PropertyValue> }>): {
  pageIds: string[]
  userIds: string[]
} {
  const pageIdSet = new Set<string>()
  const userIdSet = new Set<string>()

  for (const row of results) {
    for (const prop of Object.values(row.properties)) {
      if (prop.type === 'relation' && Array.isArray(prop.value)) {
        for (const entry of prop.value) {
          if (typeof entry === 'string') {
            pageIdSet.add(entry)
          }
        }
      } else if (prop.type === 'person' && Array.isArray(prop.value)) {
        for (const entry of prop.value) {
          if (typeof entry === 'string') {
            userIdSet.add(entry)
          }
        }
      }

      if (prop.type === 'title' || prop.type === 'text') {
        const mentions = (prop as { mentions?: MentionRef[] }).mentions
        if (mentions) {
          for (const mention of mentions) {
            if (mention.type === 'page') {
              pageIdSet.add(mention.id)
            } else if (mention.type === 'user') {
              userIdSet.add(mention.id)
            }
          }
        }
      }
    }
  }

  return { pageIds: [...pageIdSet], userIds: [...userIdSet] }
}

export function enrichProperties(
  results: Array<{ id: string; properties: Record<string, PropertyValue> }>,
  pageLookup: Record<string, string>,
  userLookup: Record<string, string>,
): void {
  for (const row of results) {
    for (const [name, prop] of Object.entries(row.properties)) {
      if (prop.type === 'relation' && Array.isArray(prop.value)) {
        row.properties[name] = {
          type: 'relation',
          value: (prop.value as string[]).map((id) => ({
            id,
            title: pageLookup[id] ?? id,
          })),
        }
      } else if (prop.type === 'person' && Array.isArray(prop.value)) {
        row.properties[name] = {
          type: 'person',
          value: (prop.value as string[]).map((id) => ({
            id,
            name: userLookup[id] ?? id,
          })),
        }
      }

      if (prop.type === 'title' || prop.type === 'text') {
        const mentions = (prop as { mentions?: MentionRef[] }).mentions
        if (mentions) {
          let resolvedValue = prop.value as string
          const resolvedMentions: MentionRef[] = mentions.map((mention) => {
            if (mention.type === 'page') {
              const title = pageLookup[mention.id] ?? mention.id
              resolvedValue = resolvedValue.replace(mention.id, title)
              return { id: mention.id, type: 'page' as const, title }
            }
            const userName = userLookup[mention.id] ?? mention.id
            resolvedValue = resolvedValue.replace(mention.id, userName)
            return { id: mention.id, type: 'user' as const, name: userName }
          })
          row.properties[name] = {
            type: prop.type as 'title' | 'text',
            value: resolvedValue,
            mentions: resolvedMentions,
          }
        }
      }
    }
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
  const outer = toRecord(record.value)
  if (!outer) return undefined
  // Notion wraps records as { value: { value: {...}, role } }
  if (typeof outer.role === 'string' && outer.value !== undefined) {
    return toRecord(outer.value)
  }
  return outer
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

function extractSchemaMap(
  recordMap: Record<string, unknown> | undefined,
): Record<string, { name: string; type: string }> {
  if (!recordMap) return {}
  const collMap = toRecordMap(recordMap.collection)
  const firstColl = getRecordValue(Object.values(collMap)[0])
  if (!firstColl) return {}

  const rawSchema = toRecordMap(firstColl.schema)
  const result: Record<string, { name: string; type: string }> = {}
  for (const [propId, entry] of Object.entries(rawSchema)) {
    const name = toOptionalString(entry.name)
    const type = toOptionalString(entry.type)
    if (name && type) {
      result[propId] = { name, type }
    }
  }
  return result
}

function formatRowProperties(
  block: Record<string, unknown>,
  schemaMap: Record<string, { name: string; type: string }>,
): Record<string, PropertyValue> {
  const result: Record<string, PropertyValue> = {}
  const properties = toRecord(block.properties)
  if (!properties) return result

  if (Object.keys(schemaMap).length === 0) {
    const title = extractPropertyText(properties.title)
    if (title) {
      result.title = { type: 'title', value: title }
    }
    return result
  }

  for (const [propId, { name, type }] of Object.entries(schemaMap)) {
    result[name] = extractPropertyValue(properties[propId], type)
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

function extractPropertyValue(value: unknown, schemaType: string): PropertyValue {
  switch (schemaType) {
    case 'person':
    case 'relation': {
      const ids = extractDecoratorIds(value, schemaType === 'person' ? 'u' : 'p')
      return { type: schemaType, value: ids }
    }
    case 'date': {
      const dateStr = extractDateValue(value)
      return { type: 'date', value: dateStr }
    }
    case 'number': {
      const text = extractPropertyText(value)
      const num = Number.parseFloat(text)
      return { type: 'number', value: Number.isNaN(num) ? null : num }
    }
    case 'checkbox': {
      const text = extractPropertyText(value)
      return { type: 'checkbox', value: text === 'Yes' }
    }
    case 'multi_select': {
      const text = extractPropertyText(value)
      return { type: 'multi_select', value: text ? text.split(',') : [] }
    }
    case 'title':
    case 'text': {
      const text = extractPropertyText(value)
      const mentions = extractMentionRefs(value)
      if (mentions.length > 0) {
        return { type: schemaType as 'title' | 'text', value: text, mentions }
      }
      return { type: schemaType, value: text }
    }
    case 'url':
    case 'email':
    case 'phone_number':
    case 'status':
    case 'select':
      return { type: schemaType, value: extractPropertyText(value) }
    case 'rollup':
    case 'formula':
      return { type: schemaType, value: extractPropertyText(value) }
    default:
      return { type: schemaType, value: extractPropertyText(value) }
  }
}

function extractMentionRefs(value: unknown): MentionRef[] {
  if (!Array.isArray(value)) return []

  const refs: MentionRef[] = []
  for (const segment of value) {
    if (!Array.isArray(segment) || segment.length < 2) continue
    if (!Array.isArray(segment[1])) continue

    for (const deco of segment[1]) {
      if (!Array.isArray(deco) || deco.length < 2) continue
      if (deco[0] === 'p' && typeof deco[1] === 'string') {
        refs.push({ id: deco[1], type: 'page' })
      } else if (deco[0] === 'u' && typeof deco[1] === 'string') {
        refs.push({ id: deco[1], type: 'user' })
      }
    }
  }
  return refs
}

function extractDecoratorIds(value: unknown, marker: string): string[] {
  if (!Array.isArray(value)) return []

  const ids: string[] = []
  for (const segment of value) {
    if (!Array.isArray(segment) || segment.length < 2) continue
    if (!Array.isArray(segment[1])) continue

    for (const deco of segment[1]) {
      if (!Array.isArray(deco) || deco.length < 2) continue
      if (deco[0] === marker && typeof deco[1] === 'string') {
        ids.push(deco[1])
      }
    }
  }
  return ids
}

function extractDateValue(value: unknown): string | null {
  if (!Array.isArray(value)) return null

  for (const segment of value) {
    if (!Array.isArray(segment) || segment.length < 2) continue
    if (!Array.isArray(segment[1])) continue

    for (const deco of segment[1]) {
      if (!Array.isArray(deco) || deco.length < 2) continue
      if (deco[0] === 'd' && deco[1] && typeof deco[1] === 'object' && !Array.isArray(deco[1])) {
        const dateStr = toOptionalString((deco[1] as Record<string, unknown>).start_date)
        if (dateStr) return dateStr
      }
    }
  }
  return null
}
