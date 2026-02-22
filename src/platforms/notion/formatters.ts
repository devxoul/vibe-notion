export type MentionRef = { id: string; type: 'page'; title?: string } | { id: string; type: 'user'; name?: string }

export type PropertyValue =
  | { type: 'title'; value: string; mentions?: MentionRef[] }
  | { type: 'text'; value: string; mentions?: MentionRef[] }
  | { type: 'number'; value: number | null }
  | { type: 'select'; value: string }
  | { type: 'multi_select'; value: string[] }
  | { type: 'date'; value: { start: string; end?: string } | null }
  | { type: 'person'; value: string[] | Array<{ id: string; name: string }> }
  | { type: 'relation'; value: string[] | Array<{ id: string; title: string }> }
  | { type: 'rollup'; value: unknown }
  | { type: 'checkbox'; value: boolean }
  | { type: 'url'; value: string }
  | { type: 'email'; value: string }
  | { type: 'phone_number'; value: string }
  | { type: 'status'; value: string }
  | { type: 'formula'; value: unknown }
  | { type: 'auto_increment_id'; value: number | null; prefix?: string }
  | { type: string; value: unknown }

export type BacklinkEntry = {
  id: string
  title: string
}

export type SimplifiedBlock = {
  id: string
  type: string
  text: string
  checked?: boolean
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
  checked?: boolean
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
    ...(type === 'to_do' ? { checked: extractChecked(block) } : {}),
    content: content.length > 0 ? content : undefined,
    parent_id: toOptionalString(block.parent_id),
    ...(collectionId ? { collection_id: collectionId } : {}),
    ...(viewIds.length > 0 ? { view_ids: viewIds } : {}),
  }
}

export function formatBlockChildren(
  blocks: Array<Record<string, unknown>>,
  hasMore: boolean,
  nextCursor: string | null,
): {
  results: Array<{ id: string; type: string; text: string; checked?: boolean }>
  has_more: boolean
  next_cursor: string | null
} {
  return {
    results: blocks.map((block) => {
      const type = toStringValue(block.type)
      return {
        id: toStringValue(block.id),
        type,
        text: extractBlockText(block),
        ...(type === 'to_do' ? { checked: extractChecked(block) } : {}),
      }
    }),
    has_more: hasMore,
    next_cursor: nextCursor,
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

export function formatBacklinks(
  response: Record<string, unknown>,
  userLookup: Record<string, string> = {},
): BacklinkEntry[] {
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
      const title = blockValue ? extractTitleWithMentions(blockValue, userLookup) : ''

      return { id: sourceBlockId, title }
    })
    .filter((entry): entry is BacklinkEntry => entry !== undefined)
}

export function collectBacklinkUserIds(response: Record<string, unknown>): string[] {
  const recordMap = toRecord(response.recordMap)
  const blockMap = toRecordMap(recordMap?.block)
  const userIds = new Set<string>()

  for (const record of Object.values(blockMap)) {
    const value = getRecordValue(record)
    if (!value) continue
    const properties = toRecord(value.properties)
    if (!properties) continue
    const titleSegments = properties.title
    if (!Array.isArray(titleSegments)) continue

    for (const segment of titleSegments) {
      if (!Array.isArray(segment) || segment.length < 2) continue
      if (!Array.isArray(segment[1])) continue
      for (const deco of segment[1]) {
        if (Array.isArray(deco) && deco[0] === 'u' && typeof deco[1] === 'string') {
          userIds.add(deco[1])
        }
      }
    }
  }

  return [...userIds]
}

function extractTitleWithMentions(block: Record<string, unknown>, userLookup: Record<string, string>): string {
  const properties = toRecord(block.properties)
  const titleSegments = properties?.title
  if (!Array.isArray(titleSegments)) return ''

  const parts: string[] = []
  for (const segment of titleSegments) {
    if (!Array.isArray(segment)) continue
    const text = segment[0]

    if (text === '‣' && Array.isArray(segment[1])) {
      let resolved = false
      for (const deco of segment[1]) {
        if (Array.isArray(deco) && deco[0] === 'u' && typeof deco[1] === 'string') {
          const name = userLookup[deco[1]]
          if (name) {
            parts.push(name)
            resolved = true
          }
        }
      }
      if (!resolved) {
        parts.push('‣')
      }
    } else if (typeof text === 'string') {
      parts.push(text)
    }
  }

  return parts.join('').trim()
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

export type SimplifiedSchemaProperty = { type: string } & Record<string, unknown>

export function simplifyCollectionSchema(
  schema: Record<string, Record<string, unknown>>,
): Record<string, SimplifiedSchemaProperty> {
  const simplified: Record<string, SimplifiedSchemaProperty> = {}

  // Build propId → name lookup for resolving rollup references
  const propIdToName: Record<string, string> = {}
  for (const [propId, entry] of Object.entries(schema)) {
    const name = toOptionalString(entry.name)
    if (name && entry.alive !== false) {
      propIdToName[propId] = name
    }
  }

  for (const entry of Object.values(schema)) {
    if (entry.alive === false) continue

    const name = toOptionalString(entry.name)
    const type = toOptionalString(entry.type)

    if (!name || !type) {
      continue
    }

    const prop: SimplifiedSchemaProperty = { type }

    switch (type) {
      case 'select':
      case 'multi_select':
      case 'status': {
        if (Array.isArray(entry.options) && entry.options.length > 0) {
          const values = entry.options
            .map((opt: unknown) => {
              if (opt && typeof opt === 'object') {
                const v = (opt as Record<string, unknown>).value
                return typeof v === 'string' ? v : undefined
              }
              return undefined
            })
            .filter(Boolean) as string[]
          if (values.length > 0) prop.options = values
        }
        break
      }
      case 'relation': {
        const collectionId = toOptionalString(entry.collection_id)
        if (collectionId) prop.collection_id = collectionId
        break
      }
      case 'rollup': {
        const relationProperty = toOptionalString(entry.relation_property)
        if (relationProperty) {
          prop.relation_property = propIdToName[relationProperty] ?? relationProperty
        }
        const targetProperty = toOptionalString(entry.target_property)
        if (targetProperty) prop.target_property = targetProperty
        const targetPropertyType = toOptionalString(entry.target_property_type)
        if (targetPropertyType) prop.target_property_type = targetPropertyType
        break
      }
      case 'auto_increment_id': {
        const prefix = toOptionalString(entry.prefix)
        if (prefix) prop.prefix = prefix
        break
      }
    }

    simplified[name] = prop
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
  schema: Record<string, SimplifiedSchemaProperty>
  $hints?: string[]
} {
  const rawSchema = toRecordMap(collection.schema)
  const hints = validateCollectionSchema(rawSchema)
  const result: {
    id: string
    name: string
    schema: Record<string, SimplifiedSchemaProperty>
    $hints?: string[]
  } = {
    id: toStringValue(collection.id),
    name: extractCollectionName(collection.name),
    schema: simplifyCollectionSchema(rawSchema),
  }
  if (hints.length > 0) {
    result.$hints = hints
  }
  return result
}

export function validateCollectionSchema(rawSchema: Record<string, Record<string, unknown>>): string[] {
  const hints: string[] = []

  for (const [propId, entry] of Object.entries(rawSchema)) {
    const name = toOptionalString(entry.name) ?? propId
    const type = toOptionalString(entry.type) ?? 'unknown'

    if (entry.alive === false) {
      hints.push(
        `Property '${name}' (${type}) is soft-deleted but still in raw schema. ` +
          `It is hidden from output. No action needed unless you want to recreate the database cleanly.`,
      )
      continue
    }

    if (type === 'rollup') {
      const relPropId = toOptionalString(entry.relation_property)
      if (!relPropId) {
        hints.push(
          `Rollup '${name}' has no relation_property reference. ` +
            `This is a malformed property that may crash the Notion app. ` +
            `Fix: run \`database delete-property --property "${name}"\` to remove it.`,
        )
      } else {
        const relProp = rawSchema[relPropId]
        if (!relProp) {
          hints.push(
            `Rollup '${name}' references non-existent relation property '${relPropId}'. ` +
              `This is a broken reference that may crash the Notion app. ` +
              `Fix: run \`database delete-property --property "${name}"\` to remove it.`,
          )
        } else if (relProp.alive === false) {
          const relName = toOptionalString(relProp.name) ?? relPropId
          hints.push(
            `Rollup '${name}' depends on deleted relation '${relName}'. ` +
              `This rollup will return empty values. ` +
              `Fix: run \`database delete-property --property "${name}"\` to remove it.`,
          )
        }
      }

      const targetPropId = toOptionalString(entry.target_property)
      if (!targetPropId) {
        hints.push(
          `Rollup '${name}' has no target_property reference. ` +
            `This is a malformed property that may crash the Notion app. ` +
            `Fix: run \`database delete-property --property "${name}"\` to remove it.`,
        )
      }

      if (!toOptionalString(entry.rollup_type)) {
        hints.push(
          `Rollup '${name}' is missing rollup_type. ` +
            `This may crash the Notion app. ` +
            `Fix: run \`database delete-property --property "${name}"\` and recreate the rollup.`,
        )
      }

      if (toOptionalString(entry.aggregation)) {
        hints.push(
          `Rollup '${name}' has an aggregation field which crashes the Notion app. ` +
            `Fix: run \`database delete-property --property "${name}"\` and recreate the rollup.`,
        )
      }
    }

    if (type === 'relation') {
      if (!entry.collection_id) {
        hints.push(
          `Relation '${name}' has no target collection reference. ` +
            `This is a broken relation that may crash the Notion app. ` +
            `Fix: run \`database delete-property --property "${name}"\` to remove it.`,
        )
      }
    }
  }

  return hints
}

export function formatQueryCollectionResponse(response: Record<string, unknown>): {
  results: Array<{ id: string; properties: Record<string, PropertyValue> }>
  has_more: boolean
  next_cursor: null
  $hints?: string[]
} {
  const result = toRecord(response.result)
  const reducerResults = toRecord(result?.reducerResults)
  const collectionGroupResults = toRecord(reducerResults?.collection_group_results)
  const blockIds = toStringArray(collectionGroupResults?.blockIds)
  const hasMore = collectionGroupResults?.hasMore === true

  const recordMap = toRecord(response.recordMap)
  const blockMap = toRecordMap(recordMap?.block)
  const schemaMap = extractSchemaMap(recordMap)

  const rawSchema = extractRawSchema(recordMap)
  const hints = validateCollectionSchema(rawSchema)

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

  const formatted: {
    results: typeof results
    has_more: boolean
    next_cursor: null
    $hints?: string[]
  } = {
    results,
    has_more: hasMore,
    next_cursor: null,
  }
  if (hints.length > 0) {
    formatted.$hints = hints
  }
  return formatted
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

    const type = toStringValue(child.type)
    const node: SimplifiedBlock = {
      id: toStringValue(child.id),
      type,
      text: extractBlockText(child),
    }

    if (type === 'to_do') {
      node.checked = extractChecked(child)
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

function extractRawSchema(recordMap: Record<string, unknown> | undefined): Record<string, Record<string, unknown>> {
  if (!recordMap) return {}
  const collMap = toRecordMap(recordMap.collection)
  const firstColl = getRecordValue(Object.values(collMap)[0])
  if (!firstColl) return {}
  return toRecordMap(firstColl.schema)
}

function extractSchemaMap(
  recordMap: Record<string, unknown> | undefined,
): Record<string, { name: string; type: string }> {
  const rawSchema = extractRawSchema(recordMap)
  if (Object.keys(rawSchema).length === 0) return {}
  const result: Record<string, { name: string; type: string; prefix?: string }> = {}
  for (const [propId, entry] of Object.entries(rawSchema)) {
    if (entry.alive === false) continue

    const name = toOptionalString(entry.name)
    const type = toOptionalString(entry.type)
    if (name && type) {
      const prefix = toOptionalString(entry.prefix)
      result[propId] = prefix ? { name, type, prefix } : { name, type }
    }
  }
  return result
}

function formatRowProperties(
  block: Record<string, unknown>,
  schemaMap: Record<string, { name: string; type: string; prefix?: string }>,
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

  for (const [propId, { name, type, prefix }] of Object.entries(schemaMap)) {
    result[name] = extractPropertyValue(properties[propId], type, prefix)
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
          const dateObj = val as Record<string, unknown>
          const dateStr = toOptionalString(dateObj.start_date)
          if (dateStr) {
            const endDateStr = toOptionalString(dateObj.end_date)
            parts.push(endDateStr ? `${dateStr} → ${endDateStr}` : dateStr)
          }
        } else if ((marker === 'u' || marker === 'p') && typeof val === 'string') {
          parts.push(val)
        }
      }
    }
  }
  return parts.join('')
}

function extractPropertyValue(value: unknown, schemaType: string, prefix?: string): PropertyValue {
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
    case 'auto_increment_id': {
      const text = extractPropertyText(value)
      const num = Number.parseFloat(text)
      return { type: 'auto_increment_id' as const, value: Number.isNaN(num) ? null : num, prefix }
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

function extractChecked(block: Record<string, unknown>): boolean {
  const properties = toRecord(block.properties)
  if (!properties) return false
  return extractPropertyText(properties.checked) === 'Yes'
}

function extractDateValue(value: unknown): { start: string; end?: string } | null {
  if (!Array.isArray(value)) return null

  for (const segment of value) {
    if (!Array.isArray(segment) || segment.length < 2) continue
    if (!Array.isArray(segment[1])) continue

    for (const deco of segment[1]) {
      if (!Array.isArray(deco) || deco.length < 2) continue
      if (deco[0] === 'd' && deco[1] && typeof deco[1] === 'object' && !Array.isArray(deco[1])) {
        const dateObj = deco[1] as Record<string, unknown>
        const start = toOptionalString(dateObj.start_date)
        if (!start) continue
        const end = toOptionalString(dateObj.end_date)
        return end ? { start, end } : { start }
      }
    }
  }
  return null
}

export type CommentAttachment = {
  id: string
  type: string
  name: string
  source: string
}

export function formatCommentAttachment(block: Record<string, unknown>): CommentAttachment | undefined {
  const type = toStringValue(block.type)
  if (type !== 'image' && type !== 'file') return undefined

  const properties = toRecord(block.properties)
  if (!properties) return undefined

  const name = extractPropertyText(properties.title)
  const source = extractPropertyText(properties.source)

  return {
    id: toStringValue(block.id),
    type,
    name,
    source,
  }
}

export function formatCommentValue(
  comment: Record<string, unknown>,
  blocks?: Record<string, Record<string, unknown>>,
): {
  id: string
  text: string
  discussion_id: string
  created_by: string
  created_time: number
  attachments?: CommentAttachment[]
} {
  const text = comment.text
  let extractedText = ''
  if (Array.isArray(text)) {
    extractedText = extractCommentText(text)
  }

  const contentIds = toStringArray(comment.content)
  let attachments: CommentAttachment[] | undefined
  if (contentIds.length > 0 && blocks) {
    const resolved = contentIds
      .map((id) => {
        const blockRecord = blocks[id]
        if (!blockRecord) return undefined
        const blockValue = getRecordValue(blockRecord)
        if (!blockValue) return undefined
        return formatCommentAttachment(blockValue)
      })
      .filter((a): a is CommentAttachment => a !== undefined)
    if (resolved.length > 0) {
      attachments = resolved
    }
  }

  return {
    id: toStringValue(comment.id),
    text: extractedText,
    discussion_id: toStringValue(comment.parent_id),
    created_by: toStringValue(comment.created_by_id),
    created_time: typeof comment.created_time === 'number' ? comment.created_time : 0,
    ...(attachments ? { attachments } : {}),
  }
}

function extractCommentText(segments: unknown[]): string {
  const parts: string[] = []
  for (const segment of segments) {
    if (!Array.isArray(segment) || segment.length === 0) continue
    const text = segment[0]
    if (typeof text === 'string') {
      parts.push(text)
    }
  }
  return parts.join('')
}

type FormattedComment = {
  id: string
  discussion_id: string
  text: string
  created_by: string
  created_time: number
  attachments?: CommentAttachment[]
}

export function formatDiscussionComments(
  discussions: Record<string, Record<string, unknown>>,
  comments: Record<string, Record<string, unknown>>,
  pageId: string,
  blocks?: Record<string, Record<string, unknown>>,
): {
  results: FormattedComment[]
  total: number
} {
  const results: FormattedComment[] = []

  for (const [discussionId, discussionRecord] of Object.entries(discussions)) {
    const discussion = getRecordValue(discussionRecord)
    if (!discussion) continue

    const parentId = toStringValue(discussion.parent_id)
    if (parentId !== pageId) continue

    const commentIds = toStringArray(discussion.comments)
    for (const commentId of commentIds) {
      const commentRecord = comments[commentId]
      if (!commentRecord) continue

      const comment = getRecordValue(commentRecord)
      if (!comment) continue

      const formatted = formatCommentValue(comment, blocks)
      const entry: FormattedComment = {
        id: formatted.id,
        discussion_id: discussionId,
        text: formatted.text,
        created_by: formatted.created_by,
        created_time: formatted.created_time,
      }
      if (formatted.attachments) {
        entry.attachments = formatted.attachments
      }
      results.push(entry)
    }
  }

  return {
    results,
    total: results.length,
  }
}
