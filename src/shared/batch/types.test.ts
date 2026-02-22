import { describe, expect, test } from 'bun:test'
import { normalizeOperationArgs, validateOperations } from './types'

describe('normalizeOperationArgs', () => {
  test('strips action and passes primitive values through', () => {
    const result = normalizeOperationArgs({
      action: 'database.add-row',
      database_id: 'db-1',
      title: 'Test',
    })

    expect(result).toEqual({ database_id: 'db-1', title: 'Test' })
    expect(result.action).toBeUndefined()
  })

  test('stringifies object values', () => {
    const result = normalizeOperationArgs({
      action: 'database.add-row',
      database_id: 'db-1',
      title: 'Test',
      properties: { Status: 'P0' },
    })

    expect(result.properties).toBe('{"Status":"P0"}')
    expect(result.database_id).toBe('db-1')
    expect(result.title).toBe('Test')
  })

  test('stringifies array values', () => {
    const result = normalizeOperationArgs({
      action: 'block.append',
      parent_id: 'block-1',
      content: [{ type: 'text', properties: { title: [['hello']] } }],
    })

    expect(result.content).toBe('[{"type":"text","properties":{"title":[["hello"]]}}]')
    expect(result.parent_id).toBe('block-1')
  })

  test('preserves string values that are already JSON strings', () => {
    const result = normalizeOperationArgs({
      action: 'database.add-row',
      database_id: 'db-1',
      properties: '{"Status":"P0"}',
    })

    expect(result.properties).toBe('{"Status":"P0"}')
  })

  test('preserves null and undefined values', () => {
    const result = normalizeOperationArgs({
      action: 'page.update',
      page_id: 'p-1',
      title: undefined,
    } as Record<string, unknown> & { action: string })

    expect(result.title).toBeUndefined()
  })

  test('preserves number and boolean values', () => {
    const result = normalizeOperationArgs({
      action: 'page.update',
      page_id: 'p-1',
      limit: 10,
      archive: true,
    })

    expect(result.limit).toBe(10)
    expect(result.archive).toBe(true)
  })
})

describe('validateOperations', () => {
  test('throws on non-array input', () => {
    expect(() => validateOperations('not-array' as unknown as unknown[], [])).toThrow('Operations must be an array')
  })

  test('throws on non-object element', () => {
    expect(() => validateOperations(['string'], ['test'])).toThrow('Operation at index 0 must be an object')
  })

  test('throws on missing action field', () => {
    expect(() => validateOperations([{ name: 'test' }], ['test'])).toThrow(
      'Operation at index 0 is missing required field "action"',
    )
  })

  test('throws on invalid action type', () => {
    expect(() => validateOperations([{ action: 123 }], ['test'])).toThrow(
      'Operation at index 0 has invalid action type: expected string, got number',
    )
  })

  test('throws on unknown action', () => {
    expect(() => validateOperations([{ action: 'bad.action' }], ['page.create'])).toThrow(
      'Invalid action "bad.action" at index 0',
    )
  })

  test('passes valid operations', () => {
    expect(() => validateOperations([{ action: 'page.create' }], ['page.create'])).not.toThrow()
  })
})
