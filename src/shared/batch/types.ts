export type BatchOperation = { action: string } & Record<string, unknown>

export type BatchResult = {
  index: number
  action: string
  success: boolean
  data?: unknown
  error?: string
}

export type BatchOutput = {
  results: BatchResult[]
  total: number
  succeeded: number
  failed: number
}

export type NotionHandler = (tokenV2: string, args: Record<string, unknown>) => Promise<unknown>

export type NotionBotHandler = (client: any, args: Record<string, unknown>) => Promise<unknown>

export type ActionRegistry<H> = Record<string, H>

export const NOTION_ACTIONS: string[] = [
  'page.create',
  'page.update',
  'page.archive',
  'block.append',
  'block.update',
  'block.delete',
  'comment.create',
  'database.create',
  'database.update',
  'database.delete-property',
  'database.add-row',
  'database.update-row',
]

export const NOTIONBOT_ACTIONS: string[] = [
  'page.create',
  'page.update',
  'page.archive',
  'block.append',
  'block.update',
  'block.delete',
  'comment.create',
  'database.create',
  'database.update',
  'database.delete-property',
]

export function validateOperations(operations: unknown[], validActions: string[]): void {
  if (!Array.isArray(operations)) {
    throw new Error('Operations must be an array')
  }

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i]

    if (typeof op !== 'object' || op === null) {
      throw new Error(`Operation at index ${i} must be an object`)
    }

    const operation = op as Record<string, unknown>

    if (!('action' in operation)) {
      throw new Error(`Operation at index ${i} is missing required field "action"`)
    }

    const action = operation.action

    if (typeof action !== 'string') {
      throw new Error(`Operation at index ${i} has invalid action type: expected string, got ${typeof action}`)
    }

    if (!validActions.includes(action)) {
      throw new Error(`Invalid action "${action}" at index ${i}. Valid actions: ${validActions.join(', ')}`)
    }
  }
}
