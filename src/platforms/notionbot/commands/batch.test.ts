import { describe, expect, mock, test } from 'bun:test'

import { type ActionRegistry, type NotionBotHandler, normalizeOperationArgs } from '../../../shared/batch/types'

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
  'block.upload',
]

function createMockHandlers() {
  const createHandlerMock = () =>
    mock(async (_client: unknown, _args: Record<string, unknown>): Promise<unknown> => ({}))

  return {
    mockPageCreate: createHandlerMock(),
    mockPageUpdate: createHandlerMock(),
    mockPageArchive: createHandlerMock(),
    mockBlockAppend: createHandlerMock(),
    mockBlockUpdate: createHandlerMock(),
    mockBlockDelete: createHandlerMock(),
    mockCommentCreate: createHandlerMock(),
    mockDatabaseCreate: createHandlerMock(),
    mockDatabaseUpdate: createHandlerMock(),
    mockDatabaseDeleteProperty: createHandlerMock(),
    mockBlockUpload: createHandlerMock(),
  }
}

function createMockRegistry(handlers: ReturnType<typeof createMockHandlers>): ActionRegistry<NotionBotHandler> {
  return {
    'page.create': handlers.mockPageCreate,
    'page.update': handlers.mockPageUpdate,
    'page.archive': handlers.mockPageArchive,
    'block.append': handlers.mockBlockAppend,
    'block.update': handlers.mockBlockUpdate,
    'block.delete': handlers.mockBlockDelete,
    'comment.create': handlers.mockCommentCreate,
    'database.create': handlers.mockDatabaseCreate,
    'database.update': handlers.mockDatabaseUpdate,
    'database.delete-property': handlers.mockDatabaseDeleteProperty,
    'block.upload': handlers.mockBlockUpload,
  }
}

function createDefaultDeps(handlers: ReturnType<typeof createMockHandlers>) {
  const output: string[] = []
  let exitCode: number | undefined
  const mockValidateOperations = mock(() => {})
  const mockGetClientOrThrow = mock(() => ({ id: 'mock-client' }))

  return {
    deps: {
      actionRegistry: createMockRegistry(handlers),
      getClientOrThrow: mockGetClientOrThrow,
      validateOperations: mockValidateOperations,
      normalizeOperationArgs,
      readFileSync: mock(() => '[]'),
      log: (...args: unknown[]) => output.push(args.map(String).join(' ')),
      exit: (code?: number): undefined => {
        exitCode = code
        return undefined
      },
    },
    output,
    getExitCode: () => exitCode,
    mockValidateOperations,
    mockGetClientOrThrow,
  }
}

describe('notionbot batch command', () => {
  test('valid single operation outputs success summary', async () => {
    const handlers = createMockHandlers()
    const { deps, output, getExitCode, mockValidateOperations, mockGetClientOrThrow } = createDefaultDeps(handlers)
    handlers.mockPageArchive.mockImplementationOnce(async () => ({ archived: true, id: 'page-1' }))

    const { executeBatch } = await import('./batch')
    await executeBatch('[{"action":"page.archive","page_id":"page-1"}]', {}, deps)

    expect(mockValidateOperations).toHaveBeenCalledWith([{ action: 'page.archive', page_id: 'page-1' }], validActions)
    expect(mockGetClientOrThrow).toHaveBeenCalled()
    expect(output.length).toBe(1)
    expect(JSON.parse(output[0])).toEqual({
      results: [{ index: 0, action: 'page.archive', success: true, data: { archived: true, id: 'page-1' } }],
      total: 1,
      succeeded: 1,
      failed: 0,
    })
    expect(getExitCode()).toBe(0)
  })

  test('valid multiple operations execute sequentially and all succeed', async () => {
    const handlers = createMockHandlers()
    const { deps, output, getExitCode } = createDefaultDeps(handlers)
    handlers.mockPageCreate.mockImplementationOnce(async () => ({ id: 'p1' }))
    handlers.mockBlockAppend.mockImplementationOnce(async () => ({ created: ['b1'] }))

    const { executeBatch } = await import('./batch')
    await executeBatch(
      '[{"action":"page.create","parent":"root","title":"Hello"},{"action":"block.append","parent_id":"p1","content":"[]"}]',
      {},
      deps,
    )

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
    expect(getExitCode()).toBe(0)
  })

  test('first operation failure triggers fail-fast and exit 1', async () => {
    const handlers = createMockHandlers()
    const { deps, output, getExitCode } = createDefaultDeps(handlers)
    handlers.mockPageCreate.mockImplementationOnce(async () => {
      throw new Error('create failed')
    })

    const { executeBatch } = await import('./batch')
    await executeBatch(
      '[{"action":"page.create","parent":"root","title":"Hello"},{"action":"block.append","parent_id":"p1","content":"[]"}]',
      {},
      deps,
    )

    expect(handlers.mockBlockAppend).not.toHaveBeenCalled()
    expect(JSON.parse(output[0])).toEqual({
      results: [{ index: 0, action: 'page.create', success: false, error: 'create failed' }],
      total: 2,
      succeeded: 0,
      failed: 1,
    })
    expect(getExitCode()).toBe(1)
  })

  test('invalid action name throws from validateOperations before execution', async () => {
    const handlers = createMockHandlers()
    const { deps, mockValidateOperations, mockGetClientOrThrow } = createDefaultDeps(handlers)
    mockValidateOperations.mockImplementationOnce(() => {
      throw new Error('Invalid action "bad.action" at index 0')
    })

    const { executeBatch } = await import('./batch')

    await expect(executeBatch('[{"action":"bad.action"}]', {}, deps)).rejects.toThrow(
      'Invalid action "bad.action" at index 0',
    )

    expect(mockGetClientOrThrow).not.toHaveBeenCalled()
  })

  test('empty operations array throws validation error', async () => {
    const handlers = createMockHandlers()
    const { deps } = createDefaultDeps(handlers)
    const { executeBatch } = await import('./batch')

    await expect(executeBatch('[]', {}, deps)).rejects.toThrow('Operations array cannot be empty')
  })

  test('invalid JSON string throws parse error', async () => {
    const handlers = createMockHandlers()
    const { deps } = createDefaultDeps(handlers)
    const { executeBatch } = await import('./batch')

    await expect(executeBatch('{not-json}', {}, deps)).rejects.toThrow()
  })

  test('missing operations arg and --file throws helpful error', async () => {
    const handlers = createMockHandlers()
    const { deps } = createDefaultDeps(handlers)
    const { executeBatch } = await import('./batch')

    await expect(executeBatch(undefined, {}, deps)).rejects.toThrow(
      'Either provide operations JSON as argument or use --file <path>',
    )
  })

  test('--file option reads operations JSON from file path', async () => {
    const handlers = createMockHandlers()
    const { deps, output, getExitCode } = createDefaultDeps(handlers)
    const mockReadFileSync = mock(() => '[{"action":"page.archive","page_id":"page-1"}]')
    deps.readFileSync = mockReadFileSync

    const { executeBatch } = await import('./batch')

    await executeBatch(
      '[{"action":"page.create"}]',
      {
        file: '/tmp/ops.json',
      },
      deps,
    )

    expect(mockReadFileSync).toHaveBeenCalledWith('/tmp/ops.json', 'utf8')
    expect(output.length).toBe(1)
    expect(getExitCode()).toBe(0)
  })

  test('object-valued properties are stringified before passing to handler', async () => {
    const handlers = createMockHandlers()
    const { deps, getExitCode } = createDefaultDeps(handlers)
    handlers.mockDatabaseCreate.mockImplementationOnce(async () => ({ id: 'db-1' }))

    const { executeBatch } = await import('./batch')
    await executeBatch(
      '[{"action":"database.create","parent":"page-1","title":"My DB","properties":{"Status":{"select":{}}}}]',
      {},
      deps,
    )

    const handlerArgsUnknown = handlers.mockDatabaseCreate.mock.calls[0]?.[1] as unknown
    expect(handlerArgsUnknown).toBeDefined()
    const handlerArgs = handlerArgsUnknown as Record<string, unknown>
    expect(handlerArgs.properties).toBe('{"Status":{"select":{}}}')
    expect(handlerArgs.parent).toBe('page-1')
    expect(handlerArgs.title).toBe('My DB')
    expect(getExitCode()).toBe(0)
  })

  test('page.update deserializes object-valued set through the batch entrypoint', async () => {
    // Given
    const mockPageRetrieve = mock(async () => ({
      id: 'page-1',
      object: 'page',
      url: 'https://notion.so/page-1',
      archived: false,
      last_edited_time: '2024-01-01T00:00:00.000Z',
      parent: { type: 'page_id', page_id: 'parent-1' },
      properties: {
        Status: { id: 'status-id', type: 'status', status: { name: 'In Progress' } },
      },
    }))
    const mockRequest = mock(async () => ({
      id: 'page-1',
      object: 'page',
      url: 'https://notion.so/page-1',
      archived: false,
      last_edited_time: '2024-01-01T00:00:00.000Z',
      parent: { type: 'page_id', page_id: 'parent-1' },
      properties: {
        Status: { id: 'status-id', type: 'status', status: { name: 'Done' } },
      },
    }))
    const client = {
      pages: { retrieve: mockPageRetrieve },
      request: mockRequest,
    }
    const output: string[] = []
    let exitCode: number | undefined
    const { executeBatch } = await import('./batch')

    // When
    await executeBatch(
      '[{"action":"page.update","page_id":"page-1","set":{"Status":"Done"}}]',
      {},
      {
        getClientOrThrow: () => client as any,
        log: (...args: unknown[]) => output.push(args.map(String).join(' ')),
        exit: (code?: number): undefined => {
          exitCode = code
          return undefined
        },
      },
    )

    // Then
    expect(mockRequest).toHaveBeenCalledWith({
      path: 'pages/page-1',
      method: 'patch',
      body: {
        properties: {
          Status: { status: { name: 'Done' } },
        },
      },
    })
    expect(mockPageRetrieve).toHaveBeenCalledTimes(1)
    expect(JSON.parse(output[0]).results[0].success).toBe(true)
    expect(exitCode).toBe(0)
  })

  test('page.update reports invalid set values without calling Notion', async () => {
    // Given
    const invalidSets = ['not-json', [{ Status: 'Done' }], '1', { Status: 1 }]
    const { executeBatch } = await import('./batch')

    for (const set of invalidSets) {
      const mockPageRetrieve = mock(async () => ({}))
      const mockRequest = mock(async () => ({}))
      const output: string[] = []
      let exitCode: number | undefined

      // When
      await executeBatch(
        JSON.stringify([{ action: 'page.update', page_id: 'page-1', set }]),
        {},
        {
          getClientOrThrow: () =>
            ({
              pages: { retrieve: mockPageRetrieve },
              request: mockRequest,
            }) as any,
          log: (...args: unknown[]) => output.push(args.map(String).join(' ')),
          exit: (code?: number): undefined => {
            exitCode = code
            return undefined
          },
        },
      )

      // Then
      expect(JSON.parse(output[0])).toEqual({
        results: [
          {
            index: 0,
            action: 'page.update',
            success: false,
            error: 'Invalid page.update set: expected a JSON object with string property values.',
          },
        ],
        total: 1,
        succeeded: 0,
        failed: 1,
      })
      expect(exitCode).toBe(1)
      expect(mockPageRetrieve).not.toHaveBeenCalled()
      expect(mockRequest).not.toHaveBeenCalled()
    }
  })

  test('page.update supports content replacement without set', async () => {
    // Given
    const mockPageRetrieve = mock(async () => ({
      id: 'page-1',
      object: 'page',
      url: 'https://notion.so/page-1',
      archived: false,
      last_edited_time: '2024-01-01T00:00:00.000Z',
      parent: { type: 'page_id', page_id: 'parent-1' },
      properties: {},
    }))
    const mockListChildren = mock(async () => ({ results: [], has_more: false, next_cursor: null }))
    const mockAppendChildren = mock(async () => ({}))
    const client = {
      pages: { retrieve: mockPageRetrieve },
      blocks: {
        children: { list: mockListChildren },
        delete: mock(async () => ({})),
      },
      appendBlockChildren: mockAppendChildren,
    }
    const output: string[] = []
    let exitCode: number | undefined
    const { executeBatch } = await import('./batch')

    // When
    await executeBatch(
      '[{"action":"page.update","page_id":"page-1","replaceContent":true,"markdown":"content"}]',
      {},
      {
        getClientOrThrow: () => client as any,
        log: (...args: unknown[]) => output.push(args.map(String).join(' ')),
        exit: (code?: number): undefined => {
          exitCode = code
          return undefined
        },
      },
    )

    // Then
    expect(mockListChildren).toHaveBeenCalledTimes(1)
    expect(mockAppendChildren).toHaveBeenCalledTimes(1)
    expect(JSON.parse(output[0]).results[0].success).toBe(true)
    expect(exitCode).toBe(0)
  })

  test('block.upload action calls upload handler with correct args', async () => {
    const handlers = createMockHandlers()
    const { deps, output, getExitCode } = createDefaultDeps(handlers)
    handlers.mockBlockUpload.mockImplementationOnce(async () => ({
      id: 'file-1',
      type: 'image',
      url: 'https://example.com/file.png',
    }))

    const { executeBatch } = await import('./batch')
    await executeBatch('[{"action":"block.upload","parent_id":"block-1","file":"/tmp/image.png"}]', {}, deps)

    expect(handlers.mockBlockUpload).toHaveBeenCalledTimes(1)
    const callArgs = handlers.mockBlockUpload.mock.calls[0] as unknown[]
    expect(callArgs[0]).toEqual({ id: 'mock-client' })
    const handlerArgs = callArgs[1] as Record<string, unknown>
    expect(handlerArgs.parent_id).toBe('block-1')
    expect(handlerArgs.file).toBe('/tmp/image.png')
    expect(JSON.parse(output[0])).toEqual({
      results: [
        {
          index: 0,
          action: 'block.upload',
          success: true,
          data: { id: 'file-1', type: 'image', url: 'https://example.com/file.png' },
        },
      ],
      total: 1,
      succeeded: 1,
      failed: 0,
    })
    expect(getExitCode()).toBe(0)
  })

  test('registry includes all 11 notionbot action names', async () => {
    const { NOTIONBOT_ACTION_REGISTRY } = await import('./batch')

    expect(Object.keys(NOTIONBOT_ACTION_REGISTRY).sort()).toEqual([...validActions].sort())
  })
})
