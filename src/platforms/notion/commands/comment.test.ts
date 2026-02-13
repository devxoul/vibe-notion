import { beforeEach, describe, expect, mock, test } from 'bun:test'

describe('CommentCommands', () => {
  beforeEach(() => {
    mock.restore()
  })

  test('comment list returns comments for page', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'loadPageChunk') {
        expect(body.pageId).toBe('page-123')
        return {
          cursor: { stack: [] },
          recordMap: {
            discussion: {
              'disc-1': {
                value: {
                  value: {
                    id: 'disc-1',
                    parent_id: 'page-123',
                    parent_table: 'block',
                    comments: ['comment-1'],
                    resolved: false,
                    space_id: 'space-1',
                  },
                  role: 'editor',
                },
              },
            },
            comment: {
              'comment-1': {
                value: {
                  value: {
                    id: 'comment-1',
                    text: [['Test comment text']],
                    parent_id: 'disc-1',
                    parent_table: 'discussion',
                    created_by_id: 'user-1',
                    created_time: 1704067200000,
                    alive: true,
                    space_id: 'space-1',
                  },
                  role: 'editor',
                },
              },
            },
          },
        }
      }
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
      setActiveUserId: mock(),
      getActiveUserId: mock(),
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { commentCommand } = await import('./comment')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await commentCommand.parseAsync(['list', '--page', 'page-123', '--workspace-id', 'space-123'], {
        from: 'user',
      })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.results).toBeDefined()
    expect(result.results.length).toBe(1)
    expect(result.results[0].id).toBe('comment-1')
    expect(result.results[0].text).toBe('Test comment text')
    expect(result.results[0].discussion_id).toBe('disc-1')
    expect(result.total).toBe(1)
  })

  test('comment list requires --page', async () => {
    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    mock.module('../client', () => ({
      internalRequest: mock(),
      setActiveUserId: mock(),
      getActiveUserId: mock(),
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { commentCommand } = await import('./comment')
    const errorOutput: string[] = []
    const originalWrite = process.stderr.write
    process.stderr.write = ((msg: string) => {
      errorOutput.push(msg)
      return true
    }) as any

    let exitCode = 0
    const originalExit = process.exit
    process.exit = ((code?: number) => {
      exitCode = code || 0
    }) as any

    try {
      await commentCommand.parseAsync(['list', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Commander throws on missing required option
    }

    process.stderr.write = originalWrite
    process.exit = originalExit

    expect(exitCode).toBe(1)
    expect(errorOutput.join('').includes('--page')).toBe(true)
  })

  test('comment create on page', async () => {
    let saveTransactionsBody: any = null

    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            space: {
              'space-123': {
                value: {
                  id: 'space-123',
                  name: 'Test Space',
                },
              },
            },
          },
        }
      }
      if (endpoint === 'saveTransactions') {
        saveTransactionsBody = body
        return {}
      }
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    let idCounter = 0
    const mockGenerateId = mock(() => {
      idCounter++
      return idCounter === 1 ? 'mock-discussion-id' : 'mock-comment-id'
    })

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
      setActiveUserId: mock(),
      getActiveUserId: mock(() => 'user-1'),
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { commentCommand } = await import('./comment')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await commentCommand.parseAsync(['create', 'Hello world', '--page', 'page-123', '--workspace-id', 'space-123'], {
        from: 'user',
      })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(saveTransactionsBody).toBeDefined()
    expect(saveTransactionsBody.transactions[0].operations.length).toBe(3)

    const operations = saveTransactionsBody.transactions[0].operations
    expect(operations[0].pointer.table).toBe('discussion')
    expect(operations[0].command).toBe('set')
    expect(operations[1].pointer.table).toBe('comment')
    expect(operations[1].command).toBe('set')
    expect(operations[2].pointer.table).toBe('block')
    expect(operations[2].command).toBe('listAfter')

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('mock-comment-id')
    expect(result.discussion_id).toBe('mock-discussion-id')
    expect(result.text).toBe('Hello world')
  })

  test('comment create reply to discussion', async () => {
    let saveTransactionsBody: any = null

    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'syncRecordValues') {
        if (body.requests[0].pointer.table === 'discussion') {
          return {
            recordMap: {
              discussion: {
                'disc-123': {
                  value: {
                    value: {
                      id: 'disc-123',
                      space_id: 'space-mock',
                      parent_id: 'page-1',
                      parent_table: 'block',
                      comments: [],
                      resolved: false,
                    },
                    role: 'editor',
                  },
                },
              },
            },
          }
        }
        return {
          recordMap: {
            space: {
              'space-123': {
                value: {
                  id: 'space-123',
                  name: 'Test Space',
                },
              },
            },
          },
        }
      }
      if (endpoint === 'saveTransactions') {
        saveTransactionsBody = body
        return {}
      }
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'mock-comment-id')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
      setActiveUserId: mock(),
      getActiveUserId: mock(() => 'user-1'),
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { commentCommand } = await import('./comment')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await commentCommand.parseAsync(
        ['create', 'Reply text', '--discussion', 'disc-123', '--workspace-id', 'space-123'],
        { from: 'user' },
      )
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(saveTransactionsBody).toBeDefined()
    expect(saveTransactionsBody.transactions[0].operations.length).toBe(2)

    const operations = saveTransactionsBody.transactions[0].operations
    expect(operations[0].pointer.table).toBe('comment')
    expect(operations[0].command).toBe('set')
    expect(operations[1].pointer.table).toBe('discussion')
    expect(operations[1].command).toBe('listAfter')

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('mock-comment-id')
    expect(result.discussion_id).toBe('disc-123')
    expect(result.text).toBe('Reply text')
  })

  test('comment create errors without --page or --discussion', async () => {
    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    mock.module('../client', () => ({
      internalRequest: mock(),
      setActiveUserId: mock(),
      getActiveUserId: mock(),
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { commentCommand } = await import('./comment')
    const errorOutput: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errorOutput.push(msg)

    let exitCode = 0
    const originalExit = process.exit
    process.exit = ((code?: number) => {
      exitCode = code || 0
    }) as any

    try {
      await commentCommand.parseAsync(['create', 'text', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Expected
    }

    console.error = originalError
    process.exit = originalExit

    expect(exitCode).toBe(1)
    expect(errorOutput.length).toBeGreaterThan(0)
    const errorMsg = JSON.parse(errorOutput[0])
    expect(errorMsg.error).toContain('--page')
  })

  test('comment create errors with both --page and --discussion', async () => {
    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    mock.module('../client', () => ({
      internalRequest: mock(),
      setActiveUserId: mock(),
      getActiveUserId: mock(),
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { commentCommand } = await import('./comment')
    const errorOutput: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errorOutput.push(msg)

    let exitCode = 0
    const originalExit = process.exit
    process.exit = ((code?: number) => {
      exitCode = code || 0
    }) as any

    try {
      await commentCommand.parseAsync(
        ['create', 'text', '--page', 'p', '--discussion', 'd', '--workspace-id', 'space-123'],
        { from: 'user' },
      )
    } catch {
      // Expected
    }

    console.error = originalError
    process.exit = originalExit

    expect(exitCode).toBe(1)
    expect(errorOutput.length).toBeGreaterThan(0)
    const errorMsg = JSON.parse(errorOutput[0])
    expect(errorMsg.error).toContain('both')
  })

  test('comment get retrieves comment by ID', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'syncRecordValues') {
        expect(body.requests[0].pointer.table).toBe('comment')
        expect(body.requests[0].pointer.id).toBe('comment-123')
        return {
          recordMap: {
            comment: {
              'comment-123': {
                value: {
                  value: {
                    id: 'comment-123',
                    text: [['Retrieved comment']],
                    parent_id: 'disc-123',
                    parent_table: 'discussion',
                    created_by_id: 'user-1',
                    created_time: 1704067200000,
                    alive: true,
                    space_id: 'space-1',
                  },
                  role: 'editor',
                },
              },
            },
          },
        }
      }
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
      setActiveUserId: mock(),
      getActiveUserId: mock(),
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { commentCommand } = await import('./comment')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await commentCommand.parseAsync(['get', 'comment-123', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('comment-123')
    expect(result.text).toBe('Retrieved comment')
    expect(result.discussion_id).toBe('disc-123')
    expect(result.created_by).toBe('user-1')
  })

  test('comment get handles errors', async () => {
    const mockInternalRequest = mock(async () => {
      throw new Error('Comment not found')
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
      setActiveUserId: mock(),
      getActiveUserId: mock(),
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
    }))

    const { commentCommand } = await import('./comment')
    const errorOutput: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errorOutput.push(msg)

    let exitCode = 0
    const originalExit = process.exit
    process.exit = ((code?: number) => {
      exitCode = code || 0
    }) as any

    try {
      await commentCommand.parseAsync(['get', 'invalid-id', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Expected
    }

    console.error = originalError
    process.exit = originalExit

    expect(exitCode).toBe(1)
    expect(errorOutput.length).toBeGreaterThan(0)
    const errorMsg = JSON.parse(errorOutput[0])
    expect(errorMsg.error).toBe('Comment not found')
  })
})
