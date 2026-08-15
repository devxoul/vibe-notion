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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['get', 'block-123', '--workspace-id', 'space-123'], { from: 'user' })
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result.id).toBe('block-123')
      expect(result.type).toBe('text')
      expect(result.text).toBeDefined()
      expect(result.parent_id).toBe('parent-1')
    })

    test('retrieves block value from v3 nested record format', async () => {
      // Given
      const mockInternalRequest = mock((_token: string, endpoint: string) => {
        if (endpoint === 'syncRecordValues') {
          return Promise.resolve({
            recordMap: {
              block: {
                'block-123': {
                  value: {
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['get', 'block-123', '--workspace-id', 'space-123'], { from: 'user' })
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result.id).toBe('block-123')
      expect(result.type).toBe('text')
      expect(result.parent_id).toBe('parent-1')
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
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
        await blockCommand.parseAsync(['get', 'block-123', '--workspace-id', 'space-123'], { from: 'user' })
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

    test('includes collection_id for collection_view block', async () => {
      // Given
      const mockInternalRequest = mock((_token: string, endpoint: string) => {
        if (endpoint === 'syncRecordValues') {
          return Promise.resolve({
            recordMap: {
              block: {
                'block-123': {
                  value: {
                    id: 'block-123',
                    type: 'collection_view',
                    collection_id: 'coll-123',
                    parent_id: 'parent-1',
                    view_ids: ['view-1'],
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['get', 'block-123', '--workspace-id', 'space-123'], { from: 'user' })
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result.id).toBe('block-123')
      expect(result.type).toBe('collection_view')
      expect(result.collection_id).toBe('coll-123')
    })

    test('includes backlinks when --backlinks flag is set', async () => {
      // Given
      const mockInternalRequest = mock((_token: string, endpoint: string) => {
        if (endpoint === 'syncRecordValues') {
          return Promise.resolve({
            recordMap: {
              block: {
                'block-123': {
                  value: { id: 'block-123', type: 'text', parent_id: 'parent-1' },
                  role: 'editor',
                },
              },
            },
          })
        }
        if (endpoint === 'getBacklinksForBlock') {
          return Promise.resolve({
            backlinks: [
              { block_id: 'block-123', mentioned_from: { type: 'property_mention', block_id: 'ref-1' } },
              { block_id: 'block-123', mentioned_from: { type: 'alias', block_id: 'ref-2' } },
            ],
            recordMap: {
              block: {
                'ref-1': {
                  value: { id: 'ref-1', type: 'page', properties: { title: [['Page One']] } },
                  role: 'editor',
                },
                'ref-2': {
                  value: { id: 'ref-2', type: 'page', properties: { title: [['Page Two']] } },
                  role: 'editor',
                },
              },
            },
          })
        }
        return Promise.resolve({})
      })

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))
      mock.module('./helpers', () => ({
        getCredentialsOrExit: mock(() => Promise.resolve({ token_v2: 'test-token' })),
        generateId: mock(() => 'mock-uuid'),
        resolveSpaceId: mock(() => Promise.resolve('space-123')),
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['get', 'block-123', '--workspace-id', 'space-123', '--backlinks'], {
          from: 'user',
        })
      } catch {
        // Expected
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result.id).toBe('block-123')
      expect(result.backlinks).toEqual([
        { id: 'ref-1', title: 'Page One' },
        { id: 'ref-2', title: 'Page Two' },
      ])
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['children', 'parent-1', '--workspace-id', 'space-123'], { from: 'user' })
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
      expect(result.next_cursor).toBeNull()
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['children', 'parent-1', '--workspace-id', 'space-123', '--limit', '50'], {
          from: 'user',
        })
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
    })

    test('passes start cursor and returns next_cursor when more results exist', async () => {
      // Given
      const startCursor = {
        stack: [[{ index: 5, id: 'parent-1' }]],
      }
      const responseCursor = {
        stack: [[{ index: 10, id: 'parent-1' }]],
      }
      const mockInternalRequest = mock((_token: string, endpoint: string, body: any) => {
        if (endpoint === 'loadPageChunk') {
          expect(body.cursor).toEqual(startCursor)
          return Promise.resolve({
            cursor: responseCursor,
            recordMap: {
              block: {
                'parent-1': {
                  value: {
                    id: 'parent-1',
                    type: 'page',
                    content: ['child-1'],
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
              },
            },
          })
        }
        return Promise.resolve({})
      })
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mock(() => 'mock-uuid'),
        resolveSpaceId: mock(() => Promise.resolve('space-123')),
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(
          ['children', 'parent-1', '--workspace-id', 'space-123', '--start-cursor', JSON.stringify(startCursor)],
          { from: 'user' },
        )
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result.has_more).toBe(true)
      expect(result.next_cursor).toBe(JSON.stringify(responseCursor))
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(
          [
            'append',
            'parent-1',
            '--workspace-id',
            'space-123',
            '--content',
            JSON.stringify([{ type: 'text', properties: { title: [['Hello']] } }]),
          ],
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(
          ['append', 'parent-1', '--workspace-id', 'space-123', '--content', JSON.stringify([{ type: 'text' }])],
          {
            from: 'user',
          },
        )
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
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
        await blockCommand.parseAsync(
          ['append', 'parent-1', '--workspace-id', 'space-123', '--content', 'not valid json'],
          {
            from: 'user',
          },
        )
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
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
        await blockCommand.parseAsync(
          ['append', 'parent-1', '--workspace-id', 'space-123', '--content', JSON.stringify([{ properties: {} }])],
          {
            from: 'user',
          },
        )
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

    test('creates blocks from markdown string', async () => {
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(
          ['append', 'parent-1', '--workspace-id', 'space-123', '--markdown', '# Hello World'],
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
      expect(mockInternalRequest).toHaveBeenCalledWith(
        'test-token',
        'saveTransactions',
        expect.objectContaining({
          transactions: expect.arrayContaining([
            expect.objectContaining({
              operations: expect.arrayContaining([
                expect.objectContaining({
                  command: 'set',
                  args: expect.objectContaining({
                    type: 'header',
                    properties: expect.objectContaining({
                      title: [['Hello World']],
                    }),
                  }),
                }),
              ]),
            }),
          ]),
        }),
      )
    })

    test('persists an uploaded markdown image as an image block claiming its file id', async () => {
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      mock.module('@/shared/markdown/preprocess-images', () => ({
        preprocessMarkdownImages: mock(async () => '![Local](attachment:file-123:cat.png)'),
      }))

      const { blockCommand } = await import('./block')
      const originalLog = console.log
      console.log = () => {}

      try {
        // When
        await blockCommand.parseAsync(
          ['append', 'parent-1', '--workspace-id', 'space-123', '--markdown', '![Local](./cat.png)'],
          { from: 'user' },
        )
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      const saveCall = mockInternalRequest.mock.calls.find((call) => call[1] === 'saveTransactions')
      const operations = ((saveCall?.[2] as any)?.transactions?.[0]?.operations ?? []) as any[]

      const setOperation = operations.find((operation) => operation.command === 'set')
      expect(setOperation?.args?.type).toBe('image')
      expect(setOperation?.args?.properties?.source).toEqual([['attachment:file-123:cat.png']])

      const fileIdOperation = operations.find((operation) => operation.path?.[0] === 'file_ids')
      expect(fileIdOperation).toEqual(
        expect.objectContaining({
          pointer: { table: 'block', id: 'new-block-id', spaceId: 'space-123' },
          command: 'listAfter',
          path: ['file_ids'],
          args: { id: 'file-123' },
        }),
      )
    })

    test('preprocesses markdown images before converting blocks', async () => {
      // Given
      const mockInternalRequest = mock(() => Promise.resolve({}))
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => 'new-block-id')
      const mockPreprocessMarkdownImages = mock(async (markdown: string) => markdown)

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      mock.module('@/shared/markdown/preprocess-images', () => ({
        preprocessMarkdownImages: mockPreprocessMarkdownImages,
      }))

      const { blockCommand } = await import('./block')

      // When
      await blockCommand.parseAsync(
        ['append', 'parent-1', '--workspace-id', 'space-123', '--markdown', '![Local](./images/cat.png)'],
        { from: 'user' },
      )

      // Then
      expect(mockPreprocessMarkdownImages).toHaveBeenCalledTimes(1)
      expect(mockPreprocessMarkdownImages).toHaveBeenCalledWith(
        '![Local](./images/cat.png)',
        expect.any(Function),
        process.cwd(),
      )
    })

    test('skips markdown image preprocessing when markdown has no images', async () => {
      // Given
      const mockInternalRequest = mock(() => Promise.resolve({}))
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => 'new-block-id')
      const mockPreprocessMarkdownImages = mock(async () => '# Should not be called')

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      mock.module('@/shared/markdown/preprocess-images', () => ({
        preprocessMarkdownImages: mockPreprocessMarkdownImages,
      }))

      const { blockCommand } = await import('./block')

      // When
      await blockCommand.parseAsync(
        ['append', 'parent-1', '--workspace-id', 'space-123', '--markdown', '# No images here'],
        { from: 'user' },
      )

      // Then
      expect(mockPreprocessMarkdownImages).not.toHaveBeenCalled()
    })

    test('creates nested operations from markdown with sub-bullets', async () => {
      // Given
      let idCounter = 0
      const mockInternalRequest = mock(() => Promise.resolve({}))
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => `block-${idCounter++}`)

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(
          ['append', 'parent-1', '--workspace-id', 'space-123', '--markdown', '- Parent\n  - Child'],
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

      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as any[])[1] === 'saveTransactions') as
        | [unknown, unknown, { transactions: Array<{ operations: any[] }> }]
        | undefined
      expect(saveCall).toBeDefined()
      const operations = saveCall?.[2].transactions[0]?.operations
      expect(operations).toBeDefined()
      const ops = operations!
      expect(ops.length).toBe(4)

      // Parent: set + listAfter
      expect(ops[0].command).toBe('set')
      expect(ops[0].args.type).toBe('bulleted_list')
      expect(ops[1].command).toBe('listAfter')

      // Child: set + listAfter with parent_id pointing to parent block
      expect(ops[2].command).toBe('set')
      expect(ops[2].args.type).toBe('bulleted_list')
      expect(ops[2].args.parent_id).toBe(ops[0].args.id)
      expect(ops[3].command).toBe('listAfter')
      expect(ops[3].pointer.id).toBe(ops[0].args.id)
    })

    test('parses JSON content with nested children', async () => {
      // Given
      let idCounter = 0
      const mockInternalRequest = mock(() => Promise.resolve({}))
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => `block-${idCounter++}`)

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const content = JSON.stringify([
        {
          type: 'bulleted_list',
          properties: { title: [['Parent']] },
          children: [{ type: 'bulleted_list', properties: { title: [['Child']] } }],
        },
      ])

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['append', 'parent-1', '--workspace-id', 'space-123', '--content', content], {
          from: 'user',
        })
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result.created.length).toBe(1)

      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as any[])[1] === 'saveTransactions') as
        | [unknown, unknown, { transactions: Array<{ operations: any[] }> }]
        | undefined
      expect(saveCall).toBeDefined()
      const operations = saveCall?.[2].transactions[0]?.operations
      expect(operations).toBeDefined()
      const ops = operations!
      expect(ops.length).toBe(4)

      expect(ops[0].command).toBe('set')
      expect(ops[0].args.type).toBe('bulleted_list')
      expect(ops[2].command).toBe('set')
      expect(ops[2].args.type).toBe('bulleted_list')
      expect(ops[2].args.parent_id).toBe(ops[0].args.id)
    })

    test('errors when children is not an array in JSON content', async () => {
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
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
        await blockCommand.parseAsync(
          [
            'append',
            'parent-1',
            '--workspace-id',
            'space-123',
            '--content',
            JSON.stringify([{ type: 'text', children: 'not-an-array' }]),
          ],
          { from: 'user' },
        )
      } catch {
        // Expected
      }

      console.error = originalError
      process.exit = originalExit

      // Then
      expect(errors.length).toBeGreaterThan(0)
      const errorMsg = JSON.parse(errors[0])
      expect(errorMsg.error).toContain('children must be an array')
    })

    test('creates blocks from markdown file', async () => {
      // Given
      const mockInternalRequest = mock(() => Promise.resolve({}))
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => 'new-block-id')
      const _mockReadFileSync = mock(() => '# From File\n\nParagraph text')

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      mock.module('@/shared/markdown/read-input', () => ({
        readMarkdownInput: mock(() => '# From File\n\nParagraph text'),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(
          ['append', 'parent-1', '--workspace-id', 'space-123', '--markdown-file', '/tmp/test.md'],
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
      expect(result.created.length).toBe(2)
    })

    test('errors when both --markdown and --content provided', async () => {
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
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
        await blockCommand.parseAsync(
          [
            'append',
            'parent-1',
            '--workspace-id',
            'space-123',
            '--content',
            JSON.stringify([{ type: 'text' }]),
            '--markdown',
            '# Hello',
          ],
          { from: 'user' },
        )
      } catch {
        // Expected
      }

      console.error = originalError
      process.exit = originalExit

      // Then
      expect(errors.length).toBeGreaterThan(0)
      const errorMsg = JSON.parse(errors[0])
      expect(errorMsg.error).toContain('mutually exclusive')
    })

    test('errors when markdown file does not exist', async () => {
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      mock.module('@/shared/markdown/read-input', () => ({
        readMarkdownInput: mock(() => {
          throw new Error('ENOENT: no such file or directory')
        }),
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
        await blockCommand.parseAsync(
          ['append', 'parent-1', '--workspace-id', 'space-123', '--markdown-file', '/nonexistent/file.md'],
          { from: 'user' },
        )
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

    test('includes after in listAfter args when --after is provided', async () => {
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')

      // When
      await blockCommand.parseAsync(
        [
          'append',
          'parent-1',
          '--workspace-id',
          'space-123',
          '--after',
          'sibling-1',
          '--content',
          JSON.stringify([{ type: 'text' }]),
        ],
        { from: 'user' },
      )

      // Then
      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as any[])[1] === 'saveTransactions') as
        | [unknown, unknown, { transactions: Array<{ operations: any[] }> }]
        | undefined
      expect(saveCall).toBeDefined()
      const operations = saveCall?.[2].transactions[0]?.operations
      const listAfterOp = operations?.find((op) => op.command === 'listAfter')
      expect(listAfterOp).toBeDefined()
      expect(listAfterOp.args).toEqual(expect.objectContaining({ id: 'new-block-id', after: 'sibling-1' }))
    })

    test('chains multiple appended blocks when --after is provided', async () => {
      // Given
      let idCounter = 0
      const mockInternalRequest = mock(() => Promise.resolve({}))
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => `block-${idCounter++}`)

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')

      // When
      await blockCommand.parseAsync(
        [
          'append',
          'parent-1',
          '--workspace-id',
          'space-123',
          '--after',
          'sibling-1',
          '--content',
          JSON.stringify([{ type: 'text' }, { type: 'text' }]),
        ],
        { from: 'user' },
      )

      // Then
      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as any[])[1] === 'saveTransactions') as
        | [unknown, unknown, { transactions: Array<{ operations: any[] }> }]
        | undefined
      expect(saveCall).toBeDefined()
      const operations = saveCall?.[2].transactions[0]?.operations
      const listAfterOps = operations?.filter((op) => op.command === 'listAfter') ?? []
      expect(listAfterOps.length).toBe(2)
      expect(listAfterOps[0].args).toEqual(expect.objectContaining({ id: 'block-0', after: 'sibling-1' }))
      expect(listAfterOps[1].args).toEqual(expect.objectContaining({ id: 'block-1', after: 'block-0' }))
    })

    test('includes before in listBefore args when --before is provided', async () => {
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')

      // When
      await blockCommand.parseAsync(
        [
          'append',
          'parent-1',
          '--workspace-id',
          'space-123',
          '--before',
          'sibling-1',
          '--content',
          JSON.stringify([{ type: 'text' }]),
        ],
        { from: 'user' },
      )

      // Then
      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as any[])[1] === 'saveTransactions') as
        | [unknown, unknown, { transactions: Array<{ operations: any[] }> }]
        | undefined
      expect(saveCall).toBeDefined()
      const operations = saveCall?.[2].transactions[0]?.operations
      const listBeforeOp = operations?.find((op) => op.command === 'listBefore')
      expect(listBeforeOp).toBeDefined()
      expect(listBeforeOp.args).toEqual(expect.objectContaining({ id: 'new-block-id', before: 'sibling-1' }))
    })

    test('chains multiple appended blocks with listAfter when --before is provided', async () => {
      // Given
      let idCounter = 0
      const mockInternalRequest = mock(() => Promise.resolve({}))
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockGenerateId = mock(() => `block-${idCounter++}`)

      mock.module('../client', () => ({
        internalRequest: mockInternalRequest,
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mockGenerateId,
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')

      // When
      await blockCommand.parseAsync(
        [
          'append',
          'parent-1',
          '--workspace-id',
          'space-123',
          '--before',
          'sibling-1',
          '--content',
          JSON.stringify([{ type: 'text' }, { type: 'text' }]),
        ],
        { from: 'user' },
      )

      // Then
      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as any[])[1] === 'saveTransactions') as
        | [unknown, unknown, { transactions: Array<{ operations: any[] }> }]
        | undefined
      expect(saveCall).toBeDefined()
      const operations = saveCall?.[2].transactions[0]?.operations
      const listBeforeOps = operations?.filter((op) => op.command === 'listBefore') ?? []
      const listAfterOps = operations?.filter((op) => op.command === 'listAfter') ?? []
      expect(listBeforeOps.length).toBe(1)
      expect(listAfterOps.length).toBe(1)
      expect(listBeforeOps[0].args).toEqual(expect.objectContaining({ id: 'block-0', before: 'sibling-1' }))
      expect(listAfterOps[0].args).toEqual(expect.objectContaining({ id: 'block-1', after: 'block-0' }))
    })

    test('errors when both --after and --before are provided', async () => {
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
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
        await blockCommand.parseAsync(
          [
            'append',
            'parent-1',
            '--workspace-id',
            'space-123',
            '--after',
            'sibling-1',
            '--before',
            'sibling-2',
            '--content',
            JSON.stringify([{ type: 'text' }]),
          ],
          { from: 'user' },
        )
      } catch {
        // Expected
      }

      console.error = originalError
      process.exit = originalExit

      // Then
      expect(errors.length).toBeGreaterThan(0)
      const errorMsg = JSON.parse(errors[0])
      expect(errorMsg.error).toContain('mutually exclusive')
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(
          [
            'update',
            'block-123',
            '--workspace-id',
            'space-123',
            '--content',
            JSON.stringify({ properties: { title: [['Updated']] } }),
          ],
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
      expect(result.type).toBe('text')
      expect(result.text).toBe('Updated')
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(
          ['update', 'block-123', '--workspace-id', 'space-123', '--content', JSON.stringify({ version: 2 })],
          {
            from: 'user',
          },
        )
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

    test('merges properties with existing block to prevent data loss', async () => {
      // Given
      let syncCallCount = 0
      const mockInternalRequest = mock((_token: string, endpoint: string) => {
        if (endpoint === 'syncRecordValues') {
          syncCallCount++
          return Promise.resolve({
            recordMap: {
              block: {
                'todo-block': {
                  value: {
                    id: 'todo-block',
                    type: 'to_do',
                    version: 1,
                    parent_id: 'parent-1',
                    space_id: 'space-1',
                    alive: true,
                    properties: {
                      title: [['Buy groceries']],
                      checked: [['No']],
                    },
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When: send only checked, without title
        await blockCommand.parseAsync(
          [
            'update',
            'todo-block',
            '--workspace-id',
            'space-123',
            '--content',
            JSON.stringify({ properties: { checked: [['Yes']] } }),
          ],
          { from: 'user' },
        )
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then: saveTransactions should include merged properties (title preserved)
      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as any[])[1] === 'saveTransactions') as
        | [unknown, unknown, { transactions: Array<{ operations: any[] }> }]
        | undefined
      expect(saveCall).toBeDefined()
      const operation = saveCall?.[2].transactions[0]?.operations[0]
      expect(operation?.args.properties).toEqual({
        title: [['Buy groceries']],
        checked: [['Yes']],
      })
    })

    test('skips property merge when content has no properties', async () => {
      // Given
      let syncCallCount = 0
      const mockInternalRequest = mock((_token: string, endpoint: string) => {
        if (endpoint === 'syncRecordValues') {
          syncCallCount++
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When: update without properties (e.g., changing format)
        await blockCommand.parseAsync(
          [
            'update',
            'block-123',
            '--workspace-id',
            'space-123',
            '--content',
            JSON.stringify({ format: { width: 100 } }),
          ],
          { from: 'user' },
        )
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then: only 1 syncRecordValues call (the verification after save), no pre-fetch
      expect(syncCallCount).toBe(1)
    })

    test('handles property merge when block has no existing properties', async () => {
      // Given
      const mockInternalRequest = mock((_token: string, endpoint: string) => {
        if (endpoint === 'syncRecordValues') {
          return Promise.resolve({
            recordMap: {
              block: {
                'block-123': {
                  value: {
                    id: 'block-123',
                    type: 'to_do',
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When: block has no existing properties
        await blockCommand.parseAsync(
          [
            'update',
            'block-123',
            '--workspace-id',
            'space-123',
            '--content',
            JSON.stringify({ properties: { checked: [['Yes']] } }),
          ],
          { from: 'user' },
        )
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then: uses provided properties as-is (no merge needed)
      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as any[])[1] === 'saveTransactions') as
        | [unknown, unknown, { transactions: Array<{ operations: any[] }> }]
        | undefined
      expect(saveCall).toBeDefined()
      const operation = saveCall?.[2].transactions[0]?.operations[0]
      expect(operation?.args.properties).toEqual({
        checked: [['Yes']],
      })
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
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
        await blockCommand.parseAsync(
          ['update', 'block-123', '--workspace-id', 'space-123', '--content', JSON.stringify(['array'])],
          { from: 'user' },
        )
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['delete', 'block-123', '--workspace-id', 'space-123'], { from: 'user' })
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['delete', 'block-123', '--workspace-id', 'space-123'], { from: 'user' })
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
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
        await blockCommand.parseAsync(['delete', 'block-123', '--workspace-id', 'space-123'], { from: 'user' })
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

  describe('block upload', () => {
    test('uploads file and outputs result', async () => {
      // Given
      const mockUploadFile = mock(() =>
        Promise.resolve({ id: 'file-block-1', type: 'image', url: 'https://s3.us-west-2.amazonaws.com/file.png' }),
      )
      const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
      const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
      const mockResolveAndSetActiveUserId = mock(() => Promise.resolve())

      mock.module('../client', () => ({
        internalRequest: mock(() => Promise.resolve({})),
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mockGetCredentials,
        generateId: mock(() => 'mock-uuid'),
        resolveSpaceId: mockResolveSpaceId,
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
        resolveAndSetActiveUserId: mockResolveAndSetActiveUserId,
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      mock.module('@/platforms/notion/upload', () => ({
        uploadFile: mockUploadFile,
        uploadFileOnly: mock(() =>
          Promise.resolve({
            url: 'https://s3.us-west-2.amazonaws.com/file.png',
            fileId: 'file-1',
            contentType: 'image/png',
            name: 'test.png',
          }),
        ),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['upload', 'parent-123', '--workspace-id', 'ws-123', '--file', './test.png'], {
          from: 'user',
        })
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result.id).toBe('file-block-1')
      expect(result.type).toBe('image')
      expect(result.url).toBe('https://s3.us-west-2.amazonaws.com/file.png')
      expect(mockResolveAndSetActiveUserId).toHaveBeenCalledWith('test-token', 'ws-123')
      expect(mockResolveSpaceId).toHaveBeenCalledWith('test-token', expect.any(String))
      expect(mockUploadFile).toHaveBeenCalledWith(
        'test-token',
        expect.any(String),
        './test.png',
        'space-123',
        undefined,
        undefined,
      )
    })

    test('errors when --file is missing', async () => {
      // Given
      mock.module('../client', () => ({
        internalRequest: mock(() => Promise.resolve({})),
      }))

      mock.module('./helpers', () => ({
        getCredentialsOrExit: mock(() => Promise.resolve({ token_v2: 'test-token' })),
        generateId: mock(() => 'mock-uuid'),
        resolveSpaceId: mock(() => Promise.resolve('space-123')),
        resolveCollectionViewId: mock(() => Promise.resolve('view-123')),
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      mock.module('@/platforms/notion/upload', () => ({
        uploadFile: mock(() => Promise.resolve({})),
        uploadFileOnly: mock(() => Promise.resolve({ url: '', fileId: '', contentType: '', name: '' })),
      }))

      const { blockCommand } = await import('./block')
      const stderrOutput: string[] = []
      const originalWrite = process.stderr.write
      process.stderr.write = ((chunk: any) => {
        stderrOutput.push(String(chunk))
        return true
      }) as any

      const mockExit = mock(() => {
        throw new Error('process.exit called')
      })
      const originalExit = process.exit
      process.exit = mockExit as any

      try {
        // When
        await blockCommand.parseAsync(['upload', 'parent-123', '--workspace-id', 'ws-123'], { from: 'user' })
      } catch {
        // Expected
      }

      process.stderr.write = originalWrite
      process.exit = originalExit

      // Then
      expect(mockExit).toHaveBeenCalled()
      expect(stderrOutput.some((s) => s.includes('--file'))).toBe(true)
    })
  })

  describe('block move', () => {
    test('moves block to new parent and outputs result', async () => {
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
                    parent_id: 'old-parent',
                    space_id: 'space-123',
                    alive: true,
                    version: 1,
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await blockCommand.parseAsync(['move', 'block-123', '--workspace-id', 'space-123', '--parent', 'new-parent'], {
          from: 'user',
        })
      } catch {
        // Expected to exit
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result).toEqual({ moved: true, id: 'block-123', parent_id: 'new-parent' })

      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as any[])[1] === 'saveTransactions') as
        | [unknown, unknown, { transactions: Array<{ operations: any[] }> }]
        | undefined
      expect(saveCall).toBeDefined()
      const operations = saveCall?.[2].transactions[0]?.operations
      expect(operations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            command: 'listRemove',
            pointer: expect.objectContaining({ id: 'old-parent' }),
            args: expect.objectContaining({ id: 'block-123' }),
          }),
          expect.objectContaining({
            command: 'listAfter',
            pointer: expect.objectContaining({ id: 'new-parent' }),
            args: expect.objectContaining({ id: 'block-123' }),
          }),
          expect.objectContaining({
            command: 'update',
            pointer: expect.objectContaining({ id: 'block-123' }),
            args: expect.objectContaining({ parent_id: 'new-parent' }),
          }),
        ]),
      )
    })

    test('includes after in listAfter args for move --after', async () => {
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
                    parent_id: 'old-parent',
                    space_id: 'space-123',
                    alive: true,
                    version: 1,
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')

      // When
      await blockCommand.parseAsync(
        ['move', 'block-123', '--workspace-id', 'space-123', '--parent', 'new-parent', '--after', 'after-block'],
        { from: 'user' },
      )

      // Then
      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as any[])[1] === 'saveTransactions') as
        | [unknown, unknown, { transactions: Array<{ operations: any[] }> }]
        | undefined
      expect(saveCall).toBeDefined()
      const operations = saveCall?.[2].transactions[0]?.operations
      const listAfterOp = operations?.find((op) => op.command === 'listAfter')
      expect(listAfterOp).toBeDefined()
      expect(listAfterOp.args).toEqual(expect.objectContaining({ id: 'block-123', after: 'after-block' }))
    })

    test('moves block with --before using listBefore', async () => {
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
                    parent_id: 'old-parent',
                    space_id: 'space-123',
                    alive: true,
                    version: 1,
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')

      // When
      await blockCommand.parseAsync(
        ['move', 'block-123', '--workspace-id', 'space-123', '--parent', 'new-parent', '--before', 'before-block'],
        { from: 'user' },
      )

      // Then
      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as any[])[1] === 'saveTransactions') as
        | [unknown, unknown, { transactions: Array<{ operations: any[] }> }]
        | undefined
      expect(saveCall).toBeDefined()
      const operations = saveCall?.[2].transactions[0]?.operations
      const listBeforeOp = operations?.find((op) => op.command === 'listBefore')
      expect(listBeforeOp).toBeDefined()
      expect(listBeforeOp.args).toEqual(expect.objectContaining({ id: 'block-123', before: 'before-block' }))
    })

    test('reorders block within same parent without update operation', async () => {
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
                    parent_id: 'same-parent',
                    space_id: 'space-123',
                    alive: true,
                    version: 1,
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
        resolveAndSetActiveUserId: mock(() => Promise.resolve()),
        resolveBacklinkUsers: mock(async () => ({})),
        resolveDefaultTeamId: mock(async () => undefined),
        ensureWorkspaceContext: mock(async (creds, workspaceId) => ({
          workspaceId: workspaceId ?? 'space-mock',
          tokenV2: (creds && creds.token_v2) || 'test-token',
          userId: creds && creds.user_id,
        })),
        resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: 'space-mock', tokenV2: 'test-token' })),
        getAccountTokens: mock((creds) => [
          { token_v2: (creds && creds.token_v2) || 'test-token', user_id: creds && creds.user_id },
        ]),
      }))

      const { blockCommand } = await import('./block')

      // When
      await blockCommand.parseAsync(
        ['move', 'block-123', '--workspace-id', 'space-123', '--parent', 'same-parent', '--after', 'sibling-1'],
        { from: 'user' },
      )

      // Then
      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as any[])[1] === 'saveTransactions') as
        | [unknown, unknown, { transactions: Array<{ operations: any[] }> }]
        | undefined
      expect(saveCall).toBeDefined()
      const operations = saveCall?.[2].transactions[0]?.operations ?? []
      expect(operations.some((op) => op.command === 'listRemove')).toBe(true)
      expect(operations.some((op) => op.command === 'listAfter')).toBe(true)
      expect(operations.some((op) => op.command === 'update')).toBe(false)
    })
  })
})
