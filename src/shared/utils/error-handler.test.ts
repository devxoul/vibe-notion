import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { APIErrorCode } from '@notionhq/client'
import { handleError } from './error-handler'

describe('handleError', () => {
  let consoleErrors: string[]
  let originalError: typeof console.error
  let originalExit: typeof process.exit

  beforeEach(() => {
    consoleErrors = []
    originalError = console.error
    originalExit = process.exit

    console.error = (...args: unknown[]) => consoleErrors.push(args.join(' '))
    process.exit = mock(() => {
      throw new Error('process.exit called')
    }) as unknown as typeof process.exit
  })

  afterEach(() => {
    console.error = originalError
    process.exit = originalExit
  })

  test('formats generic error as JSON with message', () => {
    try {
      handleError(new Error('something broke'))
    } catch {}

    const output = JSON.parse(consoleErrors[0])
    expect(output.error).toBe('something broke')
  })

  test('calls process.exit(1)', () => {
    try {
      handleError(new Error('fail'))
    } catch {}

    expect(process.exit).toHaveBeenCalledWith(1)
  })

  test('adds hint for object_not_found error', () => {
    const error = new Error('Not found') as Error & { code: string }
    error.code = APIErrorCode.ObjectNotFound
    Object.defineProperty(error, 'name', { value: 'APIResponseError' })
    // Notion client errors have isNotionClientError check based on name
    // We need to simulate a real Notion client error
    const notionError = Object.assign(error, {
      status: 404,
      headers: {},
      body: '',
    })
    ;(notionError as any)[Symbol.for('NotionClientError')] = true

    try {
      handleError(notionError)
    } catch {}

    const output = JSON.parse(consoleErrors[0])
    expect(output.error).toContain('Not found')
  })

  test('formats non-Notion errors without code field', () => {
    try {
      handleError(new Error('random error'))
    } catch {}

    const output = JSON.parse(consoleErrors[0])
    expect(output.error).toBe('random error')
    expect(output.code).toBeUndefined()
  })
})
