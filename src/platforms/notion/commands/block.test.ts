import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

describe('blockCommand', () => {
  beforeEach(() => {
    mock.restore()
  })

  afterEach(() => {
    mock.restore()
  })

  describe('block get', () => {
    test('retrieves and outputs block value', async () => {
      // Given
      const mockInternalRequest = mock((_token: string, endpoint: string) => {
        if (endpoint === 'syncRecordValues') {
          return Promise.resolve({
            recordMap: {
              block: {
                'block-123': {
                  value: {
                    id: 'block-123',
                    type: 'text',
                    version: 1,
                    parent_id: 'parent-1',
                    space_id: 'space-1',
                    alive: true,
                  },
                  role: 'editor',
                },
              },
            },
          })
        }
        return Promise.resolve({})
      })
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => 'mock-uuid')

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['get', 'block-123'], { from: 'user' })
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result.id).toBe('block-123')
      expect(result.type).toBe('text')
    })

    test('errors when block not found', async () => {
      // Given
      const mockInternalRequest = mock((_token: string, endpoint: string) => {
        if (endpoint === 'syncRecordValues') {
          return Promise.resolve({
            recordMap: {
              block: {},
            },
          })
        }
        return Promise.resolve({})
      })
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => 'mock-uuid')

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
      }))

      const { blockCommand } = await import('./block')
      const errors: string[] = []
      const originalError = console.error
      console.error = (msg: string) => errors.push(msg)

      const mockExit = mock(() => {
        throw new Error('process.exit called')
      })
      const originalExit = process.exit
      process.exit = mockExit as any

      try {
        // When
        await blockCommand.parseAsync(['get', 'block-123'], { from: 'user' })
      } catch {
        // Expected
      }

      console.error = originalError
      process.exit = originalExit

      // Then
      expect(errors.length).toBeGreaterThan(0)
      const errorMsg = JSON.parse(errors[0])
      expect(errorMsg.error).toContain('Block not found')
    })
  })

  describe('block children', () => {
    test('loads and returns child blocks', async () => {
      // Given
      const mockInternalRequest = mock((_token: string, endpoint: string) => {
        if (endpoint === 'loadPageChunk') {
          return Promise.resolve({
            cursor: {
              stack: [],
            },
            recordMap: {
              block: {
                'parent-1': {
                  value: {
                    id: 'parent-1',
                    type: 'page',
                    content: ['child-1', 'child-2'],
                  },
                  role: 'editor',
                },
                'child-1': {
                  value: {
                    id: 'child-1',
                    type: 'text',
                    parent_id: 'parent-1',
                  },
                  role: 'editor',
                },
                'child-2': {
                  value: {
                    id: 'child-2',
                    type: 'heading',
                    parent_id: 'parent-1',
                  },
                  role: 'editor',
                },
              },
            },
          })
        }
        return Promise.resolve({})
      })
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => 'mock-uuid')

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['children', 'parent-1'], { from: 'user' })
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result.results).toBeDefined()
      expect(result.results.length).toBe(2)
      expect(result.results[0].id).toBe('child-1')
      expect(result.results[1].id).toBe('child-2')
      expect(result.has_more).toBe(false)
    })

    test('respects limit option', async () => {
      // Given
      const mockInternalRequest = mock((_token: string, endpoint: string, body: any) => {
        if (endpoint === 'loadPageChunk') {
          expect(body.limit).toBe(50)
        }
        return Promise.resolve({
          cursor: { stack: [] },
          recordMap: {
            block: {
              'parent-1': {
                value: {
                  id: 'parent-1',
                  type: 'page',
                  content: [],
                },
                role: 'editor',
              },
            },
          },
        })
      })
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => 'mock-uuid')

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['children', 'parent-1', '--limit', '50'], {
          from: 'user',
        })
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
    })
  })

  describe('block append', () => {
    test('parses block definitions and creates blocks', async () => {
      // Given
      const mockInternalRequest = mock(() => Promise.resolve({}))
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => 'new-block-id')

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(
          ['append', 'parent-1', '--content', JSON.stringify([{ type: 'text', properties: { title: [['Hello']] } }])],
          { from: 'user' },
        )
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result.created).toBeDefined()
      expect(result.created.length).toBe(1)
      expect(result.created[0]).toBe('new-block-id')
    })

    test('calls saveTransactions with set and listAfter operations', async () => {
      // Given
      const mockInternalRequest = mock(() => Promise.resolve({}))
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => 'new-block-id')

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['append', 'parent-1', '--content', JSON.stringify([{ type: 'text' }])], {
          from: 'user',
        })
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      expect(mockInternalRequest).toHaveBeenCalledWith(
        'test-token',
        'saveTransactions',
        expect.objectContaining({
          requestId: 'new-block-id',
          transactions: expect.arrayContaining([
            expect.objectContaining({
              operations: expect.arrayContaining([
                expect.objectContaining({
                  command: 'set',
                  pointer: expect.objectContaining({
                    id: 'new-block-id',
                  }),
                }),
                expect.objectContaining({
                  command: 'listAfter',
                  path: ['content'],
                }),
              ]),
            }),
          ]),
        }),
      )
    })

    test('errors on invalid JSON content', async () => {
      // Given
      const mockInternalRequest = mock(() => Promise.resolve({}))
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => 'mock-uuid')

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
      }))

      const { blockCommand } = await import('./block')
      const errors: string[] = []
      const originalError = console.error
      console.error = (msg: string) => errors.push(msg)

      const mockExit = mock(() => {
        throw new Error('process.exit called')
      })
      const originalExit = process.exit
      process.exit = mockExit as any

      try {
        // When
        await blockCommand.parseAsync(['append', 'parent-1', '--content', 'not valid json'], {
          from: 'user',
        })
      } catch {
        // Expected
      }

      console.error = originalError
      process.exit = originalExit

      // Then
      expect(errors.length).toBeGreaterThan(0)
      const errorMsg = JSON.parse(errors[0])
      expect(errorMsg.error).toBeDefined()
    })

    test('errors when block definition missing type', async () => {
      // Given
      const mockInternalRequest = mock(() => Promise.resolve({}))
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => 'mock-uuid')

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
      }))

      const { blockCommand } = await import('./block')
      const errors: string[] = []
      const originalError = console.error
      console.error = (msg: string) => errors.push(msg)

      const mockExit = mock(() => {
        throw new Error('process.exit called')
      })
      const originalExit = process.exit
      process.exit = mockExit as any

      try {
        // When
        await blockCommand.parseAsync(['append', 'parent-1', '--content', JSON.stringify([{ properties: {} }])], {
          from: 'user',
        })
      } catch {
        // Expected
      }

      console.error = originalError
      process.exit = originalExit

      // Then
      expect(errors.length).toBeGreaterThan(0)
      const errorMsg = JSON.parse(errors[0])
      expect(errorMsg.error).toContain('type')
    })
  })

  describe('block update', () => {
    test('parses content and updates block', async () => {
      // Given
      const mockInternalRequest = mock((_token: string, endpoint: string) => {
        if (endpoint === 'syncRecordValues') {
          return Promise.resolve({
            recordMap: {
              block: {
                'block-123': {
                  value: {
                    id: 'block-123',
                    type: 'text',
                    version: 2,
                    parent_id: 'parent-1',
                    space_id: 'space-1',
                    alive: true,
                    properties: { title: [['Updated']] },
                  },
                  role: 'editor',
                },
              },
            },
          })
        }
        return Promise.resolve({})
      })
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => 'mock-uuid')

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(
          ['update', 'block-123', '--content', JSON.stringify({ properties: { title: [['Updated']] } })],
          { from: 'user' },
        )
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result.id).toBe('block-123')
      expect(result.properties.title).toEqual([['Updated']])
    })

    test('calls saveTransactions then syncRecordValues to verify', async () => {
      // Given
      const mockInternalRequest = mock((_token: string, endpoint: string) => {
        if (endpoint === 'syncRecordValues') {
          return Promise.resolve({
            recordMap: {
              block: {
                'block-123': {
                  value: {
                    id: 'block-123',
                    type: 'text',
                    version: 2,
                  },
                  role: 'editor',
                },
              },
            },
          })
        }
        return Promise.resolve({})
      })
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => 'mock-uuid')

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['update', 'block-123', '--content', JSON.stringify({ version: 2 })], {
          from: 'user',
        })
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      const calls = mockInternalRequest.mock.calls
      const saveTransactionCall = calls.find((call) => call[1] === 'saveTransactions')
      const syncCall = calls.find((call) => call[1] === 'syncRecordValues')
      expect(saveTransactionCall).toBeDefined()
      expect(syncCall).toBeDefined()
    })

    test('errors on non-object content', async () => {
      // Given
      const mockInternalRequest = mock(() => Promise.resolve({}))
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => 'mock-uuid')

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
      }))

      const { blockCommand } = await import('./block')
      const errors: string[] = []
      const originalError = console.error
      console.error = (msg: string) => errors.push(msg)

      const mockExit = mock(() => {
        throw new Error('process.exit called')
      })
      const originalExit = process.exit
      process.exit = mockExit as any

      try {
        // When
        await blockCommand.parseAsync(['update', 'block-123', '--content', JSON.stringify(['array'])], { from: 'user' })
      } catch {
        // Expected
      }

      console.error = originalError
      process.exit = originalExit

      // Then
      expect(errors.length).toBeGreaterThan(0)
      const errorMsg = JSON.parse(errors[0])
      expect(errorMsg.error).toContain('JSON object')
    })
  })

  describe('block delete', () => {
    test('fetches block, gets parent_id, and calls saveTransactions', async () => {
      // Given
      const mockInternalRequest = mock((_token: string, endpoint: string) => {
        if (endpoint === 'syncRecordValues') {
          return Promise.resolve({
            recordMap: {
              block: {
                'block-123': {
                  value: {
                    id: 'block-123',
                    type: 'text',
                    parent_id: 'parent-1',
                    space_id: 'space-1',
                    alive: true,
                  },
                  role: 'editor',
                },
              },
            },
          })
        }
        return Promise.resolve({})
      })
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => 'mock-uuid')

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['delete', 'block-123'], { from: 'user' })
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result.deleted).toBe(true)
      expect(result.id).toBe('block-123')
    })

    test('calls saveTransactions with alive:false and listRemove operations', async () => {
      // Given
      const mockInternalRequest = mock((_token: string, endpoint: string) => {
        if (endpoint === 'syncRecordValues') {
          return Promise.resolve({
            recordMap: {
              block: {
                'block-123': {
                  value: {
                    id: 'block-123',
                    type: 'text',
                    parent_id: 'parent-1',
                    space_id: 'space-1',
                    alive: true,
                  },
                  role: 'editor',
                },
              },
            },
          })
        }
        return Promise.resolve({})
      })
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => 'mock-uuid')

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['delete', 'block-123'], { from: 'user' })
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      expect(mockInternalRequest).toHaveBeenCalledWith(
        'test-token',
        'saveTransactions',
        expect.objectContaining({
          transactions: expect.arrayContaining([
            expect.objectContaining({
              operations: expect.arrayContaining([
                expect.objectContaining({
                  command: 'update',
                  args: { alive: false },
                }),
                expect.objectContaining({
                  command: 'listRemove',
                  path: ['content'],
                  args: { id: 'block-123' },
                }),
              ]),
            }),
          ]),
        }),
      )
    })

    test('errors when block has no parent_id', async () => {
      // Given
      const mockInternalRequest = mock((_token: string, endpoint: string) => {
        if (endpoint === 'syncRecordValues') {
          return Promise.resolve({
            recordMap: {
              block: {
                'block-123': {
                  value: {
                    id: 'block-123',
                    type: 'text',
                    space_id: 'space-1',
                    alive: true,
                  },
                  role: 'editor',
                },
              },
            },
          })
        }
        return Promise.resolve({})
      })
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => 'mock-uuid')

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
      }))

      const { blockCommand } = await import('./block')
      const errors: string[] = []
      const originalError = console.error
      console.error = (msg: string) => errors.push(msg)

      const mockExit = mock(() => {
        throw new Error('process.exit called')
      })
      const originalExit = process.exit
      process.exit = mockExit as any

      try {
        // When
        await blockCommand.parseAsync(['delete', 'block-123'], { from: 'user' })
      } catch {
        // Expected
      }

      console.error = originalError
      process.exit = originalExit

      // Then
      expect(errors.length).toBeGreaterThan(0)
      const errorMsg = JSON.parse(errors[0])
      expect(errorMsg.error).toContain('parent_id')
    })
  })
})
