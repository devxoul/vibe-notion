import { Command } from 'commander'
import { internalRequest } from '@/platforms/notion/client'
import { formatCommentValue, formatDiscussionComments } from '@/platforms/notion/formatters'
import { formatNotionId } from '@/shared/utils/id'
import { formatOutput } from '@/shared/utils/output'
import {
  type CommandOptions,
  generateId,
  getCredentialsOrExit,
  resolveAndSetActiveUserId,
  resolveSpaceId,
} from './helpers'

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, unknown>
}

function getRecordValue(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!record) return undefined
  const outer = toRecord(record.value)
  if (!outer) return undefined
  if (typeof outer.role === 'string' && outer.value !== undefined) {
    return toRecord(outer.value)
  }
  return outer
}

type ListOptions = CommandOptions & {
  page: string
  workspaceId: string
}

type CreateOptions = CommandOptions & {
  page?: string
  discussion?: string
  workspaceId: string
}

type GetOptions = CommandOptions & {
  workspaceId: string
}

type LoadPageChunkResponse = {
  recordMap: {
    block?: Record<string, Record<string, unknown>>
    discussion?: Record<string, Record<string, unknown>>
    comment?: Record<string, Record<string, unknown>>
  }
}

type SyncRecordValuesResponse = {
  recordMap: {
    comment?: Record<string, Record<string, unknown>>
    discussion?: Record<string, Record<string, unknown>>
  }
}

type SaveOperation = {
  pointer: { table: string; id: string; spaceId: string }
  command: string
  path: string[]
  args: Record<string, unknown>
}

type SaveTransactionsRequest = {
  requestId: string
  transactions: Array<{
    id: string
    spaceId: string
    operations: SaveOperation[]
  }>
}

async function listAction(options: ListOptions): Promise<void> {
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)

    const pageId = formatNotionId(options.page)
    const response = (await internalRequest(creds.token_v2, 'loadPageChunk', {
      pageId,
      limit: 100,
      cursor: { stack: [] },
      chunkNumber: 0,
      verticalColumns: false,
    })) as LoadPageChunkResponse

    const blocks = response.recordMap.block ?? {}
    const discussions = response.recordMap.discussion ?? {}
    const comments = response.recordMap.comment ?? {}

    const result = formatDiscussionComments(discussions, comments, pageId, blocks)
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

export async function handleCommentCreate(
  tokenV2: string,
  args: { text: string; page?: string; discussion?: string; workspaceId: string },
): Promise<unknown> {
  if (!args.page && !args.discussion) {
    throw new Error('Either --page or --discussion is required')
  }

  if (args.page && args.discussion) {
    throw new Error('Cannot specify both --page and --discussion')
  }

  await resolveAndSetActiveUserId(tokenV2, args.workspaceId)

  if (args.page) {
    const pageId = formatNotionId(args.page)
    const spaceId = await resolveSpaceId(tokenV2, pageId)
    const discussionId = generateId()
    const commentId = generateId()

    const payload: SaveTransactionsRequest = {
      requestId: generateId(),
      transactions: [
        {
          id: generateId(),
          spaceId,
          operations: [
            {
              pointer: { table: 'discussion', id: discussionId, spaceId },
              command: 'set',
              path: [],
              args: {
                id: discussionId,
                version: 1,
                parent_id: pageId,
                parent_table: 'block',
                comments: [commentId],
                resolved: false,
                space_id: spaceId,
              },
            },
            {
              pointer: { table: 'comment', id: commentId, spaceId },
              command: 'set',
              path: [],
              args: {
                id: commentId,
                version: 1,
                parent_id: discussionId,
                parent_table: 'discussion',
                text: [[args.text]],
                alive: true,
                space_id: spaceId,
              },
            },
            {
              pointer: { table: 'block', id: pageId, spaceId },
              command: 'listAfter',
              path: ['discussions'],
              args: { id: discussionId },
            },
          ],
        },
      ],
    }

    await internalRequest(tokenV2, 'saveTransactions', payload)

    return {
      id: commentId,
      discussion_id: discussionId,
      text: args.text,
    }
  } else if (args.discussion) {
    const discussionId = formatNotionId(args.discussion)

    const discussionResponse = (await internalRequest(tokenV2, 'syncRecordValues', {
      requests: [{ pointer: { table: 'discussion', id: discussionId }, version: -1 }],
    })) as SyncRecordValuesResponse

    const discussionRecord = Object.values(discussionResponse.recordMap.discussion ?? {})[0]
    const discussion = getRecordValue(discussionRecord)
    if (!discussion) {
      throw new Error(`Discussion not found: ${discussionId}`)
    }

    const spaceId = typeof discussion.space_id === 'string' ? discussion.space_id : ''
    if (!spaceId) {
      throw new Error(`Could not resolve space ID for discussion: ${discussionId}`)
    }

    const commentId = generateId()

    const payload: SaveTransactionsRequest = {
      requestId: generateId(),
      transactions: [
        {
          id: generateId(),
          spaceId,
          operations: [
            {
              pointer: { table: 'comment', id: commentId, spaceId },
              command: 'set',
              path: [],
              args: {
                id: commentId,
                version: 1,
                parent_id: discussionId,
                parent_table: 'discussion',
                text: [[args.text]],
                alive: true,
                space_id: spaceId,
              },
            },
            {
              pointer: { table: 'discussion', id: discussionId, spaceId },
              command: 'listAfter',
              path: ['comments'],
              args: { id: commentId },
            },
          ],
        },
      ],
    }

    await internalRequest(tokenV2, 'saveTransactions', payload)

    return {
      id: commentId,
      discussion_id: discussionId,
      text: args.text,
    }
  }

  throw new Error('Unreachable code')
}

async function createAction(text: string, options: CreateOptions): Promise<void> {
  try {
    const creds = await getCredentialsOrExit()
    const result = await handleCommentCreate(creds.token_v2, {
      text,
      page: options.page,
      discussion: options.discussion,
      workspaceId: options.workspaceId,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

async function getAction(commentId: string, options: GetOptions): Promise<void> {
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)

    const formattedCommentId = formatNotionId(commentId)
    const response = (await internalRequest(creds.token_v2, 'syncRecordValues', {
      requests: [{ pointer: { table: 'comment', id: formattedCommentId }, version: -1 }],
    })) as SyncRecordValuesResponse

    const commentRecord = Object.values(response.recordMap.comment ?? {})[0]
    const comment = getRecordValue(commentRecord)
    if (!comment) {
      throw new Error(`Comment not found: ${commentId}`)
    }

    const contentIds = Array.isArray(comment.content)
      ? (comment.content as string[]).filter((id): id is string => typeof id === 'string')
      : []

    let blocks: Record<string, Record<string, unknown>> | undefined
    if (contentIds.length > 0) {
      const blockResponse = (await internalRequest(creds.token_v2, 'syncRecordValues', {
        requests: contentIds.map((id) => ({ pointer: { table: 'block', id }, version: -1 })),
      })) as { recordMap: { block?: Record<string, Record<string, unknown>> } }
      blocks = blockResponse.recordMap.block
    }

    const result = formatCommentValue(comment, blocks)
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

export const commentCommand = new Command('comment')
  .description('Comment commands')
  .addCommand(
    new Command('list')
      .description('List comments on a page')
      .requiredOption('--page <page_id>', 'Page ID')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--pretty', 'Pretty print JSON output')
      .action(listAction),
  )
  .addCommand(
    new Command('create')
      .description('Create a comment')
      .argument('<text>', 'Comment text')
      .option('--page <page_id>', 'Page ID (for new discussion)')
      .option('--discussion <discussion_id>', 'Discussion ID (for reply)')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--pretty', 'Pretty print JSON output')
      .action(createAction),
  )
  .addCommand(
    new Command('get')
      .description('Retrieve a specific comment')
      .argument('<comment_id>', 'Comment ID')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--pretty', 'Pretty print JSON output')
      .action(getAction),
  )
