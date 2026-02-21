import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { getClientOrThrow } from '@/platforms/notionbot/client'
import {
  type ActionRegistry,
  type BatchOperation,
  type BatchOutput,
  type BatchResult,
  type NotionBotHandler,
  validateOperations,
} from '@/shared/batch/types'
import { handleError } from '@/shared/utils/error-handler'
import { formatOutput } from '@/shared/utils/output'
import { handleBlockAppend, handleBlockDelete, handleBlockUpdate } from './block'
import { handleCommentCreate } from './comment'
import { handleDatabaseCreate, handleDatabaseDeleteProperty, handleDatabaseUpdate } from './database'
import { handlePageArchive, handlePageCreate, handlePageUpdate } from './page'

type BatchCommandOptions = {
  file?: string
  pretty?: boolean
}

export const NOTIONBOT_ACTION_REGISTRY: ActionRegistry<NotionBotHandler> = {
  'page.create': (client, args) => handlePageCreate(client, args as Parameters<typeof handlePageCreate>[1]),
  'page.update': (client, args) => handlePageUpdate(client, args as Parameters<typeof handlePageUpdate>[1]),
  'page.archive': (client, args) => handlePageArchive(client, args as Parameters<typeof handlePageArchive>[1]),
  'block.append': (client, args) => handleBlockAppend(client, args as Parameters<typeof handleBlockAppend>[1]),
  'block.update': (client, args) => handleBlockUpdate(client, args as Parameters<typeof handleBlockUpdate>[1]),
  'block.delete': (client, args) => handleBlockDelete(client, args as Parameters<typeof handleBlockDelete>[1]),
  'comment.create': (client, args) => handleCommentCreate(client, args as Parameters<typeof handleCommentCreate>[1]),
  'database.create': (client, args) => handleDatabaseCreate(client, args as Parameters<typeof handleDatabaseCreate>[1]),
  'database.update': (client, args) => handleDatabaseUpdate(client, args as Parameters<typeof handleDatabaseUpdate>[1]),
  'database.delete-property': (client, args) =>
    handleDatabaseDeleteProperty(client, args as Parameters<typeof handleDatabaseDeleteProperty>[1]),
}

function parseOperations(operationsArg?: string, file?: string): BatchOperation[] {
  if (!file && !operationsArg) {
    throw new Error('Either provide operations JSON as argument or use --file <path>')
  }

  const raw = file ? readFileSync(file, 'utf8') : operationsArg!
  const parsed = JSON.parse(raw) as unknown

  if (!Array.isArray(parsed)) {
    throw new Error('Operations must be an array')
  }

  if (parsed.length === 0) {
    throw new Error('Operations array cannot be empty')
  }

  return parsed as BatchOperation[]
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function executeBatch(operationsArg: string | undefined, options: BatchCommandOptions): Promise<void> {
  const operations = parseOperations(operationsArg, options.file)
  validateOperations(operations, Object.keys(NOTIONBOT_ACTION_REGISTRY))

  const client = getClientOrThrow()
  const results: BatchResult[] = []
  let failed = false

  for (let index = 0; index < operations.length; index++) {
    const operation = operations[index]
    const action = operation.action
    const handler = NOTIONBOT_ACTION_REGISTRY[action]

    if (!handler) {
      results.push({
        index,
        action,
        success: false,
        error: `No handler found for action: ${action}`,
      })
      failed = true
      break
    }

    try {
      const data = await handler(client, { ...operation })
      results.push({ index, action, success: true, data })
    } catch (error) {
      results.push({
        index,
        action,
        success: false,
        error: toErrorMessage(error),
      })
      failed = true
      break
    }
  }

  const output: BatchOutput = {
    results,
    total: operations.length,
    succeeded: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
  }

  console.log(formatOutput(output, options.pretty))
  process.exit(failed ? 1 : 0)
}

export const batchCommand = new Command('batch')
  .description('Execute multiple write actions sequentially')
  .argument('[operations]', 'Operations as JSON array string')
  .option('--file <path>', 'Read operations JSON from file')
  .option('--pretty', 'Pretty print JSON output')
  .action(async (operations: string | undefined, options: BatchCommandOptions) => {
    try {
      await executeBatch(operations, options)
    } catch (error) {
      handleError(error as Error)
    }
  })
