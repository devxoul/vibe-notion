function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return value as Record<string, unknown>
}

function toStringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toCursor(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function extractPlainText(richText: unknown): string {
  if (!Array.isArray(richText)) {
    return ''
  }

  return richText
    .map((item) => {
      const richTextItem = item as Record<string, unknown>
      return toStringOrEmpty(richTextItem.plain_text)
    })
    .join('')
}

export function extractPageTitle(page: Record<string, unknown>): string {
  const properties = toRecord(page.properties)
  if (!properties) {
    return ''
  }

  for (const value of Object.values(properties)) {
    const property = toRecord(value)
    if (!property) {
      continue
    }

    if (property.type === 'title') {
      return extractPlainText(property.title)
    }
  }

  return ''
}

export function simplifyUser(user: Record<string, unknown>): { id: string; name?: string } {
  const id = toStringOrEmpty(user.id)
  const name = user.name

  if (typeof name === 'string') {
    return { id, name }
  }

  return { id }
}

export function simplifyPropertyValue(prop: Record<string, unknown>): unknown {
  const propType = toStringOrEmpty(prop.type)

  switch (propType) {
    case 'title':
      return extractPlainText(prop.title)
    case 'rich_text':
      return extractPlainText(prop.rich_text)
    case 'number':
      return prop.number
    case 'select': {
      const select = toRecord(prop.select)
      return select?.name ?? null
    }
    case 'multi_select': {
      if (!Array.isArray(prop.multi_select)) {
        return []
      }
      return prop.multi_select.map((item) => {
        const option = item as Record<string, unknown>
        return option.name
      })
    }
    case 'date': {
      if (prop.date === null) {
        return null
      }

      const date = toRecord(prop.date)
      if (!date) {
        return null
      }

      return {
        start: date.start,
        end: date.end,
      }
    }
    case 'checkbox':
      return prop.checkbox
    case 'url':
      return prop.url
    case 'email':
      return prop.email
    case 'phone_number':
      return prop.phone_number
    case 'status': {
      const status = toRecord(prop.status)
      return status?.name ?? null
    }
    case 'people': {
      if (!Array.isArray(prop.people)) {
        return []
      }

      return prop.people.map((item) => {
        const person = item as Record<string, unknown>
        return simplifyUser(person)
      })
    }
    case 'relation': {
      if (!Array.isArray(prop.relation)) {
        return []
      }

      return prop.relation.map((item) => {
        const relation = item as Record<string, unknown>
        return relation.id
      })
    }
    case 'formula': {
      const formula = toRecord(prop.formula)
      if (!formula) {
        return null
      }

      const formulaType = toStringOrEmpty(formula.type)
      if (formulaType === 'date') {
        if (formula.date === null) {
          return null
        }

        const date = toRecord(formula.date)
        if (!date) {
          return null
        }

        return {
          start: date.start,
          end: date.end,
        }
      }

      if (!formulaType) {
        return null
      }

      return formula[formulaType]
    }
    case 'rollup': {
      const rollup = toRecord(prop.rollup)
      if (!rollup) {
        return {
          type: '',
          value: null,
          function: null,
        }
      }

      const rollupType = toStringOrEmpty(rollup.type)
      let value: unknown

      if (rollupType === 'array') {
        const rollupArray = Array.isArray(rollup.array) ? rollup.array : []
        value = rollupArray.map((item) => {
          const rollupItem = item as Record<string, unknown>
          return simplifyPropertyValue(rollupItem)
        })
      } else {
        value = rollupType ? rollup[rollupType] : null
      }

      return {
        type: rollupType,
        value,
        function: rollup.function,
      }
    }
    case 'created_time':
      return prop.created_time
    case 'last_edited_time':
      return prop.last_edited_time
    case 'created_by':
      return simplifyUser(toRecord(prop.created_by) ?? {})
    case 'last_edited_by':
      return simplifyUser(toRecord(prop.last_edited_by) ?? {})
    case 'files': {
      if (!Array.isArray(prop.files)) {
        return []
      }

      return prop.files
        .map((item) => {
          const file = item as Record<string, unknown>
          if (file.type === 'external') {
            const external = toRecord(file.external)
            return toStringOrEmpty(external?.url)
          }

          const internalFile = toRecord(file.file)
          return toStringOrEmpty(internalFile?.url)
        })
        .filter((url) => Boolean(url))
    }
    case 'unique_id': {
      const uniqueId = toRecord(prop.unique_id)
      if (!uniqueId) {
        return null
      }

      return {
        prefix: uniqueId.prefix,
        number: uniqueId.number,
      }
    }
    case 'verification':
      return prop.verification
    default:
      return {
        type: propType,
        value: propType ? prop[propType] : undefined,
      }
  }
}

export function simplifyProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const simplified: Record<string, unknown> = {}

  for (const [name, value] of Object.entries(properties)) {
    simplified[name] = simplifyPropertyValue(toRecord(value) ?? {})
  }

  return simplified
}

export function extractBlockContent(block: Record<string, unknown>): string {
  const blockType = toStringOrEmpty(block.type)
  if (!blockType) {
    return ''
  }

  const typeData = toRecord(block[blockType]) ?? {}

  switch (blockType) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'bulleted_list_item':
    case 'numbered_list_item':
    case 'quote':
    case 'callout':
    case 'toggle':
    case 'to_do':
    case 'code':
      return extractPlainText(typeData.rich_text)
    case 'child_database':
    case 'child_page':
      return toStringOrEmpty(typeData.title)
    case 'equation':
      return toStringOrEmpty(typeData.expression)
    case 'image':
    case 'file':
    case 'pdf':
    case 'video':
    case 'audio': {
      const external = toRecord(typeData.external)
      const internalFile = toRecord(typeData.file)
      return toStringOrEmpty(external?.url || internalFile?.url)
    }
    case 'bookmark':
    case 'embed':
    case 'link_preview':
      return toStringOrEmpty(typeData.url)
    case 'table_of_contents':
    case 'divider':
    case 'breadcrumb':
    case 'column_list':
    case 'column':
    case 'synced_block':
    case 'table':
    case 'table_row':
      return ''
    default:
      return ''
  }
}

export function formatPage(page: Record<string, unknown>): {
  id: string
  title: string
  url: string
  properties: Record<string, unknown>
  parent: unknown
  archived: boolean
  last_edited_time: string
} {
  return {
    id: toStringOrEmpty(page.id),
    title: extractPageTitle(page),
    url: toStringOrEmpty(page.url),
    properties: simplifyProperties(toRecord(page.properties) ?? {}),
    parent: page.parent,
    archived: page.archived === true,
    last_edited_time: toStringOrEmpty(page.last_edited_time),
  }
}

export type SimplifiedSchemaProperty = { type: string } & Record<string, unknown>

export function simplifyDatabaseProperties(
  properties: Record<string, unknown>,
): Record<string, SimplifiedSchemaProperty> {
  const simplified: Record<string, SimplifiedSchemaProperty> = {}

  for (const [name, value] of Object.entries(properties)) {
    const property = toRecord(value)
    const type = toStringOrEmpty(property?.type)
    if (!type) continue

    const prop: SimplifiedSchemaProperty = { type }

    switch (type) {
      case 'select':
      case 'multi_select': {
        const typeData = toRecord(property?.[type])
        if (typeData && Array.isArray(typeData.options) && typeData.options.length > 0) {
          const values = typeData.options
            .map((opt: unknown) => {
              const o = opt as Record<string, unknown>
              return typeof o.name === 'string' ? o.name : undefined
            })
            .filter(Boolean) as string[]
          if (values.length > 0) prop.options = values
        }
        break
      }
      case 'status': {
        const statusData = toRecord(property?.status)
        if (statusData && Array.isArray(statusData.options) && statusData.options.length > 0) {
          const values = statusData.options
            .map((opt: unknown) => {
              const o = opt as Record<string, unknown>
              return typeof o.name === 'string' ? o.name : undefined
            })
            .filter(Boolean) as string[]
          if (values.length > 0) prop.options = values
        }
        break
      }
      case 'relation': {
        const relationData = toRecord(property?.relation)
        if (relationData) {
          const databaseId = toStringOrEmpty(relationData.database_id)
          if (databaseId) prop.database_id = databaseId
        }
        break
      }
      case 'rollup': {
        const rollupData = toRecord(property?.rollup)
        if (rollupData) {
          const relPropName = toStringOrEmpty(rollupData.relation_property_name)
          if (relPropName) prop.relation_property_name = relPropName
          const rollupPropName = toStringOrEmpty(rollupData.rollup_property_name)
          if (rollupPropName) prop.rollup_property_name = rollupPropName
          const fn = toStringOrEmpty(rollupData.function)
          if (fn) prop.function = fn
        }
        break
      }
      case 'formula': {
        const formulaData = toRecord(property?.formula)
        if (formulaData) {
          const expression = toStringOrEmpty(formulaData.expression)
          if (expression) prop.expression = expression
        }
        break
      }
    }

    simplified[name] = prop
  }

  return simplified
}

export function formatDatabase(db: Record<string, unknown>): {
  id: string
  title: string
  url: string
  properties: Record<string, SimplifiedSchemaProperty>
  parent: unknown
  last_edited_time: string
} {
  return {
    id: toStringOrEmpty(db.id),
    title: extractPlainText(db.title),
    url: toStringOrEmpty(db.url),
    properties: simplifyDatabaseProperties(toRecord(db.properties) ?? {}),
    parent: db.parent,
    last_edited_time: toStringOrEmpty(db.last_edited_time),
  }
}

export function formatDatabaseQueryResults(response: Record<string, unknown>): {
  results: Array<{ id: string; title: string; url: string; properties: Record<string, unknown> }>
  has_more: boolean
  next_cursor: string | null
} {
  const rawResults = Array.isArray(response.results) ? response.results : []

  return {
    results: rawResults.map((item) => {
      const page = toRecord(item) ?? {}
      const formatted = formatPage(page)

      return {
        id: formatted.id,
        title: formatted.title,
        url: formatted.url,
        properties: formatted.properties,
      }
    }),
    has_more: response.has_more === true,
    next_cursor: toCursor(response.next_cursor),
  }
}

export function formatDatabaseListResults(
  response: Record<string, unknown>,
): Array<{ id: string; title: string; url: string }> {
  const rawResults = Array.isArray(response.results) ? response.results : []

  return rawResults.map((item) => {
    const db = toRecord(item) ?? {}

    return {
      id: toStringOrEmpty(db.id),
      title: extractPlainText(db.title),
      url: toStringOrEmpty(db.url),
    }
  })
}

export function formatBlock(block: Record<string, unknown>): {
  id: string
  type: string
  content: string
  has_children: boolean
} {
  return {
    id: toStringOrEmpty(block.id),
    type: toStringOrEmpty(block.type),
    content: extractBlockContent(block),
    has_children: block.has_children === true,
  }
}

export function formatBlockChildrenResponse(response: Record<string, unknown>): {
  results: Array<{ id: string; type: string; content: string; has_children: boolean }>
  has_more: boolean
  next_cursor: string | null
} {
  const rawResults = Array.isArray(response.results) ? response.results : []

  return {
    results: rawResults.map((item) => {
      const block = toRecord(item) ?? {}
      return formatBlock(block)
    }),
    has_more: response.has_more === true,
    next_cursor: toCursor(response.next_cursor),
  }
}

export function formatAppendResponse(results: unknown): {
  results: Array<{ id: string; type: string }>
} {
  const chunks = Array.isArray(results) ? results : []

  return {
    results: chunks.flatMap((chunk) => {
      const chunkRecord = chunk as Record<string, unknown>
      const chunkResults = Array.isArray(chunkRecord.results) ? chunkRecord.results : []

      return chunkResults.map((item) => {
        const block = item as Record<string, unknown>
        return {
          id: toStringOrEmpty(block.id),
          type: toStringOrEmpty(block.type),
        }
      })
    }),
  }
}

export function formatComment(comment: Record<string, unknown>): {
  id: string
  text: string
  author: { id: string; name?: string }
  created_time: string
} {
  return {
    id: toStringOrEmpty(comment.id),
    text: extractPlainText(comment.rich_text),
    author: simplifyUser(toRecord(comment.created_by) ?? {}),
    created_time: toStringOrEmpty(comment.created_time),
  }
}

export function formatCommentListResponse(response: Record<string, unknown>): {
  results: Array<{ id: string; text: string; author: { id: string; name?: string }; created_time: string }>
  has_more: boolean
  next_cursor: string | null
} {
  const rawResults = Array.isArray(response.results) ? response.results : []

  return {
    results: rawResults.map((item) => {
      const comment = item as Record<string, unknown>
      return formatComment(comment)
    }),
    has_more: response.has_more === true,
    next_cursor: toCursor(response.next_cursor),
  }
}
