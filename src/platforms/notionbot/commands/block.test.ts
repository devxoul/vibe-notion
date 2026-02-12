import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const mockBlockRetrieve = mock(() => Promise.resolve({ id: 'block-123', type: 'paragraph' }))
const mockBlockUpdate = mock(() => Promise.resolve({ id: 'block-123', type: 'paragraph' }))
const mockBlockDelete = mock(() => Promise.resolve({ id: 'block-123', archived: true }))
const mockChildrenList = mock(() =>
  Promise.resolve({ results: [{ id: 'child-1' }], has_more: false, next_cursor: null })
)
const mockAppendBlockChildren = mock(() => Promise.resolve([{ results: [] }]))

mock.module('../client', () => ({
  getClient: () => ({
    blocks: {
      retrieve: mockBlockRetrieve,
      update: mockBlockUpdate,
      delete: mockBlockDelete,
      children: {
        list: mockChildrenList,
      },
    },
    appendBlockChildren: mockAppendBlockChildren,
  }),
}))

const { blockCommand } = await import('./block')

describe('block commands', () => {
  let consoleOutput: string[]
  let consoleErrors: string[]
  let originalLog: typeof console.log
  let originalError: typeof console.error
  let originalExit: typeof process.exit

  beforeEach(() => {
    consoleOutput = []
    consoleErrors = []
    originalLog = console.log
    originalError = console.error
    originalExit = process.exit

    console.log = (...args: any[]) => consoleOutput.push(args.join(' '))
    console.error = (...args: any[]) => consoleErrors.push(args.join(' '))
    process.exit = mock(() => {
      throw new Error('process.exit called')
    }) as any

    mockBlockRetrieve.mockReset()
    mockBlockUpdate.mockReset()
    mockBlockDelete.mockReset()
    mockChildrenList.mockReset()
    mockAppendBlockChildren.mockReset()
  })

  afterEach(() => {
    console.log = originalLog
    console.error = originalError
    process.exit = originalExit
  })

  test('get retrieves a block by id', async () => {
    // Given
    mockBlockRetrieve.mockResolvedValue({
      id: 'block-abc',
      type: 'heading_1',
      has_children: false,
    })

    // When
    await blockCommand.parseAsync(['get', 'block-abc'], { from: 'user' })

    // Then
    expect(mockBlockRetrieve).toHaveBeenCalledWith({ block_id: 'block-abc' })
    const output = JSON.parse(consoleOutput[0])
    expect(output.id).toBe('block-abc')
    expect(output.type).toBe('heading_1')
  })

  test('children lists child blocks with pagination options', async () => {
    // Given
    mockChildrenList.mockResolvedValue({
      results: [{ id: 'child-1' }, { id: 'child-2' }],
      has_more: true,
      next_cursor: 'cursor-xyz',
    })

    // When
    await blockCommand.parseAsync(
      ['children', 'parent-123', '--page-size', '10', '--start-cursor', 'abc'],
      { from: 'user' }
    )

    // Then
    expect(mockChildrenList).toHaveBeenCalledWith({
      block_id: 'parent-123',
      page_size: 10,
      start_cursor: 'abc',
    })
    const output = JSON.parse(consoleOutput[0])
    expect(output.results).toHaveLength(2)
    expect(output.has_more).toBe(true)
  })

  test('append sends block children to parent', async () => {
    // Given
    const children = [
      { type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'hi' } }] } },
    ]
    mockAppendBlockChildren.mockResolvedValue([{ results: children }])

    // When
    await blockCommand.parseAsync(['append', 'parent-456', '--content', JSON.stringify(children)], {
      from: 'user',
    })

    // Then
    expect(mockAppendBlockChildren).toHaveBeenCalledWith('parent-456', children)
    expect(consoleOutput.length).toBeGreaterThan(0)
  })

  test('append chunks >100 blocks via client.appendBlockChildren', async () => {
    // Given — 150 blocks
    const children = Array.from({ length: 150 }, (_, i) => ({
      type: 'paragraph',
      paragraph: { rich_text: [{ text: { content: `block-${i}` } }] },
    }))
    mockAppendBlockChildren.mockResolvedValue([{ results: [] }, { results: [] }])

    // When
    await blockCommand.parseAsync(['append', 'parent-789', '--content', JSON.stringify(children)], {
      from: 'user',
    })

    // Then — client.appendBlockChildren handles chunking internally, called once with all 150
    expect(mockAppendBlockChildren).toHaveBeenCalledWith('parent-789', children)
  })

  test('update modifies a block', async () => {
    // Given
    const content = { paragraph: { rich_text: [{ text: { content: 'updated' } }] } }
    mockBlockUpdate.mockResolvedValue({ id: 'block-upd', type: 'paragraph' })

    // When
    await blockCommand.parseAsync(['update', 'block-upd', '--content', JSON.stringify(content)], {
      from: 'user',
    })

    // Then
    expect(mockBlockUpdate).toHaveBeenCalledWith({ block_id: 'block-upd', ...content })
    const output = JSON.parse(consoleOutput[0])
    expect(output.id).toBe('block-upd')
  })

  test('delete trashes a block', async () => {
    // Given
    mockBlockDelete.mockResolvedValue({ id: 'block-del', archived: true })

    // When
    await blockCommand.parseAsync(['delete', 'block-del'], { from: 'user' })

    // Then
    expect(mockBlockDelete).toHaveBeenCalledWith({ block_id: 'block-del' })
    const output = JSON.parse(consoleOutput[0])
    expect(output.archived).toBe(true)
  })

  test('handles errors from Notion API', async () => {
    // Given
    mockBlockRetrieve.mockRejectedValue(new Error('Not found'))

    // When
    try {
      await blockCommand.parseAsync(['get', 'bad-id'], { from: 'user' })
    } catch {
      // handleError calls process.exit which our mock throws
    }

    // Then
    const allOutput = [...consoleOutput, ...consoleErrors].join('\n')
    expect(allOutput).toContain('Not found')
  })
})
