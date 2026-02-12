import { Command } from 'commander'
import { handleError } from '../../../shared/utils/error-handler'
import { formatOutput } from '../../../shared/utils/output'
import { getClient } from '../client'

async function listAction(options: {
  page?: string
  pageSize?: number
  startCursor?: string
  pretty?: boolean
}): Promise<void> {
  try {
    if (!options.page) {
      throw new Error('--page is required for listing comments')
    }

    const client = getClient()
    const result = await client.comments.list({
      block_id: options.page,
      page_size: options.pageSize,
      start_cursor: options.startCursor,
    })

    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function createAction(
  text: string,
  options: { page?: string; discussion?: string; pretty?: boolean }
): Promise<void> {
  try {
    if (!options.page && !options.discussion) {
      throw new Error('Either --page or --discussion is required')
    }

    if (options.page && options.discussion) {
      throw new Error('Cannot specify both --page and --discussion')
    }

    const client = getClient()

    const createParams: any = {
      rich_text: [
        {
          type: 'text',
          text: {
            content: text,
          },
        },
      ],
    }

    if (options.page) {
      createParams.parent = {
        page_id: options.page,
      }
    } else if (options.discussion) {
      createParams.discussion_id = options.discussion
    }

    const result = await client.comments.create(createParams)
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function getAction(commentId: string, options: { pretty?: boolean }): Promise<void> {
  try {
    const client = getClient()
    const result = await client.comments.retrieve({
      comment_id: commentId,
    })

    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

export const commentCommand = new Command('comment')
  .description('Comment commands')
  .addCommand(
    new Command('list')
      .description('List comments on a page')
      .requiredOption('--page <page_id>', 'Page ID')
      .option('--page-size <n>', 'Number of results per page', (val) => parseInt(val, 10))
      .option('--start-cursor <cursor>', 'Pagination cursor')
      .option('--pretty', 'Pretty print JSON output')
      .action(listAction)
  )
  .addCommand(
    new Command('create')
      .description('Create a comment on a page or reply to a discussion')
      .argument('<text>', 'Comment text')
      .option('--page <page_id>', 'Page ID (for new comment)')
      .option('--discussion <discussion_id>', 'Discussion ID (for reply)')
      .option('--pretty', 'Pretty print JSON output')
      .action(createAction)
  )
  .addCommand(
    new Command('get')
      .description('Retrieve a specific comment')
      .argument('<comment_id>', 'Comment ID')
      .option('--pretty', 'Pretty print JSON output')
      .action(getAction)
  )
