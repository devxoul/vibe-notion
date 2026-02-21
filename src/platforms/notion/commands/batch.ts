import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import {
  type ActionRegistry,
  type BatchOperation,
  type BatchOutput,
  type BatchResult,
  type NotionHandler,
  validateOperations,
} from '@/shared/batch/types'
import { formatOutput } from '@/shared/utils/output'
import { handleBlockAppend, handleBlockDelete, handleBlockUpdate } from './block'
import { handleCommentCreate } from './comment'
import {
  handleDatabaseAddRow,
  handleDatabaseCreate,
  handleDatabaseDeleteProperty,
  handleDatabaseUpdate,
  handleDatabaseUpdateRow,
} from './database'
import * as helpers from './helpers'
import { handlePageArchive, handlePageCreate, handlePageUpdate } from './page'

type BatchCommandOptions = {
  workspaceId: string
  file?: string
  pretty?: boolean
}

export const NOTION_ACTION_REGISTRY: ActionRegistry<NotionHandler> = {
  'page.create': (tokenV2, args) => handlePageCreate(tokenV2, args as Parameters<typeof handlePageCreate>[1]),
  'page.update': (tokenV2, args) => handlePageUpdate(tokenV2, args as Parameters<typeof handlePageUpdate>[1]),
  'page.archive': (tokenV2, args) => handlePageArchive(tokenV2, args as Parameters<typeof handlePageArchive>[1]),
  'block.append': (tokenV2, args) => handleBlockAppend(tokenV2, args as Parameters<typeof handleBlockAppend>[1]),
  'block.update': (tokenV2, args) => handleBlockUpdate(tokenV2, args as Parameters<typeof handleBlockUpdate>[1]),
  'block.delete': (tokenV2, args) => handleBlockDelete(tokenV2, args as Parameters<typeof handleBlockDelete>[1]),
  'comment.create': (tokenV2, args) => handleCommentCreate(tokenV2, args as Parameters<typeof handleCommentCreate>[1]),
  'database.create': (tokenV2, args) =>
    handleDatabaseCreate(tokenV2, args as Parameters<typeof handleDatabaseCreate>[1]),
  'database.update': (tokenV2, args) =>
    handleDatabaseUpdate(tokenV2, args as Parameters<typeof handleDatabaseUpdate>[1]),
  'database.delete-property': (tokenV2, args) =>
    handleDatabaseDeleteProperty(tokenV2, args as Parameters<typeof handleDatabaseDeleteProperty>[1]),
  'database.add-row': (tokenV2, args) =>
    handleDatabaseAddRow(tokenV2, args as Parameters<typeof handleDatabaseAddRow>[1]),
  'database.update-row': (tokenV2, args) =>
    handleDatabaseUpdateRow(tokenV2, args as Parameters<typeof handleDatabaseUpdateRow>[1]),
}

function parseOperations(operationsArg: string, file?: string): BatchOperation[] {
  const raw = file ? readFileSync(file, 'utf8') : operationsArg
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

export async function executeBatch(operationsArg: string, options: BatchCommandOptions): Promise<void> {
  const operations = parseOperations(operationsArg, options.file)
  validateOperations(operations, Object.keys(NOTION_ACTION_REGISTRY))

  const getCredentialsOrThrow = helpers.getCredentialsOrThrow ?? helpers.getCredentialsOrExit
  const resolveAndSetActiveUserId = helpers.resolveAndSetActiveUserId
  if (!getCredentialsOrThrow) {
    throw new Error('getCredentialsOrThrow is not available')
  }
  if (!resolveAndSetActiveUserId) {
    throw new Error('resolveAndSetActiveUserId is not available')
  }

  const creds = await getCredentialsOrThrow()
  await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)

  const results: BatchResult[] = []
  let failed = false

  for (let index = 0; index < operations.length; index++) {
    const operation = operations[index]
    const action = operation.action
    const handler = NOTION_ACTION_REGISTRY[action]

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
      const data = await handler(creds.token_v2, { ...operation, workspaceId: options.workspaceId })
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
  .argument('<operations>', 'Operations as JSON array string')
  .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
  .option('--file <path>', 'Read operations JSON from file')
  .option('--pretty', 'Pretty print JSON output')
  .action(async (operations: string, options: BatchCommandOptions) => {
    try {
      await executeBatch(operations, options)
    } catch (error) {
      console.error(JSON.stringify({ error: toErrorMessage(error) }))
      process.exit(1)
    }
  })
