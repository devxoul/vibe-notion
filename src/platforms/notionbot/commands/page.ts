import { Command } from 'commander'
import { getClient } from '@/platforms/notionbot/client'
import { formatPage } from '@/platforms/notionbot/formatters'
import { readMarkdownInput } from '@/shared/markdown/read-input'
import { markdownToOfficialBlocks } from '@/shared/markdown/to-notion-official'
import { handleError } from '@/shared/utils/error-handler'
import { formatNotionId } from '@/shared/utils/id'
import { formatOutput } from '@/shared/utils/output'

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
    const markdown = readMarkdownInput({ markdown: args.markdown, markdownFile: args.markdownFile })
    const blocks = markdownToOfficialBlocks(markdown)
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
    await client.pages.update({
      page_id: pageId,
      properties: set as any,
    })
  }

  if (args.replaceContent) {
    if (!args.markdown && !args.markdownFile) {
      throw new Error('--replace-content requires --markdown or --markdown-file')
    }

    const md = readMarkdownInput({ markdown: args.markdown, markdownFile: args.markdownFile })
    const newBlocks = markdownToOfficialBlocks(md)

    let cursor: string | undefined
    do {
      const response = await client.blocks.children.list({
        block_id: pageId,
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      } as any)
      for (const block of (response as any).results) {
        await client.blocks.delete({ block_id: block.id })
      }
      cursor = (response as any).has_more ? (response as any).next_cursor : undefined
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
