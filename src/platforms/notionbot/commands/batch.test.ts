import { describe, expect, mock, test } from 'bun:test'

const validActions = [
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

function setupDefaultMocks() {
  const mockGetClientOrThrow = mock(() => ({ id: 'mock-client' }))
  const mockValidateOperations = mock(() => {})

  const mockPageCreate = mock(async (): Promise<unknown> => ({}))
  const mockPageUpdate = mock(async (): Promise<unknown> => ({}))
  const mockPageArchive = mock(async (): Promise<unknown> => ({}))
  const mockBlockAppend = mock(async (): Promise<unknown> => ({}))
  const mockBlockUpdate = mock(async (): Promise<unknown> => ({}))
  const mockBlockDelete = mock(async (): Promise<unknown> => ({}))
  const mockCommentCreate = mock(async (): Promise<unknown> => ({}))
  const mockDatabaseCreate = mock(async (): Promise<unknown> => ({}))
  const mockDatabaseUpdate = mock(async (): Promise<unknown> => ({}))
  const mockDatabaseDeleteProperty = mock(async (): Promise<unknown> => ({}))

  mock.module('../client', () => ({
    getClientOrThrow: mockGetClientOrThrow,
  }))

  mock.module('./page', () => ({
    handlePageCreate: mockPageCreate,
    handlePageUpdate: mockPageUpdate,
    handlePageArchive: mockPageArchive,
  }))

  mock.module('./block', () => ({
    handleBlockAppend: mockBlockAppend,
    handleBlockUpdate: mockBlockUpdate,
    handleBlockDelete: mockBlockDelete,
  }))

  mock.module('./comment', () => ({
    handleCommentCreate: mockCommentCreate,
  }))

  mock.module('./database', () => ({
    handleDatabaseCreate: mockDatabaseCreate,
    handleDatabaseUpdate: mockDatabaseUpdate,
    handleDatabaseDeleteProperty: mockDatabaseDeleteProperty,
  }))

  mock.module('@/shared/batch/types', () => ({
    NOTIONBOT_ACTIONS: validActions,
    validateOperations: mockValidateOperations,
  }))

  return {
    mockGetClientOrThrow,
    mockValidateOperations,
    handlers: {
      mockPageCreate,
      mockPageUpdate,
      mockPageArchive,
      mockBlockAppend,
      mockBlockUpdate,
      mockBlockDelete,
      mockCommentCreate,
      mockDatabaseCreate,
      mockDatabaseUpdate,
      mockDatabaseDeleteProperty,
    },
  }
}

describe('notionbot batch command', () => {
  test('valid single operation outputs success summary', async () => {
    mock.restore()
    const { mockGetClientOrThrow, mockValidateOperations, handlers } = setupDefaultMocks()
    handlers.mockPageArchive.mockImplementationOnce(async () => ({ archived: true, id: 'page-1' }))

    const { executeBatch } = await import('./batch')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    let exitCode: number | undefined
    const originalExit = process.exit
    process.exit = ((code?: number) => {
      exitCode = code
      return undefined as never
    }) as typeof process.exit

    try {
      await executeBatch('[{"action":"page.archive","page_id":"page-1"}]', {})
    } finally {
      console.log = originalLog
      process.exit = originalExit
    }

    expect(mockValidateOperations).toHaveBeenCalledWith([{ action: 'page.archive', page_id: 'page-1' }], validActions)
    expect(mockGetClientOrThrow).toHaveBeenCalled()
    expect(output.length).toBe(1)
    expect(JSON.parse(output[0])).toEqual({
      results: [{ index: 0, action: 'page.archive', success: true, data: { archived: true, id: 'page-1' } }],
      total: 1,
      succeeded: 1,
      failed: 0,
    })
    expect(exitCode).toBe(0)
  })

  test('valid multiple operations execute sequentially and all succeed', async () => {
    mock.restore()
    const { handlers } = setupDefaultMocks()
    handlers.mockPageCreate.mockImplementationOnce(async () => ({ id: 'p1' }))
    handlers.mockBlockAppend.mockImplementationOnce(async () => ({ created: ['b1'] }))

    const { executeBatch } = await import('./batch')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    let exitCode: number | undefined
    const originalExit = process.exit
    process.exit = ((code?: number) => {
      exitCode = code
      return undefined as never
    }) as typeof process.exit

    try {
      await executeBatch(
        '[{"action":"page.create","parent":"root","title":"Hello"},{"action":"block.append","parent_id":"p1","content":"[]"}]',
        {},
      )
    } finally {
      console.log = originalLog
      process.exit = originalExit
    }

    expect(output.length).toBe(1)
    expect(JSON.parse(output[0])).toEqual({
      results: [
        { index: 0, action: 'page.create', success: true, data: { id: 'p1' } },
        { index: 1, action: 'block.append', success: true, data: { created: ['b1'] } },
      ],
      total: 2,
      succeeded: 2,
      failed: 0,
    })
    expect(exitCode).toBe(0)
  })

  test('first operation failure triggers fail-fast and exit 1', async () => {
    mock.restore()
    const { handlers } = setupDefaultMocks()
    handlers.mockPageCreate.mockImplementationOnce(async () => {
      throw new Error('create failed')
    })

    const { executeBatch } = await import('./batch')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    let exitCode: number | undefined
    const originalExit = process.exit
    process.exit = ((code?: number) => {
      exitCode = code
      return undefined as never
    }) as typeof process.exit

    try {
      await executeBatch(
        '[{"action":"page.create","parent":"root","title":"Hello"},{"action":"block.append","parent_id":"p1","content":"[]"}]',
        {},
      )
    } finally {
      console.log = originalLog
      process.exit = originalExit
    }

    expect(handlers.mockBlockAppend).not.toHaveBeenCalled()
    expect(JSON.parse(output[0])).toEqual({
      results: [{ index: 0, action: 'page.create', success: false, error: 'create failed' }],
      total: 2,
      succeeded: 0,
      failed: 1,
    })
    expect(exitCode).toBe(1)
  })

  test('invalid action name throws from validateOperations before execution', async () => {
    mock.restore()
    const { mockGetClientOrThrow, mockValidateOperations } = setupDefaultMocks()
    mockValidateOperations.mockImplementationOnce(() => {
      throw new Error('Invalid action "bad.action" at index 0')
    })

    const { executeBatch } = await import('./batch')

    await expect(executeBatch('[{"action":"bad.action"}]', {})).rejects.toThrow(
      'Invalid action "bad.action" at index 0',
    )

    expect(mockGetClientOrThrow).not.toHaveBeenCalled()
  })

  test('empty operations array throws validation error', async () => {
    mock.restore()
    setupDefaultMocks()
    const { executeBatch } = await import('./batch')

    await expect(executeBatch('[]', {})).rejects.toThrow('Operations array cannot be empty')
  })

  test('invalid JSON string throws parse error', async () => {
    mock.restore()
    setupDefaultMocks()
    const { executeBatch } = await import('./batch')

    await expect(executeBatch('{not-json}', {})).rejects.toThrow()
  })

  test('missing operations arg and --file throws helpful error', async () => {
    mock.restore()
    setupDefaultMocks()
    const { executeBatch } = await import('./batch')

    await expect(executeBatch(undefined, {})).rejects.toThrow(
      'Either provide operations JSON as argument or use --file <path>',
    )
  })

  test('--file option reads operations JSON from file path', async () => {
    mock.restore()
    setupDefaultMocks()

    const mockReadFileSync = mock(() => '[{"action":"page.archive","page_id":"page-1"}]')
    mock.module('node:fs', () => ({
      readFileSync: mockReadFileSync,
    }))

    const { executeBatch } = await import('./batch')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    let exitCode: number | undefined
    const originalExit = process.exit
    process.exit = ((code?: number) => {
      exitCode = code
      return undefined as never
    }) as typeof process.exit

    try {
      await executeBatch('[{"action":"page.create"}]', {
        file: '/tmp/ops.json',
      })
    } finally {
      console.log = originalLog
      process.exit = originalExit
    }

    expect(mockReadFileSync).toHaveBeenCalledWith('/tmp/ops.json', 'utf8')
    expect(output.length).toBe(1)
    expect(exitCode).toBe(0)
  })

  test('registry includes all 10 notionbot action names', async () => {
    mock.restore()
    setupDefaultMocks()
    const { NOTIONBOT_ACTION_REGISTRY } = await import('./batch')

    expect(Object.keys(NOTIONBOT_ACTION_REGISTRY).sort()).toEqual([...validActions].sort())
  })
})
