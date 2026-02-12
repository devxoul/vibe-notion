import { describe, expect, mock, test } from 'bun:test'

describe('database get', () => {
  test('calls syncRecordValues for collection and outputs collection value', async () => {
    mock.restore()
    // Given
    const mockResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              name: [['Test DB']],
              schema: {
                title: { name: 'Name', type: 'title' },
              },
              parent_id: 'block-1',
              alive: true,
              space_id: 'space-123',
            },
          },
        },
      },
    }
    const mockInternalRequest = mock(() => Promise.resolve(mockResponse))
    const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token' }))

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mock(async () => 'view-123'),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['get', 'coll-1'], { from: 'user' })
    } finally {
      console.log = originalLog
    }

    // Then
    expect(mockInternalRequest).toHaveBeenCalledWith('test-token', 'syncRecordValues', {
      requests: [{ pointer: { table: 'collection', id: 'coll-1' }, version: -1 }],
    })
    expect(output.length).toBeGreaterThan(0)
  })

  test('outputs error when collection not found', async () => {
    mock.restore()
    // Given
    const mockResponse = {
      recordMap: {
        collection: {},
      },
    }
    const mockInternalRequest = mock(() => Promise.resolve(mockResponse))
    const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token' }))
    const mockExit = mock(() => {
      throw new Error('process.exit called')
    })

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mock(async () => 'view-123'),
    }))

    const originalExit = process.exit
    process.exit = mockExit as any

    const { databaseCommand } = await import('./database')

    const errors: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errors.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['get', 'coll-1'], { from: 'user' })
    } catch {
      // Expected to throw
    } finally {
      console.error = originalError
      process.exit = originalExit
    }

    // Then
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('Collection not found')
  })
})

describe('database query', () => {
  test('calls resolveCollectionViewId then queryCollection endpoint', async () => {
    mock.restore()
    // Given
    const mockResponse = {
      result: {
        reducerResults: {
          collection_group_results: {
            blockIds: ['row-1'],
            hasMore: false,
          },
        },
      },
      recordMap: {
        block: {},
      },
    }
    const mockInternalRequest = mock(() => Promise.resolve(mockResponse))
    const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token' }))
    const mockResolveCollectionViewId = mock(() => Promise.resolve('view-123'))
    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mockResolveCollectionViewId,
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['query', 'coll-1'], { from: 'user' })
    } finally {
      console.log = originalLog
    }

    // Then
    expect(mockResolveCollectionViewId).toHaveBeenCalledWith('test-token', 'coll-1')
    expect(mockInternalRequest).toHaveBeenCalledWith(
      'test-token',
      'queryCollection',
      expect.any(Object)
    )
    expect(output.length).toBeGreaterThan(0)
  })

  test('uses provided view ID instead of resolving', async () => {
    mock.restore()
    // Given
    const mockResponse = {
      result: {
        reducerResults: {
          collection_group_results: {
            blockIds: ['row-1'],
            hasMore: false,
          },
        },
      },
      recordMap: {
        block: {},
      },
    }
    const mockInternalRequest = mock(() => Promise.resolve(mockResponse))
    const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token' }))
    const mockResolveCollectionViewId = mock(() => Promise.resolve('view-123'))
    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mockResolveCollectionViewId,
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['query', 'coll-1', '--view-id', 'custom-view-id'], {
        from: 'user',
      })
    } finally {
      console.log = originalLog
    }

    // Then
    expect(mockResolveCollectionViewId).not.toHaveBeenCalled()
    expect(mockInternalRequest.mock.calls.length).toBeGreaterThan(0)
    const callArgs = mockInternalRequest.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
    ]
    expect(callArgs[2]).toEqual(
      expect.objectContaining({
        collectionViewId: 'custom-view-id',
      })
    )
  })
})

describe('database list', () => {
  test('calls loadUserContent and outputs collection list', async () => {
    mock.restore()
    // Given
    const mockResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              name: [['My DB']],
              schema: {
                title: { name: 'Name', type: 'title' },
              },
            },
          },
          'coll-2': {
            value: {
              id: 'coll-2',
              name: [['Another DB']],
              schema: {
                title: { name: 'Name', type: 'title' },
              },
            },
          },
        },
      },
    }
    const mockInternalRequest = mock(() => Promise.resolve(mockResponse))
    const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token' }))

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mock(async () => 'view-123'),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['list'], { from: 'user' })
    } finally {
      console.log = originalLog
    }

    // Then
    expect(mockInternalRequest).toHaveBeenCalledWith('test-token', 'loadUserContent', {})
    expect(output.length).toBeGreaterThan(0)
  })
})

describe('database create', () => {
  test('calls saveTransactions with collection, view, and block operations', async () => {
    mock.restore()
    // Given
    const mockGenerateId = mock(() => 'mock-uuid')
    const mockResponse = {
      recordMap: {
        collection: {
          'mock-uuid': {
            value: {
              id: 'mock-uuid',
              name: [['New DB']],
              schema: {
                title: { name: 'Name', type: 'title' },
              },
              parent_id: 'mock-uuid',
              alive: true,
              space_id: 'space-123',
            },
          },
        },
      },
    }
    const mockInternalRequest = mock((_token, endpoint) => {
      if (endpoint === 'saveTransactions') {
        return Promise.resolve({})
      }
      return Promise.resolve(mockResponse)
    })
    const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token' }))
    const mockResolveSpaceId = mock(async () => 'space-123')
    const mockResolveCollectionViewId = mock(async () => 'view-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mockResolveCollectionViewId,
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['create', '--parent', 'parent-123', '--title', 'New DB'], {
        from: 'user',
      })
    } finally {
      console.log = originalLog
    }

    // Then
    const saveTransactionCall = mockInternalRequest.mock.calls.find(
      (call) => (call as unknown[])[1] === 'saveTransactions'
    ) as unknown as [string, string, Record<string, unknown>] | undefined
    expect(saveTransactionCall).toBeDefined()
    if (saveTransactionCall) {
      expect(saveTransactionCall[2]).toEqual(
        expect.objectContaining({
          transactions: expect.any(Array),
        })
      )
    }
    expect(output.length).toBeGreaterThan(0)
  })
})

describe('database update', () => {
  test('calls saveTransactions to update title and re-fetches', async () => {
    mock.restore()
    // Given
    const mockGetResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              name: [['Old Title']],
              schema: {
                title: { name: 'Name', type: 'title' },
              },
              parent_id: 'block-1',
              alive: true,
              space_id: 'space-123',
            },
          },
        },
      },
    }
    const mockUpdateResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              name: [['New Title']],
              schema: {
                title: { name: 'Name', type: 'title' },
              },
              parent_id: 'block-1',
              alive: true,
              space_id: 'space-123',
            },
          },
        },
      },
    }

    let callCount = 0
    const mockInternalRequest = mock(() => {
      callCount++
      if (callCount === 1 || callCount === 3) {
        return Promise.resolve(mockGetResponse)
      }
      if (callCount === 2) {
        return Promise.resolve({})
      }
      return Promise.resolve(mockUpdateResponse)
    })
    const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token' }))

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mock(async () => 'view-123'),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['update', 'coll-1', '--title', 'New Title'], {
        from: 'user',
      })
    } finally {
      console.log = originalLog
    }

    // Then
    const saveTransactionCall = mockInternalRequest.mock.calls.find(
      (call) => (call as unknown[])[1] === 'saveTransactions'
    ) as unknown as [string, string, Record<string, unknown>] | undefined
    expect(saveTransactionCall).toBeDefined()
    expect(output.length).toBeGreaterThan(0)
  })

  test('outputs current collection when no options provided', async () => {
    mock.restore()
    // Given
    const mockResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              name: [['Test DB']],
              schema: {
                title: { name: 'Name', type: 'title' },
              },
              parent_id: 'block-1',
              alive: true,
              space_id: 'space-123',
            },
          },
        },
      },
    }
    const mockInternalRequest = mock(() => Promise.resolve(mockResponse))
    const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token' }))

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mock(async () => 'view-123'),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['update', 'coll-1'], { from: 'user' })
    } finally {
      console.log = originalLog
    }

    // Then
    expect(output.length).toBeGreaterThan(0)
    expect(mockInternalRequest).toHaveBeenCalledTimes(1)
  })
})
