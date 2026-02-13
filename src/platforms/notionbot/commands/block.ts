import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints'
import { Command } from 'commander'
import { handleError } from '../../../shared/utils/error-handler'
import { formatNotionId } from '../../../shared/utils/id'
import { formatOutput } from '../../../shared/utils/output'
import { getClient } from '../client'
import { formatAppendResponse, formatBlock, formatBlockChildrenResponse } from '../formatters'

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

async function appendAction(rawParentId: string, options: { pretty?: boolean; content: string }): Promise<void> {
  const parentId = formatNotionId(rawParentId)
  try {
    const client = getClient()
    const children: BlockObjectRequest[] = JSON.parse(options.content)
    const results = await client.appendBlockChildren(parentId, children)
    console.log(formatOutput(formatAppendResponse(results), options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function updateAction(rawBlockId: string, options: { pretty?: boolean; content: string }): Promise<void> {
  const blockId = formatNotionId(rawBlockId)
  try {
    const client = getClient()
    const content = JSON.parse(options.content)
    const result = await client.blocks.update({ block_id: blockId, ...content })
    console.log(formatOutput(formatBlock(result as Record<string, unknown>), options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function deleteAction(rawBlockId: string, options: { pretty?: boolean }): Promise<void> {
  const blockId = formatNotionId(rawBlockId)
  try {
    const client = getClient()
    await client.blocks.delete({ block_id: blockId })
    console.log(formatOutput({ deleted: true, id: blockId }, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
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
      .requiredOption('--content <json>', 'Block children as JSON array')
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
      .description('Delete (trash) a block')
      .argument('<block_id>', 'Block ID')
      .option('--pretty', 'Pretty print JSON output')
      .action(deleteAction),
  )
