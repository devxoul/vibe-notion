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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['get', 'coll-1', '--workspace-id', 'space-123'], { from: 'user' })
    } finally {
      console.log = originalLog
    }

    // Then
    expect(mockInternalRequest).toHaveBeenCalledWith('test-token', 'syncRecordValues', {
      requests: [{ pointer: { table: 'collection', id: 'coll-1' }, version: -1 }],
    })
    expect(output.length).toBeGreaterThan(0)
    const parsed = JSON.parse(output[0])
    expect(parsed).toEqual({
      id: 'coll-1',
      name: 'Test DB',
      schema: { Name: { type: 'title' } },
    })
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const originalExit = process.exit
    process.exit = mockExit as any

    const { databaseCommand } = await import('./database')

    const errors: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errors.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['get', 'coll-1', '--workspace-id', 'space-123'], { from: 'user' })
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
  test('outputs schema-based row properties from queryCollection response', async () => {
    mock.restore()
    // Given
    const mockQueryResponse = {
      result: {
        reducerResults: {
          collection_group_results: {
            blockIds: ['row-1'],
            hasMore: false,
          },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              type: 'page',
              properties: {
                '@lzG': [['고래몰']],
                'Ho]U': [['완료']],
                SdrK: [['위젯 설치']],
              },
            },
          },
        },
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                '@lzG': { name: '고객사', type: 'title' },
                'Ho]U': { name: '상태', type: 'status' },
                SdrK: { name: '타입', type: 'text' },
              },
            },
          },
        },
      },
    }
    const mockInternalRequest = mock((_token: string, endpoint: string) => {
      if (endpoint === 'queryCollection') {
        return Promise.resolve(mockQueryResponse)
      }
      return Promise.resolve({})
    })
    const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token' }))
    const mockResolveCollectionViewId = mock(() => Promise.resolve('view-123'))

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mockResolveCollectionViewId,
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['query', 'coll-1', '--workspace-id', 'space-123'], { from: 'user' })
    } finally {
      console.log = originalLog
    }

    // Then
    expect(mockResolveCollectionViewId).toHaveBeenCalledWith('test-token', 'coll-1')
    expect(mockInternalRequest).toHaveBeenCalledWith('test-token', 'queryCollection', expect.any(Object))
    expect(output.length).toBeGreaterThan(0)
    const parsed = JSON.parse(output[0])
    expect(parsed).toEqual({
      results: [
        {
          id: 'row-1',
          properties: {
            고객사: { type: 'title', value: '고래몰' },
            상태: { type: 'status', value: '완료' },
            타입: { type: 'text', value: '위젯 설치' },
          },
        },
      ],
      has_more: false,
      next_cursor: null,
    })
  })

  test('uses provided view ID instead of resolving', async () => {
    mock.restore()
    // Given
    const mockQueryResponse = {
      result: {
        reducerResults: {
          collection_group_results: {
            blockIds: ['row-1'],
            hasMore: false,
          },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              properties: {
                title: [['Row Name']],
              },
            },
          },
        },
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                title: { name: 'Name', type: 'title' },
              },
            },
          },
        },
      },
    }
    const mockInternalRequest = mock((_token: string, endpoint: string) => {
      if (endpoint === 'queryCollection') {
        return Promise.resolve(mockQueryResponse)
      }
      return Promise.resolve({})
    })
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        ['query', 'coll-1', '--workspace-id', 'space-123', '--view-id', 'custom-view-id'],
        {
          from: 'user',
        },
      )
    } finally {
      console.log = originalLog
    }

    // Then
    expect(mockResolveCollectionViewId).not.toHaveBeenCalled()
    expect(mockInternalRequest.mock.calls.length).toBeGreaterThan(0)
    const queryCall = mockInternalRequest.mock.calls.find(
      (call) => (call as unknown[])[1] === 'queryCollection',
    ) as unknown as [string, string, Record<string, unknown>] | undefined
    expect(queryCall).toBeDefined()
    expect(queryCall?.[2]).toEqual(
      expect.objectContaining({
        collectionViewId: 'custom-view-id',
      }),
    )
  })

  test('resolves relation and person IDs via syncRecordValues batch call', async () => {
    mock.restore()
    // Given
    const mockQueryResponse = {
      result: {
        reducerResults: {
          collection_group_results: {
            blockIds: ['row-1'],
            hasMore: false,
          },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              properties: {
                relKey: [
                  ['‣', [['p', 'page-abc']]],
                  ['‣', [['p', 'page-def']]],
                ],
                personKey: [['‣', [['u', 'user-123']]]],
              },
            },
          },
        },
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                relKey: { name: '플랜', type: 'relation' },
                personKey: { name: '이름', type: 'person' },
              },
            },
          },
        },
      },
    }
    const mockSyncResponse = {
      recordMap: {
        block: {
          'page-abc': {
            value: {
              id: 'page-abc',
              type: 'page',
              properties: { title: [['Claude Max (20x)']] },
            },
          },
          'page-def': {
            value: {
              id: 'page-def',
              type: 'page',
              properties: { title: [['Pro Plan']] },
            },
          },
        },
        notion_user: {
          'user-123': {
            value: {
              id: 'user-123',
              name: 'Leo (주원)',
            },
          },
        },
      },
    }
    const mockInternalRequest = mock((_token: string, endpoint: string) => {
      if (endpoint === 'queryCollection') return Promise.resolve(mockQueryResponse)
      if (endpoint === 'syncRecordValues') return Promise.resolve(mockSyncResponse)
      return Promise.resolve({})
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['query', 'coll-1', '--workspace-id', 'space-123'], { from: 'user' })
    } finally {
      console.log = originalLog
    }

    // Then - syncRecordValues called with batch of page + user IDs
    const syncCall = mockInternalRequest.mock.calls.find(
      (call) => (call as unknown[])[1] === 'syncRecordValues',
    ) as unknown as [string, string, Record<string, unknown>] | undefined
    expect(syncCall).toBeDefined()
    const requests = (syncCall?.[2] as { requests: unknown[] }).requests
    expect(requests).toEqual(
      expect.arrayContaining([
        { pointer: { table: 'block', id: 'page-abc' }, version: -1 },
        { pointer: { table: 'block', id: 'page-def' }, version: -1 },
        { pointer: { table: 'notion_user', id: 'user-123' }, version: -1 },
      ]),
    )

    // Then - output has resolved values
    expect(output.length).toBeGreaterThan(0)
    const parsed = JSON.parse(output[0])
    expect(parsed.results[0].properties).toEqual({
      플랜: {
        type: 'relation',
        value: [
          { id: 'page-abc', title: 'Claude Max (20x)' },
          { id: 'page-def', title: 'Pro Plan' },
        ],
      },
      이름: {
        type: 'person',
        value: [{ id: 'user-123', name: 'Leo (주원)' }],
      },
    })
  })

  test('skips syncRecordValues when no relation or person properties exist', async () => {
    mock.restore()
    // Given
    const mockQueryResponse = {
      result: {
        reducerResults: {
          collection_group_results: {
            blockIds: ['row-1'],
            hasMore: false,
          },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              properties: {
                titleKey: [['Simple Row']],
              },
            },
          },
        },
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                titleKey: { name: 'Name', type: 'title' },
              },
            },
          },
        },
      },
    }
    const mockInternalRequest = mock((_token: string, endpoint: string) => {
      if (endpoint === 'queryCollection') return Promise.resolve(mockQueryResponse)
      return Promise.resolve({})
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['query', 'coll-1', '--workspace-id', 'space-123'], { from: 'user' })
    } finally {
      console.log = originalLog
    }

    // Then - only queryCollection called, no syncRecordValues
    const syncCalls = mockInternalRequest.mock.calls.filter((call) => (call as unknown[])[1] === 'syncRecordValues')
    expect(syncCalls.length).toBe(0)
  })

  test('passes filter to queryCollection loader', async () => {
    mock.restore()
    // Given
    const mockQueryResponse = {
      result: {
        reducerResults: {
          collection_group_results: {
            blockIds: ['row-1'],
            hasMore: false,
          },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              properties: {
                'Ho]U': [['완료']],
              },
            },
          },
        },
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                'Ho]U': { name: '상태', type: 'status' },
              },
            },
          },
        },
      },
    }
    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'queryCollection') {
        expect(body.loader).toEqual(
          expect.objectContaining({
            filter: {
              filters: [
                {
                  filter: { operator: 'enum_is', value: { type: 'exact', value: 'Done' } },
                  property: 'Ho]U',
                },
              ],
              operator: 'and',
            },
          }),
        )
        return Promise.resolve(mockQueryResponse)
      }
      return Promise.resolve({})
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        [
          'query',
          'coll-1',
          '--workspace-id',
          'space-123',
          '--filter',
          '{"filters":[{"filter":{"operator":"enum_is","value":{"type":"exact","value":"Done"}},"property":"Ho]U"}],"operator":"and"}',
        ],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then
    expect(mockInternalRequest).toHaveBeenCalledWith('test-token', 'queryCollection', expect.any(Object))
    expect(output.length).toBeGreaterThan(0)
  })

  test('passes sort to queryCollection loader', async () => {
    mock.restore()
    // Given
    const mockQueryResponse = {
      result: {
        reducerResults: {
          collection_group_results: {
            blockIds: ['row-1'],
            hasMore: false,
          },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              properties: {
                title: [['Row Name']],
              },
            },
          },
        },
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                title: { name: 'Name', type: 'title' },
              },
            },
          },
        },
      },
    }
    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'queryCollection') {
        expect(body.loader).toEqual(
          expect.objectContaining({
            sort: [{ property: 'title', direction: 'ascending' }],
          }),
        )
        return Promise.resolve(mockQueryResponse)
      }
      return Promise.resolve({})
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        ['query', 'coll-1', '--workspace-id', 'space-123', '--sort', '[{"property":"title","direction":"ascending"}]'],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then
    expect(mockInternalRequest).toHaveBeenCalledWith('test-token', 'queryCollection', expect.any(Object))
    expect(output.length).toBeGreaterThan(0)
  })

  test('does not include filter or sort when not provided', async () => {
    mock.restore()
    // Given
    const mockQueryResponse = {
      result: {
        reducerResults: {
          collection_group_results: {
            blockIds: ['row-1'],
            hasMore: false,
          },
        },
      },
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              properties: {
                title: [['Row Name']],
              },
            },
          },
        },
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                title: { name: 'Name', type: 'title' },
              },
            },
          },
        },
      },
    }
    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'queryCollection') {
        expect((body.loader as Record<string, unknown>).filter).toBeUndefined()
        expect((body.loader as Record<string, unknown>).sort).toBeUndefined()
        return Promise.resolve(mockQueryResponse)
      }
      return Promise.resolve({})
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['query', 'coll-1', '--workspace-id', 'space-123'], { from: 'user' })
    } finally {
      console.log = originalLog
    }

    // Then
    expect(mockInternalRequest).toHaveBeenCalledWith('test-token', 'queryCollection', expect.any(Object))
    expect(output.length).toBeGreaterThan(0)
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['list', '--workspace-id', 'space-123'], { from: 'user' })
    } finally {
      console.log = originalLog
    }

    // Then
    expect(mockInternalRequest).toHaveBeenCalledWith('test-token', 'loadUserContent', {})
    expect(output.length).toBeGreaterThan(0)
    const parsed = JSON.parse(output[0])
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBe(2)
    expect(parsed[0]).toEqual({
      id: 'coll-1',
      name: 'My DB',
      schema_properties: ['title'],
    })
    expect(parsed[1]).toEqual({
      id: 'coll-2',
      name: 'Another DB',
      schema_properties: ['title'],
    })
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        ['create', '--workspace-id', 'space-123', '--parent', 'parent-123', '--title', 'New DB'],
        {
          from: 'user',
        },
      )
    } finally {
      console.log = originalLog
    }

    // Then
    const saveTransactionCall = mockInternalRequest.mock.calls.find(
      (call) => (call as unknown[])[1] === 'saveTransactions',
    ) as unknown as [string, string, Record<string, unknown>] | undefined
    expect(saveTransactionCall).toBeDefined()
    if (saveTransactionCall) {
      expect(saveTransactionCall[2]).toEqual(
        expect.objectContaining({
          transactions: expect.any(Array),
        }),
      )
    }
    expect(output.length).toBeGreaterThan(0)
    const parsed = JSON.parse(output[0])
    expect(parsed).toEqual({
      id: 'mock-uuid',
      name: 'New DB',
      schema: { Name: { type: 'title' } },
    })
  })

  test('enhances relation properties with v2 fields and sets rollup_type', async () => {
    mock.restore()
    // Given — target collection schema for rollup resolution
    const mockTargetCollectionResponse = {
      recordMap: {
        collection: {
          'target-coll': {
            value: {
              id: 'target-coll',
              name: [['Target DB']],
              schema: {
                title: { name: 'Name', type: 'title' },
                src_id: { name: 'Source ID', type: 'text' },
              },
              parent_id: 'block-2',
              alive: true,
              space_id: 'space-123',
            },
          },
        },
      },
    }
    const mockCreatedResponse = {
      recordMap: {
        collection: {
          'mock-uuid': {
            value: {
              id: 'mock-uuid',
              name: [['With Rollup']],
              schema: {
                title: { name: 'Name', type: 'title' },
                rel: { name: 'My Rel', type: 'relation', collection_id: 'target-coll' },
                my_rollup: {
                  name: 'My Rollup',
                  type: 'rollup',
                  relation_property: 'rel',
                  target_property: 'src_id',
                  target_property_type: 'text',
                },
              },
              parent_id: 'mock-uuid',
              alive: true,
              space_id: 'space-123',
            },
          },
        },
      },
    }

    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'saveTransactions') return Promise.resolve({})
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string; id: string } }>
        if (requests[0]?.pointer.id === 'target-coll') {
          return Promise.resolve(mockTargetCollectionResponse)
        }
        // For resolveSpaceId or final fetch
        return Promise.resolve(mockCreatedResponse)
      }
      return Promise.resolve(mockCreatedResponse)
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        [
          'create',
          '--workspace-id',
          'space-123',
          '--parent',
          'parent-123',
          '--title',
          'With Rollup',
          '--properties',
          JSON.stringify({
            rel: { name: 'My Rel', type: 'relation', collection_id: 'target-coll' },
            my_rollup: {
              name: 'My Rollup',
              type: 'rollup',
              relation_property: 'rel',
              target_property: 'Source ID',
            },
          }),
        ],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then — check the schema sent in saveTransactions
    const saveTransactionCall = mockInternalRequest.mock.calls.find(
      (call) => (call as unknown[])[1] === 'saveTransactions',
    ) as unknown as [string, string, Record<string, unknown>] | undefined
    expect(saveTransactionCall).toBeDefined()
    const args = (saveTransactionCall?.[2] as any).transactions[0].operations[0].args
    const schema = args.schema

    // Relation should have v2 fields
    expect(schema.rel).toEqual(
      expect.objectContaining({
        name: 'My Rel',
        type: 'relation',
        version: 'v2',
        property: 'rel',
        collection_id: 'target-coll',
        autoRelate: { enabled: false },
        collection_pointer: { id: 'target-coll', table: 'collection', spaceId: 'space-123' },
      }),
    )

    // Rollup should have rollup_type and resolved references
    expect(schema.my_rollup).toEqual(
      expect.objectContaining({
        name: 'My Rollup',
        type: 'rollup',
        relation_property: 'rel',
        target_property: 'src_id',
        target_property_type: 'text',
        rollup_type: 'relation',
      }),
    )

    // Rollup must NOT contain aggregation — it crashes the Notion app
    expect(schema.my_rollup).not.toHaveProperty('aggregation')
  })

  test('strips aggregation from rollup when user provides it', async () => {
    mock.restore()
    // Given — user provides aggregation in rollup definition
    const mockTargetCollectionResponse = {
      recordMap: {
        collection: {
          'target-coll': {
            value: {
              id: 'target-coll',
              name: [['Target DB']],
              schema: {
                title: { name: 'Name', type: 'title' },
                src_id: { name: 'Source ID', type: 'text' },
              },
              parent_id: 'block-2',
              alive: true,
              space_id: 'space-123',
            },
          },
        },
      },
    }
    const mockCreatedResponse = {
      recordMap: {
        collection: {
          'mock-uuid': {
            value: {
              id: 'mock-uuid',
              name: [['With Rollup']],
              schema: {
                title: { name: 'Name', type: 'title' },
                rel: { name: 'My Rel', type: 'relation', collection_id: 'target-coll' },
                my_rollup: {
                  name: 'My Rollup',
                  type: 'rollup',
                  relation_property: 'rel',
                  target_property: 'src_id',
                  target_property_type: 'text',
                  rollup_type: 'relation',
                },
              },
              parent_id: 'mock-uuid',
              alive: true,
              space_id: 'space-123',
            },
          },
        },
      },
    }

    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'saveTransactions') return Promise.resolve({})
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string; id: string } }>
        if (requests[0]?.pointer.id === 'target-coll') {
          return Promise.resolve(mockTargetCollectionResponse)
        }
        return Promise.resolve(mockCreatedResponse)
      }
      return Promise.resolve(mockCreatedResponse)
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When — user provides aggregation: 'show_original'
      await databaseCommand.parseAsync(
        [
          'create',
          '--workspace-id',
          'space-123',
          '--parent',
          'parent-123',
          '--title',
          'With Rollup',
          '--properties',
          JSON.stringify({
            rel: { name: 'My Rel', type: 'relation', collection_id: 'target-coll' },
            my_rollup: {
              name: 'My Rollup',
              type: 'rollup',
              relation_property: 'rel',
              target_property: 'Source ID',
              aggregation: 'show_original',
            },
          }),
        ],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then — aggregation must be stripped from schema sent to Notion
    const saveTransactionCall = mockInternalRequest.mock.calls.find(
      (call) => (call as unknown[])[1] === 'saveTransactions',
    ) as unknown as [string, string, Record<string, unknown>] | undefined
    expect(saveTransactionCall).toBeDefined()
    const args = (saveTransactionCall?.[2] as any).transactions[0].operations[0].args
    const schema = args.schema

    expect(schema.my_rollup).not.toHaveProperty('aggregation')
    expect(schema.my_rollup.rollup_type).toBe('relation')
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
      if (callCount === 1) {
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['update', 'coll-1', '--workspace-id', 'space-123', '--title', 'New Title'], {
        from: 'user',
      })
    } finally {
      console.log = originalLog
    }

    // Then
    const saveTransactionCall = mockInternalRequest.mock.calls.find(
      (call) => (call as unknown[])[1] === 'saveTransactions',
    ) as unknown as [string, string, Record<string, unknown>] | undefined
    expect(saveTransactionCall).toBeDefined()
    expect(output.length).toBeGreaterThan(0)
    const parsed = JSON.parse(output[0])
    expect(parsed).toEqual({
      id: 'coll-1',
      name: 'New Title',
      schema: { Name: { type: 'title' } },
    })
  })

  test('merges new properties into existing schema', async () => {
    mock.restore()
    // Given
    const mockGetResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              name: [['Test DB']],
              schema: {
                title: { name: 'Name', type: 'title' },
                prop1: { name: 'Status', type: 'select' },
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
              name: [['Test DB']],
              schema: {
                title: { name: 'Name', type: 'title' },
                prop1: { name: 'Status', type: 'select' },
                prop2: { name: 'Priority', type: 'select' },
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
      if (callCount === 1) return Promise.resolve(mockGetResponse)
      if (callCount === 2) return Promise.resolve({})
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        [
          'update',
          'coll-1',
          '--workspace-id',
          'space-123',
          '--properties',
          '{"prop2":{"name":"Priority","type":"select"}}',
        ],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then — saveTransactions called with merged schema
    const saveTransactionCall = mockInternalRequest.mock.calls.find(
      (call) => (call as unknown[])[1] === 'saveTransactions',
    ) as unknown as [string, string, Record<string, unknown>] | undefined
    expect(saveTransactionCall).toBeDefined()
    const args = (saveTransactionCall?.[2] as any).transactions[0].operations[0].args
    expect(args.schema).toEqual({
      title: { name: 'Name', type: 'title' },
      prop1: { name: 'Status', type: 'select' },
      prop2: { name: 'Priority', type: 'select' },
    })
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['update', 'coll-1', '--workspace-id', 'space-123'], { from: 'user' })
    } finally {
      console.log = originalLog
    }

    // Then
    expect(output.length).toBeGreaterThan(0)
    expect(mockInternalRequest).toHaveBeenCalledTimes(1)
    const parsed = JSON.parse(output[0])
    expect(parsed).toEqual({
      id: 'coll-1',
      name: 'Test DB',
      schema: { Name: { type: 'title' } },
    })
  })
})

describe('database add-row', () => {
  test('add-row with select property registers new option in schema', async () => {
    mock.restore()
    // Given
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              parent_id: 'block-1',
              schema: {
                title: { name: 'Name', type: 'title' },
                prop1: {
                  name: 'Status',
                  type: 'select',
                  options: [{ id: 'abcd', color: 'default', value: 'Existing' }],
                },
              },
            },
          },
        },
      },
    }
    const mockCreatedBlockResponse = {
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              type: 'page',
              properties: { title: [['Task row']] },
            },
          },
        },
      },
    }
    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'saveTransactions') {
        return Promise.resolve({})
      }
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string } }>
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }
        return Promise.resolve(mockCreatedBlockResponse)
      }
      return Promise.resolve({})
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        [
          'add-row',
          'coll-1',
          '--workspace-id',
          'space-123',
          '--title',
          'Task row',
          '--properties',
          '{"Status":"In Progress"}',
        ],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then
    const saveCall = mockInternalRequest.mock.calls.find((call) => (call as unknown[])[1] === 'saveTransactions') as
      | [string, string, { transactions: Array<{ operations: Array<Record<string, unknown>> }> }]
      | undefined
    expect(saveCall).toBeDefined()
    if (!saveCall) {
      throw new Error('Expected saveTransactions call')
    }

    const operations = saveCall[2].transactions[0].operations
    const schemaUpdate = operations.find(
      (op) => Array.isArray(op.path) && op.path[0] === 'schema' && op.path[1] === 'prop1',
    )
    expect(schemaUpdate).toBeDefined()

    const schemaArgs = schemaUpdate?.args as { options?: Array<{ value?: string; id?: string; color?: string }> }
    expect(schemaArgs.options?.map((option) => option.value)).toEqual(['Existing', 'In Progress'])

    const newOption = schemaArgs.options?.find((option) => option.value === 'In Progress')
    expect(newOption?.id).toMatch(/^[A-Za-z0-9]{4}$/)
    expect(newOption?.color).toBe('gray')
    expect(output.length).toBeGreaterThan(0)
  })

  test('add-row with multi_select property registers new options in schema', async () => {
    mock.restore()
    // Given
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              parent_id: 'block-1',
              schema: {
                title: { name: 'Name', type: 'title' },
                prop1: {
                  name: 'Labels',
                  type: 'multi_select',
                  options: [{ id: 'abcd', color: 'default', value: 'Existing' }],
                },
              },
            },
          },
        },
      },
    }
    const mockCreatedBlockResponse = {
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              type: 'page',
              properties: { title: [['Task row']] },
            },
          },
        },
      },
    }
    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'saveTransactions') {
        return Promise.resolve({})
      }
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string } }>
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }
        return Promise.resolve(mockCreatedBlockResponse)
      }
      return Promise.resolve({})
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        [
          'add-row',
          'coll-1',
          '--workspace-id',
          'space-123',
          '--title',
          'Task row',
          '--properties',
          '{"Labels":["Alpha","Beta"]}',
        ],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then
    const saveCall = mockInternalRequest.mock.calls.find((call) => (call as unknown[])[1] === 'saveTransactions') as
      | [string, string, { transactions: Array<{ operations: Array<Record<string, unknown>> }> }]
      | undefined
    expect(saveCall).toBeDefined()
    if (!saveCall) {
      throw new Error('Expected saveTransactions call')
    }

    const operations = saveCall[2].transactions[0].operations
    const schemaUpdate = operations.find(
      (op) => Array.isArray(op.path) && op.path[0] === 'schema' && op.path[1] === 'prop1',
    )
    expect(schemaUpdate).toBeDefined()

    const schemaArgs = schemaUpdate?.args as { options?: Array<{ value?: string; color?: string }> }
    expect(schemaArgs.options?.map((option) => option.value)).toEqual(['Existing', 'Alpha', 'Beta'])
    expect(schemaArgs.options?.[1]?.color).toBe('gray')
    expect(schemaArgs.options?.[2]?.color).toBe('brown')
    expect(output.length).toBeGreaterThan(0)
  })

  test('add-row with select value that already exists in schema options does NOT duplicate', async () => {
    mock.restore()
    // Given
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              parent_id: 'block-1',
              schema: {
                title: { name: 'Name', type: 'title' },
                prop1: {
                  name: 'Status',
                  type: 'select',
                  options: [{ id: 'abcd', color: 'default', value: 'Done' }],
                },
              },
            },
          },
        },
      },
    }
    const mockCreatedBlockResponse = {
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              type: 'page',
              properties: { title: [['Task row']] },
            },
          },
        },
      },
    }
    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'saveTransactions') {
        return Promise.resolve({})
      }
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string } }>
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }
        return Promise.resolve(mockCreatedBlockResponse)
      }
      return Promise.resolve({})
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        [
          'add-row',
          'coll-1',
          '--workspace-id',
          'space-123',
          '--title',
          'Task row',
          '--properties',
          '{"Status":"Done"}',
        ],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then
    const saveCall = mockInternalRequest.mock.calls.find((call) => (call as unknown[])[1] === 'saveTransactions') as
      | [string, string, { transactions: Array<{ operations: Array<Record<string, unknown>> }> }]
      | undefined
    expect(saveCall).toBeDefined()
    if (!saveCall) {
      throw new Error('Expected saveTransactions call')
    }

    const operations = saveCall[2].transactions[0].operations
    const schemaOperations = operations.filter(
      (op) => Array.isArray(op.path) && op.path[0] === 'schema' && op.path[1] === 'prop1',
    )
    expect(schemaOperations.length).toBe(0)
    expect(output.length).toBeGreaterThan(0)
  })

  test('add-row with select property where schema has no options array', async () => {
    mock.restore()
    // Given
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              parent_id: 'block-1',
              schema: {
                title: { name: 'Name', type: 'title' },
                prop1: {
                  name: 'Section',
                  type: 'select',
                },
              },
            },
          },
        },
      },
    }
    const mockCreatedBlockResponse = {
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              type: 'page',
              properties: { title: [['Task row']] },
            },
          },
        },
      },
    }
    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'saveTransactions') {
        return Promise.resolve({})
      }
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string } }>
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }
        return Promise.resolve(mockCreatedBlockResponse)
      }
      return Promise.resolve({})
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        [
          'add-row',
          'coll-1',
          '--workspace-id',
          'space-123',
          '--title',
          'Task row',
          '--properties',
          '{"Section":"North"}',
        ],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then
    const saveCall = mockInternalRequest.mock.calls.find((call) => (call as unknown[])[1] === 'saveTransactions') as
      | [string, string, { transactions: Array<{ operations: Array<Record<string, unknown>> }> }]
      | undefined
    expect(saveCall).toBeDefined()
    if (!saveCall) {
      throw new Error('Expected saveTransactions call')
    }

    const operations = saveCall[2].transactions[0].operations
    const schemaUpdate = operations.find(
      (op) => Array.isArray(op.path) && op.path[0] === 'schema' && op.path[1] === 'prop1',
    )
    expect(schemaUpdate).toBeDefined()

    const schemaArgs = schemaUpdate?.args as { options?: Array<{ value?: string; color?: string }> }
    expect(schemaArgs.options?.map((option) => option.value)).toEqual(['North'])
    expect(schemaArgs.options?.[0]?.color).toBe('default')
    expect(output.length).toBeGreaterThan(0)
  })
})

describe('database update-row', () => {
  test('update-row calls saveTransactions with per-property set operations', async () => {
    mock.restore()
    // Given
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                title: { name: 'Name', type: 'title' },
                prop1: { name: 'Status', type: 'select', options: [] },
              },
            },
          },
        },
      },
    }
    const mockRowResponse = {
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              type: 'page',
              parent_table: 'collection',
              parent_id: 'coll-1',
              space_id: 'space-1',
            },
          },
        },
      },
    }
    const mockUpdatedRowResponse = {
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              type: 'page',
              properties: {
                prop1: [['Active']],
              },
            },
          },
        },
      },
    }

    let blockFetchCount = 0
    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'saveTransactions') {
        return Promise.resolve({})
      }
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string; id: string } }>
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }

        blockFetchCount += 1
        return Promise.resolve(blockFetchCount === 1 ? mockRowResponse : mockUpdatedRowResponse)
      }
      return Promise.resolve({})
    })

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mock(() => Promise.resolve({ token_v2: 'test-token' })),
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-1'),
      resolveCollectionViewId: mock(async () => 'view-123'),
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        ['update-row', 'row-1', '--workspace-id', 'space-1', '--properties', '{"Status":"Active"}'],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then
    const saveCall = mockInternalRequest.mock.calls.find((call) => (call as unknown[])[1] === 'saveTransactions') as
      | [string, string, { transactions: Array<{ operations: Array<Record<string, unknown>> }> }]
      | undefined
    expect(saveCall).toBeDefined()
    if (!saveCall) {
      throw new Error('Expected saveTransactions call')
    }

    const operations = saveCall[2].transactions[0].operations
    expect(operations[0]).toMatchObject({
      command: 'update',
      path: ['schema', 'prop1'],
    })
    expect(operations[1]).toMatchObject({
      pointer: { table: 'block', id: 'row-1', spaceId: 'space-1' },
      command: 'set',
      path: ['properties', 'prop1'],
      args: [['Active']],
    })
    expect(output.length).toBeGreaterThan(0)
  })

  test('update-row with relation property uses decorator format', async () => {
    mock.restore()
    // Given
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                title: { name: 'Name', type: 'title' },
                rel1: { name: 'Related', type: 'relation' },
              },
            },
          },
        },
      },
    }
    const mockRowResponse = {
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              type: 'page',
              parent_table: 'collection',
              parent_id: 'coll-1',
              space_id: 'space-1',
            },
          },
        },
      },
    }

    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'saveTransactions') {
        return Promise.resolve({})
      }
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string } }>
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }
        return Promise.resolve(mockRowResponse)
      }
      return Promise.resolve({})
    })

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mock(() => Promise.resolve({ token_v2: 'test-token' })),
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-1'),
      resolveCollectionViewId: mock(async () => 'view-123'),
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        ['update-row', 'row-1', '--workspace-id', 'space-1', '--properties', '{"Related":["page-abc"]}'],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then
    const saveCall = mockInternalRequest.mock.calls.find((call) => (call as unknown[])[1] === 'saveTransactions') as
      | [string, string, { transactions: Array<{ operations: Array<Record<string, unknown>> }> }]
      | undefined
    expect(saveCall).toBeDefined()
    if (!saveCall) {
      throw new Error('Expected saveTransactions call')
    }

    const operations = saveCall[2].transactions[0].operations
    const relationSet = operations.find(
      (op) => Array.isArray(op.path) && op.path[0] === 'properties' && op.path[1] === 'rel1',
    )
    expect(relationSet).toMatchObject({
      command: 'set',
      args: [['‣', [['p', 'page-abc']]]],
    })
    expect(output.length).toBeGreaterThan(0)
  })

  test('update-row with select new option registers schema update before property set', async () => {
    mock.restore()
    // Given
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                title: { name: 'Name', type: 'title' },
                prop1: { name: 'Status', type: 'select', options: [] },
              },
            },
          },
        },
      },
    }
    const mockRowResponse = {
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              type: 'page',
              parent_table: 'collection',
              parent_id: 'coll-1',
              space_id: 'space-1',
            },
          },
        },
      },
    }

    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'saveTransactions') {
        return Promise.resolve({})
      }
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string } }>
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }
        return Promise.resolve(mockRowResponse)
      }
      return Promise.resolve({})
    })

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mock(() => Promise.resolve({ token_v2: 'test-token' })),
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-1'),
      resolveCollectionViewId: mock(async () => 'view-123'),
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        ['update-row', 'row-1', '--workspace-id', 'space-1', '--properties', '{"Status":"In Progress"}'],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then
    const saveCall = mockInternalRequest.mock.calls.find((call) => (call as unknown[])[1] === 'saveTransactions') as
      | [string, string, { transactions: Array<{ operations: Array<Record<string, unknown>> }> }]
      | undefined
    expect(saveCall).toBeDefined()
    if (!saveCall) {
      throw new Error('Expected saveTransactions call')
    }

    const operations = saveCall[2].transactions[0].operations
    const schemaIndex = operations.findIndex(
      (op) => Array.isArray(op.path) && op.command === 'update' && op.path[0] === 'schema',
    )
    const setIndex = operations.findIndex(
      (op) => Array.isArray(op.path) && op.command === 'set' && op.path[0] === 'properties' && op.path[1] === 'prop1',
    )
    expect(schemaIndex).toBeGreaterThanOrEqual(0)
    expect(setIndex).toBeGreaterThanOrEqual(0)
    expect(schemaIndex).toBeLessThan(setIndex)
    expect(output.length).toBeGreaterThan(0)
  })

  test('update-row with multiple property types serializes all correctly', async () => {
    mock.restore()
    // Given
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                title: { name: 'Name', type: 'title' },
                text1: { name: 'Notes', type: 'text' },
                num1: { name: 'Count', type: 'number' },
                check1: { name: 'Done', type: 'checkbox' },
              },
            },
          },
        },
      },
    }
    const mockRowResponse = {
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              type: 'page',
              parent_table: 'collection',
              parent_id: 'coll-1',
              space_id: 'space-1',
            },
          },
        },
      },
    }

    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'saveTransactions') {
        return Promise.resolve({})
      }
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string } }>
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }
        return Promise.resolve(mockRowResponse)
      }
      return Promise.resolve({})
    })

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mock(() => Promise.resolve({ token_v2: 'test-token' })),
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-1'),
      resolveCollectionViewId: mock(async () => 'view-123'),
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        [
          'update-row',
          'row-1',
          '--workspace-id',
          'space-1',
          '--properties',
          '{"Notes":"hello","Count":42,"Done":true}',
        ],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then
    const saveCall = mockInternalRequest.mock.calls.find((call) => (call as unknown[])[1] === 'saveTransactions') as
      | [string, string, { transactions: Array<{ operations: Array<Record<string, unknown>> }> }]
      | undefined
    expect(saveCall).toBeDefined()
    if (!saveCall) {
      throw new Error('Expected saveTransactions call')
    }

    const operations = saveCall[2].transactions[0].operations
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['properties', 'text1'], args: [['hello']] }),
        expect.objectContaining({ path: ['properties', 'num1'], args: [['42']] }),
        expect.objectContaining({ path: ['properties', 'check1'], args: [['Yes']] }),
      ]),
    )
    expect(output.length).toBeGreaterThan(0)
  })

  test('update-row throws on unknown property name', async () => {
    mock.restore()
    // Given
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                title: { name: 'Name', type: 'title' },
              },
            },
          },
        },
      },
    }
    const mockRowResponse = {
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              type: 'page',
              parent_table: 'collection',
              parent_id: 'coll-1',
              space_id: 'space-1',
            },
          },
        },
      },
    }

    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string } }>
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }
        return Promise.resolve(mockRowResponse)
      }
      return Promise.resolve({})
    })
    const mockExit = mock(() => {
      throw new Error('process.exit called')
    })

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mock(() => Promise.resolve({ token_v2: 'test-token' })),
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-1'),
      resolveCollectionViewId: mock(async () => 'view-123'),
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const originalExit = process.exit
    process.exit = mockExit as any

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const errors: string[] = []
    const originalLog = console.log
    const originalError = console.error
    console.log = (msg: string) => output.push(msg)
    console.error = (msg: string) => errors.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        ['update-row', 'row-1', '--workspace-id', 'space-1', '--properties', '{"NonExistent":"value"}'],
        { from: 'user' },
      )
    } catch {
      // expected
    } finally {
      console.log = originalLog
      console.error = originalError
      process.exit = originalExit
    }

    // Then
    expect(output).toEqual([])
    expect(errors.length).toBeGreaterThan(0)
    const parsedError = JSON.parse(errors[0]) as { error: string }
    expect(parsedError.error).toContain('Unknown property: "NonExistent"')
    expect(parsedError.error).toContain('Available: Name')
  })

  test('update-row throws when block is not a database row', async () => {
    mock.restore()
    // Given
    const mockRowResponse = {
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              type: 'page',
              parent_table: 'block',
              parent_id: 'block-1',
              space_id: 'space-1',
            },
          },
        },
      },
    }

    const mockInternalRequest = mock((_token: string, endpoint: string) => {
      if (endpoint === 'syncRecordValues') {
        return Promise.resolve(mockRowResponse)
      }
      return Promise.resolve({})
    })
    const mockExit = mock(() => {
      throw new Error('process.exit called')
    })

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mock(() => Promise.resolve({ token_v2: 'test-token' })),
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-1'),
      resolveCollectionViewId: mock(async () => 'view-123'),
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const originalExit = process.exit
    process.exit = mockExit as any

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const errors: string[] = []
    const originalLog = console.log
    const originalError = console.error
    console.log = (msg: string) => output.push(msg)
    console.error = (msg: string) => errors.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        ['update-row', 'row-1', '--workspace-id', 'space-1', '--properties', '{"Name":"Task"}'],
        { from: 'user' },
      )
    } catch {
      // expected
    } finally {
      console.log = originalLog
      console.error = originalError
      process.exit = originalExit
    }

    // Then
    expect(output).toEqual([])
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('is not a database row')
  })

  test('update-row throws when properties is empty object', async () => {
    mock.restore()
    // Given
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                title: { name: 'Name', type: 'title' },
              },
            },
          },
        },
      },
    }
    const mockRowResponse = {
      recordMap: {
        block: {
          'row-1': {
            value: {
              id: 'row-1',
              type: 'page',
              parent_table: 'collection',
              parent_id: 'coll-1',
              space_id: 'space-1',
            },
          },
        },
      },
    }

    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string } }>
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }
        return Promise.resolve(mockRowResponse)
      }
      return Promise.resolve({})
    })
    const mockExit = mock(() => {
      throw new Error('process.exit called')
    })

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mock(() => Promise.resolve({ token_v2: 'test-token' })),
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-1'),
      resolveCollectionViewId: mock(async () => 'view-123'),
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const originalExit = process.exit
    process.exit = mockExit as any

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const errors: string[] = []
    const originalLog = console.log
    const originalError = console.error
    console.log = (msg: string) => output.push(msg)
    console.error = (msg: string) => errors.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['update-row', 'row-1', '--workspace-id', 'space-1', '--properties', '{}'], {
        from: 'user',
      })
    } catch {
      // expected
    } finally {
      console.log = originalLog
      console.error = originalError
      process.exit = originalExit
    }

    // Then
    expect(output).toEqual([])
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('No properties to update')
  })
})

describe('database delete-property', () => {
  test('removes property key from schema', async () => {
    mock.restore()
    // Given
    const mockGetResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              name: [['Test DB']],
              schema: {
                title: { name: 'Name', type: 'title' },
                prop1: { name: 'Status', type: 'select' },
                prop2: { name: 'Priority', type: 'select' },
              },
              parent_id: 'block-1',
              alive: true,
              space_id: 'space-123',
            },
          },
        },
      },
    }
    const mockUpdatedResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              name: [['Test DB']],
              schema: {
                title: { name: 'Name', type: 'title' },
                prop2: { name: 'Priority', type: 'select' },
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
      if (callCount === 1) return Promise.resolve(mockGetResponse)
      if (callCount === 2) return Promise.resolve({})
      return Promise.resolve(mockUpdatedResponse)
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        ['delete-property', 'coll-1', '--workspace-id', 'space-123', '--property', 'Status'],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then — saveTransactions renames and soft-deletes the property to avoid name collisions
    const saveCall = mockInternalRequest.mock.calls.find(
      (call) => (call as unknown[])[1] === 'saveTransactions',
    ) as unknown as [string, string, Record<string, unknown>] | undefined
    expect(saveCall).toBeDefined()
    const operation = (saveCall?.[2] as any).transactions[0].operations[0]
    expect(operation.command).toBe('update')
    expect(operation.path).toEqual(['schema', 'prop1'])
    expect(operation.args.alive).toBe(false)
    expect(operation.args.name).toMatch(/^__deleted_prop1_\d+$/)

    // Output should exclude the deleted property
    const parsed = JSON.parse(output[0])
    expect(parsed.schema).toEqual({ Name: { type: 'title' }, Priority: { type: 'select' } })
  })

  test('errors when property name not found', async () => {
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const originalExit = process.exit
    process.exit = mockExit as any

    const { databaseCommand } = await import('./database')

    const errors: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errors.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        ['delete-property', 'coll-1', '--workspace-id', 'space-123', '--property', 'NonExistent'],
        { from: 'user' },
      )
    } catch {
      // expected
    } finally {
      console.error = originalError
      process.exit = originalExit
    }

    // Then
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('Unknown property')
    expect(errors[0]).toContain('NonExistent')
  })

  test('errors when trying to delete title property', async () => {
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const originalExit = process.exit
    process.exit = mockExit as any

    const { databaseCommand } = await import('./database')

    const errors: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errors.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        ['delete-property', 'coll-1', '--workspace-id', 'space-123', '--property', 'Name'],
        { from: 'user' },
      )
    } catch {
      // expected
    } finally {
      console.error = originalError
      process.exit = originalExit
    }

    // Then
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('Cannot delete the title property')
  })
})

describe('database view-update', () => {
  test('reorders columns to match specified order', async () => {
    mock.restore()
    // Given
    const mockViewResponse = {
      recordMap: {
        collection_view: {
          'view-1': {
            value: {
              id: 'view-1',
              type: 'table',
              name: 'Default view',
              format: {
                collection_pointer: { id: 'coll-1', spaceId: 'space-123' },
                table_properties: [
                  { property: 'title', visible: true },
                  { property: 'prop1', visible: true },
                  { property: 'prop2', visible: false },
                ],
              },
              parent_id: 'block-1',
            },
          },
        },
      },
    }
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                title: { name: 'Name', type: 'title' },
                prop1: { name: 'Status', type: 'select' },
                prop2: { name: 'Priority', type: 'select' },
              },
            },
          },
        },
      },
    }

    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'saveTransactions') return Promise.resolve({})
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string } }>
        if (requests[0]?.pointer.table === 'collection_view') {
          return Promise.resolve(mockViewResponse)
        }
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }
      }
      return Promise.resolve({})
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        ['view-update', 'view-1', '--workspace-id', 'space-123', '--reorder', 'Status,Name'],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then
    const saveCall = mockInternalRequest.mock.calls.find(
      (call) => (call as unknown[])[1] === 'saveTransactions',
    ) as unknown as [string, string, Record<string, unknown>] | undefined
    expect(saveCall).toBeDefined()
    const operations = (saveCall?.[2] as any).transactions[0].operations
    const newProps = operations[0].args
    expect(newProps.map((prop: { property: string }) => prop.property)).toEqual(['prop1', 'title', 'prop2'])
    expect(output.length).toBeGreaterThan(0)
  })

  test('appends unmentioned properties preserving their relative order', async () => {
    mock.restore()
    // Given
    const mockViewResponse = {
      recordMap: {
        collection_view: {
          'view-1': {
            value: {
              id: 'view-1',
              type: 'table',
              name: 'Default view',
              format: {
                collection_pointer: { id: 'coll-1', spaceId: 'space-123' },
                table_properties: [
                  { property: 'a', visible: true },
                  { property: 'b', visible: true },
                  { property: 'c', visible: true },
                  { property: 'd', visible: false },
                ],
              },
              parent_id: 'block-1',
            },
          },
        },
      },
    }
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                a: { name: 'A', type: 'text' },
                b: { name: 'B', type: 'text' },
                c: { name: 'C', type: 'text' },
                d: { name: 'D', type: 'text' },
              },
            },
          },
        },
      },
    }

    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'saveTransactions') return Promise.resolve({})
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string } }>
        if (requests[0]?.pointer.table === 'collection_view') {
          return Promise.resolve(mockViewResponse)
        }
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }
      }
      return Promise.resolve({})
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(['view-update', 'view-1', '--workspace-id', 'space-123', '--reorder', 'C,A'], {
        from: 'user',
      })
    } finally {
      console.log = originalLog
    }

    // Then
    const saveCall = mockInternalRequest.mock.calls.find(
      (call) => (call as unknown[])[1] === 'saveTransactions',
    ) as unknown as [string, string, Record<string, unknown>] | undefined
    expect(saveCall).toBeDefined()
    const operations = (saveCall?.[2] as any).transactions[0].operations
    const newProps = operations[0].args
    expect(newProps.map((prop: { property: string }) => prop.property)).toEqual(['c', 'a', 'b', 'd'])
    expect(output.length).toBeGreaterThan(0)
  })

  test('reorder combined with show/hide', async () => {
    mock.restore()
    // Given
    const mockViewResponse = {
      recordMap: {
        collection_view: {
          'view-1': {
            value: {
              id: 'view-1',
              type: 'table',
              name: 'Default view',
              format: {
                collection_pointer: { id: 'coll-1', spaceId: 'space-123' },
                table_properties: [
                  { property: 'title', visible: true },
                  { property: 'prop1', visible: false },
                  { property: 'prop2', visible: true },
                ],
              },
              parent_id: 'block-1',
            },
          },
        },
      },
    }
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                title: { name: 'Name', type: 'title' },
                prop1: { name: 'Status', type: 'select' },
                prop2: { name: 'Priority', type: 'select' },
              },
            },
          },
        },
      },
    }

    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'saveTransactions') return Promise.resolve({})
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string } }>
        if (requests[0]?.pointer.table === 'collection_view') {
          return Promise.resolve(mockViewResponse)
        }
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }
      }
      return Promise.resolve({})
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        ['view-update', 'view-1', '--workspace-id', 'space-123', '--show', 'Status', '--reorder', 'Status,Name'],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then
    const saveCall = mockInternalRequest.mock.calls.find(
      (call) => (call as unknown[])[1] === 'saveTransactions',
    ) as unknown as [string, string, Record<string, unknown>] | undefined
    expect(saveCall).toBeDefined()
    const operations = (saveCall?.[2] as any).transactions[0].operations
    const newProps = operations[0].args
    expect(newProps.map((prop: { property: string }) => prop.property)).toEqual(['prop1', 'title', 'prop2'])
    expect(newProps.find((prop: { property: string; visible: boolean }) => prop.property === 'prop1')?.visible).toBe(
      true,
    )
    expect(output.length).toBeGreaterThan(0)
  })

  test('errors on unknown property name in reorder', async () => {
    mock.restore()
    // Given
    const mockViewResponse = {
      recordMap: {
        collection_view: {
          'view-1': {
            value: {
              id: 'view-1',
              type: 'table',
              name: 'Default view',
              format: {
                collection_pointer: { id: 'coll-1', spaceId: 'space-123' },
                table_properties: [
                  { property: 'title', visible: true },
                  { property: 'prop1', visible: true },
                ],
              },
              parent_id: 'block-1',
            },
          },
        },
      },
    }
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                title: { name: 'Name', type: 'title' },
                prop1: { name: 'Status', type: 'select' },
              },
            },
          },
        },
      },
    }

    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string } }>
        if (requests[0]?.pointer.table === 'collection_view') {
          return Promise.resolve(mockViewResponse)
        }
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }
      }
      return Promise.resolve({})
    })
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const originalExit = process.exit
    process.exit = mockExit as any

    const { databaseCommand } = await import('./database')

    const errors: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errors.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        ['view-update', 'view-1', '--workspace-id', 'space-123', '--reorder', 'NonExistent'],
        { from: 'user' },
      )
    } catch {
      // expected
    } finally {
      console.error = originalError
      process.exit = originalExit
    }

    // Then
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('Unknown property')
    expect(errors[0]).toContain('NonExistent')
  })

  test('reorder-only works without show or hide', async () => {
    mock.restore()
    // Given
    const mockViewResponse = {
      recordMap: {
        collection_view: {
          'view-1': {
            value: {
              id: 'view-1',
              type: 'table',
              name: 'Default view',
              format: {
                collection_pointer: { id: 'coll-1', spaceId: 'space-123' },
                table_properties: [
                  { property: 'title', visible: true },
                  { property: 'prop1', visible: true },
                  { property: 'prop2', visible: false },
                ],
              },
              parent_id: 'block-1',
            },
          },
        },
      },
    }
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                title: { name: 'Name', type: 'title' },
                prop1: { name: 'Status', type: 'select' },
                prop2: { name: 'Priority', type: 'select' },
              },
            },
          },
        },
      },
    }

    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'saveTransactions') return Promise.resolve({})
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string } }>
        if (requests[0]?.pointer.table === 'collection_view') {
          return Promise.resolve(mockViewResponse)
        }
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }
      }
      return Promise.resolve({})
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        ['view-update', 'view-1', '--workspace-id', 'space-123', '--reorder', 'Name,Status'],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then
    const saveCall = mockInternalRequest.mock.calls.find(
      (call) => (call as unknown[])[1] === 'saveTransactions',
    ) as unknown as [string, string, Record<string, unknown>] | undefined
    expect(saveCall).toBeDefined()
    const operations = (saveCall?.[2] as any).transactions[0].operations
    const newProps = operations[0].args
    expect(newProps.map((prop: { property: string }) => prop.property)).toEqual(['title', 'prop1', 'prop2'])
    expect(output.length).toBeGreaterThan(0)
  })

  test('resize sets column widths via --resize JSON', async () => {
    mock.restore()
    // Given
    const mockViewResponse = {
      recordMap: {
        collection_view: {
          'view-1': {
            value: {
              id: 'view-1',
              type: 'table',
              name: 'Default view',
              format: {
                collection_pointer: { id: 'coll-1', spaceId: 'space-123' },
                table_properties: [
                  { property: 'title', visible: true },
                  { property: 'prop1', visible: true },
                  { property: 'prop2', visible: false },
                ],
              },
              parent_id: 'block-1',
            },
          },
        },
      },
    }
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                title: { name: 'Name', type: 'title' },
                prop1: { name: 'Status', type: 'select' },
                prop2: { name: 'Priority', type: 'select' },
              },
            },
          },
        },
      },
    }

    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'saveTransactions') return Promise.resolve({})
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string } }>
        if (requests[0]?.pointer.table === 'collection_view') {
          return Promise.resolve(mockViewResponse)
        }
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }
      }
      return Promise.resolve({})
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        ['view-update', 'view-1', '--workspace-id', 'space-123', '--resize', '{"Name":200,"Status":150}'],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then
    const saveCall = mockInternalRequest.mock.calls.find(
      (call) => (call as unknown[])[1] === 'saveTransactions',
    ) as unknown as [string, string, Record<string, unknown>] | undefined
    expect(saveCall).toBeDefined()
    const operations = (saveCall?.[2] as any).transactions[0].operations
    const newProps = operations[0].args as Array<{ property: string; width?: number }>
    const nameEntry = newProps.find((p) => p.property === 'title')
    const statusEntry = newProps.find((p) => p.property === 'prop1')
    const priorityEntry = newProps.find((p) => p.property === 'prop2')
    expect(nameEntry?.width).toBe(200)
    expect(statusEntry?.width).toBe(150)
    expect(priorityEntry?.width).toBeUndefined()
    expect(output.length).toBeGreaterThan(0)
  })

  test('resize errors on unknown property name', async () => {
    mock.restore()
    // Given
    const mockViewResponse = {
      recordMap: {
        collection_view: {
          'view-1': {
            value: {
              id: 'view-1',
              type: 'table',
              name: 'Default view',
              format: {
                collection_pointer: { id: 'coll-1', spaceId: 'space-123' },
                table_properties: [{ property: 'title', visible: true }],
              },
              parent_id: 'block-1',
            },
          },
        },
      },
    }
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                title: { name: 'Name', type: 'title' },
              },
            },
          },
        },
      },
    }

    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string } }>
        if (requests[0]?.pointer.table === 'collection_view') {
          return Promise.resolve(mockViewResponse)
        }
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }
      }
      return Promise.resolve({})
    })
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const originalExit = process.exit
    process.exit = mockExit as any

    const { databaseCommand } = await import('./database')

    const errors: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errors.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        ['view-update', 'view-1', '--workspace-id', 'space-123', '--resize', '{"NonExistent":200}'],
        { from: 'user' },
      )
    } catch {
      // expected
    } finally {
      console.error = originalError
      process.exit = originalExit
    }

    // Then
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('Unknown property')
    expect(errors[0]).toContain('NonExistent')
  })

  test('resize combined with reorder and show', async () => {
    mock.restore()
    // Given
    const mockViewResponse = {
      recordMap: {
        collection_view: {
          'view-1': {
            value: {
              id: 'view-1',
              type: 'table',
              name: 'Default view',
              format: {
                collection_pointer: { id: 'coll-1', spaceId: 'space-123' },
                table_properties: [
                  { property: 'title', visible: true },
                  { property: 'prop1', visible: false },
                  { property: 'prop2', visible: true },
                ],
              },
              parent_id: 'block-1',
            },
          },
        },
      },
    }
    const mockCollectionResponse = {
      recordMap: {
        collection: {
          'coll-1': {
            value: {
              id: 'coll-1',
              schema: {
                title: { name: 'Name', type: 'title' },
                prop1: { name: 'Status', type: 'select' },
                prop2: { name: 'Priority', type: 'select' },
              },
            },
          },
        },
      },
    }

    const mockInternalRequest = mock((_token: string, endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === 'saveTransactions') return Promise.resolve({})
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string } }>
        if (requests[0]?.pointer.table === 'collection_view') {
          return Promise.resolve(mockViewResponse)
        }
        if (requests[0]?.pointer.table === 'collection') {
          return Promise.resolve(mockCollectionResponse)
        }
      }
      return Promise.resolve({})
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
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { databaseCommand } = await import('./database')

    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      // When
      await databaseCommand.parseAsync(
        [
          'view-update',
          'view-1',
          '--workspace-id',
          'space-123',
          '--show',
          'Status',
          '--reorder',
          'Status,Name',
          '--resize',
          '{"Status":250}',
        ],
        { from: 'user' },
      )
    } finally {
      console.log = originalLog
    }

    // Then
    const saveCall = mockInternalRequest.mock.calls.find(
      (call) => (call as unknown[])[1] === 'saveTransactions',
    ) as unknown as [string, string, Record<string, unknown>] | undefined
    expect(saveCall).toBeDefined()
    const operations = (saveCall?.[2] as any).transactions[0].operations
    const newProps = operations[0].args as Array<{ property: string; visible: boolean; width?: number }>
    expect(newProps.map((p) => p.property)).toEqual(['prop1', 'title', 'prop2'])
    expect(newProps.find((p) => p.property === 'prop1')?.visible).toBe(true)
    expect(newProps.find((p) => p.property === 'prop1')?.width).toBe(250)
    expect(output.length).toBeGreaterThan(0)
  })
})
