import path from 'node:path'

import { Command } from 'commander'

import { getClient } from '@/platforms/notionbot/client'
import { formatPage } from '@/platforms/notionbot/formatters'
import { uploadFileOnly } from '@/platforms/notionbot/upload'
import { patchFileUploadBlocks } from '@/shared/markdown/patch-file-uploads'
import { preprocessMarkdownImages } from '@/shared/markdown/preprocess-images'
import { readMarkdownInput } from '@/shared/markdown/read-input'
import { markdownToOfficialBlocks } from '@/shared/markdown/to-notion-official'
import { handleError } from '@/shared/utils/error-handler'
import { formatNotionId } from '@/shared/utils/id'
import { formatOutput } from '@/shared/utils/output'

const ISO_DATE_PATTERN =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)?)?$/

async function getAction(rawPageId: string, options: { pretty?: boolean }): Promise<void> {
  const pageId = formatNotionId(rawPageId)
  try {
    const client = getClient()
    const page = await client.pages.retrieve({ page_id: pageId })
    console.log(formatOutput(formatPage(page as Record<string, unknown>), options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function createAction(options: {
  parent: string
  title: string
  database?: boolean
  markdown?: string
  markdownFile?: string
  pretty?: boolean
}): Promise<void> {
  try {
    const client = getClient()
    const result = await handlePageCreate(client, {
      parent: options.parent,
      title: options.title,
      database: options.database,
      markdown: options.markdown,
      markdownFile: options.markdownFile,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

function parsePropertyPair(value: string, previous: Record<string, string>): Record<string, string> {
  const eqIndex = value.indexOf('=')
  if (eqIndex === -1) {
    throw new Error(`Invalid property format: "${value}". Expected key=value`)
  }
  const key = value.slice(0, eqIndex)
  const val = value.slice(eqIndex + 1)
  return { ...previous, [key]: val }
}

async function updateAction(
  rawPageId: string,
  options: {
    set: Record<string, string>
    replaceContent?: boolean
    markdown?: string
    markdownFile?: string
    pretty?: boolean
  },
): Promise<void> {
  try {
    const client = getClient()
    const result = await handlePageUpdate(client, {
      page_id: rawPageId,
      set: options.set,
      replaceContent: options.replaceContent,
      markdown: options.markdown,
      markdownFile: options.markdownFile,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function archiveAction(rawPageId: string, options: { pretty?: boolean }): Promise<void> {
  try {
    const client = getClient()
    const result = await handlePageArchive(client, { page_id: rawPageId })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function propertyAction(rawPageId: string, propertyId: string, options: { pretty?: boolean }): Promise<void> {
  const pageId = formatNotionId(rawPageId)
  try {
    const client = getClient()
    const property = await client.pages.properties.retrieve({
      page_id: pageId,
      property_id: propertyId,
    })
    console.log(formatOutput(property, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

export async function handlePageCreate(
  client: ReturnType<typeof getClient>,
  args: { parent: string; title: string; database?: boolean; markdown?: string; markdownFile?: string },
): Promise<unknown> {
  const parentId = formatNotionId(args.parent)
  const parent = args.database ? { database_id: parentId } : { page_id: parentId }

  const page = await client.pages.create({
    parent,
    properties: {
      title: { title: [{ text: { content: args.title } }] },
    },
  })

  if (args.markdown || args.markdownFile) {
    const rawMarkdown = readMarkdownInput({ markdown: args.markdown, markdownFile: args.markdownFile })
    const basePath = args.markdownFile ? path.dirname(path.resolve(args.markdownFile)) : process.cwd()
    const uploadMap = new Map<string, string>()
    const uploadFn = async (filePath: string): Promise<string> => {
      const result = await uploadFileOnly(client, filePath)
      uploadMap.set(result.url, result.fileUploadId)
      return result.url
    }
    const markdown = await preprocessMarkdownImages(rawMarkdown, uploadFn, basePath)
    const blocks = patchFileUploadBlocks(markdownToOfficialBlocks(markdown), uploadMap)
    if (blocks.length > 0) {
      await client.appendBlockChildren(page.id, blocks)
    }
  }

  return formatPage(page as Record<string, unknown>)
}

export async function handlePageUpdate(
  client: ReturnType<typeof getClient>,
  args: {
    page_id: string
    set?: Record<string, string>
    replaceContent?: boolean
    markdown?: string
    markdownFile?: string
  },
): Promise<unknown> {
  const pageId = formatNotionId(args.page_id)
  const set = args.set ?? {}
  const hasPropertyUpdates = Object.keys(set).length > 0

  if (!hasPropertyUpdates && !args.replaceContent) {
    throw new Error('No updates provided. Use --set or --replace-content with --markdown')
  }

  if (hasPropertyUpdates) {
    const page = (await client.pages.retrieve({ page_id: pageId })) as Record<string, unknown>
    await client.request({
      path: `pages/${pageId}`,
      method: 'patch',
      body: { properties: buildPropertyUpdates(page, set) },
    })
  }

  if (args.replaceContent) {
    if (!args.markdown && !args.markdownFile) {
      throw new Error('--replace-content requires --markdown or --markdown-file')
    }

    const rawMarkdown = readMarkdownInput({ markdown: args.markdown, markdownFile: args.markdownFile })
    const basePath = args.markdownFile ? path.dirname(path.resolve(args.markdownFile)) : process.cwd()
    const uploadMap = new Map<string, string>()
    const uploadFn = async (filePath: string): Promise<string> => {
      const result = await uploadFileOnly(client, filePath)
      uploadMap.set(result.url, result.fileUploadId)
      return result.url
    }
    const md = await preprocessMarkdownImages(rawMarkdown, uploadFn, basePath)
    const newBlocks = patchFileUploadBlocks(markdownToOfficialBlocks(md), uploadMap)

    let cursor: string | undefined
    do {
      const response = await client.blocks.children.list({
        block_id: pageId,
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      })
      for (const block of response.results) {
        await client.blocks.delete({ block_id: block.id })
      }
      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined
    } while (cursor)

    if (newBlocks.length > 0) {
      try {
        await client.appendBlockChildren(pageId, newBlocks)
      } catch (appendError) {
        throw new Error(`Page content cleared but new content failed to append: ${(appendError as Error).message}`)
      }
    }
  }

  const page = await client.pages.retrieve({ page_id: pageId })
  return formatPage(page as Record<string, unknown>)
}

function buildPropertyUpdates(page: Record<string, unknown>, updates: Record<string, string>): Record<string, unknown> {
  const pageProperties = page.properties
  if (!pageProperties || typeof pageProperties !== 'object' || Array.isArray(pageProperties)) {
    throw new Error('Could not read page properties. Use page get to inspect the page before updating it.')
  }

  const serialized: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(updates)) {
    const property = findPageProperty(pageProperties as Record<string, unknown>, name)
    if (!property) {
      throw new Error(`Property "${name}" was not found on the page. Use page get to inspect property names.`)
    }
    serialized[property.name] = serializePropertyValue(property.type, value)
  }
  return serialized
}

function findPageProperty(
  properties: Record<string, unknown>,
  name: string,
): { name: string; type: string } | undefined {
  const direct = properties[name]
  const match = direct
    ? ([name, direct] as const)
    : Object.entries(properties).find(([propertyName, property]) => {
        if (!property || typeof property !== 'object' || Array.isArray(property)) return false
        return propertyName === name || (property as Record<string, unknown>).id === name
      })

  if (!match) return undefined
  const property = match[1]
  if (!property || typeof property !== 'object' || Array.isArray(property)) return undefined
  const type = (property as Record<string, unknown>).type
  return typeof type === 'string' ? { name: match[0], type } : undefined
}

function serializePropertyValue(type: string, value: string): unknown {
  switch (type) {
    case 'title':
    case 'rich_text':
      return { [type]: value ? [{ type: 'text', text: { content: value } }] : [] }
    case 'number':
      return { number: parseNumberValue(value) }
    case 'checkbox':
      return { checkbox: parseBooleanValue(value) }
    case 'select':
    case 'status':
      return { [type]: value ? { name: value } : null }
    case 'multi_select':
      return { multi_select: parseListValue(value).map((name) => ({ name })) }
    case 'date':
      return { date: parseDateValue(value) }
    case 'url':
    case 'email':
    case 'phone_number':
      return { [type]: value || null }
    case 'people':
      return { people: parseListValue(value).map((id) => ({ id })) }
    case 'relation':
      return { relation: parseListValue(value).map((id) => ({ id })) }
    default:
      throw new Error(`Property type "${type}" cannot be updated with --set.`)
  }
}

function parseNumberValue(value: string): number | null {
  const normalized = value.trim()
  if (!normalized) return null
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    throw new Error(`Invalid number value: "${value}"`)
  }
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number value: "${value}"`)
  }
  return parsed
}

function parseBooleanValue(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  throw new Error(`Invalid checkbox value: "${value}". Expected true or false.`)
}

function parseDateValue(value: string): { start: string } | null {
  const normalized = value.trim()
  if (!normalized) return null
  if (!ISO_DATE_PATTERN.test(normalized)) {
    throw new Error(`Invalid date value: "${value}". Expected an ISO 8601 date or datetime.`)
  }

  const [year, month, day] = normalized.slice(0, 10).split('-').map(Number)
  const calendarDate = new Date(Date.UTC(year, month - 1, day))
  if (
    year < 1 ||
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date value: "${value}". Expected an ISO 8601 date or datetime.`)
  }

  return { start: normalized }
}

function parseListValue(value: string): string[] {
  if (!value) return []
  if (value.trimStart().startsWith('[')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error(`Invalid list value: "${value}". Expected a comma-separated list or JSON array.`)
    }
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
      throw new Error(`Invalid list value: "${value}". Expected a list of strings.`)
    }
    return parsed
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export async function handlePageArchive(
  client: ReturnType<typeof getClient>,
  args: { page_id: string },
): Promise<unknown> {
  const pageId = formatNotionId(args.page_id)
  const page = await client.pages.update({
    page_id: pageId,
    archived: true,
  })
  return formatPage(page as Record<string, unknown>)
}

export const pageCommand = new Command('page')
  .description('Page commands')
  .addCommand(
    new Command('get')
      .description('Retrieve a page')
      .argument('<page_id>', 'Page ID')
      .option('--pretty', 'Pretty print JSON output')
      .action(getAction),
  )
  .addCommand(
    new Command('create')
      .description('Create a new page')
      .requiredOption('--parent <parent_id>', 'Parent page or database ID')
      .requiredOption('--title <title>', 'Page title')
      .option('--database', 'Parent is a database (default: page)')
      .option('--markdown <text>', 'Markdown content for page body')
      .option('--markdown-file <path>', 'Path to markdown file for page body')
      .option('--pretty', 'Pretty print JSON output')
      .action(createAction),
  )
  .addCommand(
    new Command('update')
      .description('Update page properties')
      .argument('<page_id>', 'Page ID')
      .option('--set <property=value>', 'Set a property value (repeatable)', parsePropertyPair, {})
      .option('--replace-content', 'Replace all page content')
      .option('--markdown <text>', 'Markdown content')
      .option('--markdown-file <path>', 'Path to markdown file')
      .option('--pretty', 'Pretty print JSON output')
      .action(updateAction),
  )
  .addCommand(
    new Command('archive')
      .description('Archive a page')
      .argument('<page_id>', 'Page ID')
      .option('--pretty', 'Pretty print JSON output')
      .action(archiveAction),
  )
  .addCommand(
    new Command('property')
      .description('Retrieve a specific page property')
      .argument('<page_id>', 'Page ID')
      .argument('<property_id>', 'Property ID')
      .option('--pretty', 'Pretty print JSON output')
      .action(propertyAction),
  )
