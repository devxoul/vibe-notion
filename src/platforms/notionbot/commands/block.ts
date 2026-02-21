import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints'
import { Command } from 'commander'
import { getClient } from '@/platforms/notionbot/client'
import { formatAppendResponse, formatBlock, formatBlockChildrenResponse } from '@/platforms/notionbot/formatters'
import { readMarkdownInput } from '@/shared/markdown/read-input'
import { markdownToOfficialBlocks } from '@/shared/markdown/to-notion-official'
import { handleError } from '@/shared/utils/error-handler'
import { formatNotionId } from '@/shared/utils/id'
import { formatOutput } from '@/shared/utils/output'

async function getAction(rawBlockId: string, options: { pretty?: boolean }): Promise<void> {
  const blockId = formatNotionId(rawBlockId)
  try {
    const client = getClient()
    const block = await client.blocks.retrieve({ block_id: blockId })
    console.log(formatOutput(formatBlock(block as Record<string, unknown>), options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function childrenAction(
  rawBlockId: string,
  options: { pretty?: boolean; pageSize?: string; startCursor?: string },
): Promise<void> {
  const blockId = formatNotionId(rawBlockId)
  try {
    const client = getClient()
    const params: Record<string, unknown> = { block_id: blockId }
    if (options.pageSize) params.page_size = Number(options.pageSize)
    if (options.startCursor) params.start_cursor = options.startCursor
    const response = await client.blocks.children.list(params as any)
    console.log(formatOutput(formatBlockChildrenResponse(response as Record<string, unknown>), options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function appendAction(
  rawParentId: string,
  options: { pretty?: boolean; content?: string; markdown?: string; markdownFile?: string },
): Promise<void> {
  try {
    const client = getClient()
    const result = await handleBlockAppend(client, {
      parent_id: formatNotionId(rawParentId),
      content: options.content,
      markdown: options.markdown,
      markdownFile: options.markdownFile,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function updateAction(rawBlockId: string, options: { pretty?: boolean; content: string }): Promise<void> {
  try {
    const client = getClient()
    const result = await handleBlockUpdate(client, {
      block_id: formatNotionId(rawBlockId),
      content: options.content,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function deleteAction(rawBlockId: string, options: { pretty?: boolean }): Promise<void> {
  try {
    const client = getClient()
    const result = await handleBlockDelete(client, {
      block_id: formatNotionId(rawBlockId),
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

export async function handleBlockAppend(
  client: ReturnType<typeof getClient>,
  args: { parent_id: string; content?: string; markdown?: string; markdownFile?: string },
): Promise<unknown> {
  let children: BlockObjectRequest[]

  const hasMarkdown = args.markdown || args.markdownFile
  if (args.content && hasMarkdown) {
    throw new Error('Provide either --markdown or --markdown-file, not both')
  }

  if (!args.content && !hasMarkdown) {
    throw new Error('Provide either --content or --markdown/--markdown-file')
  }

  if (hasMarkdown) {
    const markdown = readMarkdownInput({ markdown: args.markdown, markdownFile: args.markdownFile })
    children = markdownToOfficialBlocks(markdown)
  } else {
    children = JSON.parse(args.content!)
  }

  const results = await client.appendBlockChildren(args.parent_id, children)
  return formatAppendResponse(results)
}

export async function handleBlockUpdate(
  client: ReturnType<typeof getClient>,
  args: { block_id: string; content: string },
): Promise<unknown> {
  const content = JSON.parse(args.content)
  const result = await client.blocks.update({ block_id: args.block_id, ...content })
  return formatBlock(result as Record<string, unknown>)
}

export async function handleBlockDelete(
  client: ReturnType<typeof getClient>,
  args: { block_id: string },
): Promise<unknown> {
  await client.blocks.delete({ block_id: args.block_id })
  return { deleted: true, id: args.block_id }
}

export const blockCommand = new Command('block')
  .description('Block commands')
  .addCommand(
    new Command('get')
      .description('Retrieve a block')
      .argument('<block_id>', 'Block ID')
      .option('--pretty', 'Pretty print JSON output')
      .action(getAction),
  )
  .addCommand(
    new Command('children')
      .description('List block children')
      .argument('<block_id>', 'Block ID')
      .option('--page-size <n>', 'Number of results per page')
      .option('--start-cursor <cursor>', 'Pagination cursor')
      .option('--pretty', 'Pretty print JSON output')
      .action(childrenAction),
  )
  .addCommand(
    new Command('append')
      .description('Append child blocks')
      .argument('<parent_id>', 'Parent block ID')
      .option('--content <json>', 'Block children as JSON array')
      .option('--markdown <text>', 'Markdown content to convert to blocks')
      .option('--markdown-file <path>', 'Path to markdown file')
      .option('--pretty', 'Pretty print JSON output')
      .action(appendAction),
  )
  .addCommand(
    new Command('update')
      .description('Update a block')
      .argument('<block_id>', 'Block ID')
      .requiredOption('--content <json>', 'Block update content as JSON')
      .option('--pretty', 'Pretty print JSON output')
      .action(updateAction),
  )
  .addCommand(
    new Command('delete')
      .description('Delete (archive) a block')
      .argument('<block_id>', 'Block ID')
      .option('--pretty', 'Pretty print JSON output')
      .action(deleteAction),
  )
