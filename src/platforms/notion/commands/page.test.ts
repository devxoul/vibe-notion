import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

describe('PageCommand', () => {
  beforeEach(() => {
    mock.restore()
  })

  afterEach(() => {
    mock.restore()
  })

  test('page list returns pages from space', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string) => {
      if (endpoint === 'getSpaces') {
        return {
          'user-1': {
            space: {
              'space-123': {
                value: {
                  id: 'space-123',
                  name: 'Test Space',
                  pages: ['page-1', 'page-2'],
                },
              },
            },
          },
        }
      }
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'page-1': {
                value: {
                  id: 'page-1',
                  type: 'page',
                  alive: true,
                  properties: {
                    title: [['Page 1']],
                  },
                },
                role: 'editor',
              },
              'page-2': {
                value: {
                  id: 'page-2',
                  type: 'page',
                  alive: true,
                  properties: {
                    title: [['Page 2']],
                  },
                },
                role: 'editor',
              },
            },
          },
        }
      }
      return {}
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['list', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.spaceId).toBeUndefined()
    expect(Array.isArray(result.pages)).toBe(true)
    expect(result.pages.length).toBe(2)
    expect(result.pages[0].id).toBe('page-1')
    expect(result.pages[0].title).toBe('Page 1')
    expect(result.pages[0].type).toBe('page')
    expect(result.pages[1].id).toBe('page-2')
    expect(result.pages[1].title).toBe('Page 2')
    expect(result.total).toBe(2)
  })

  test('page list --workspace-id uses specified workspace', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string) => {
      if (endpoint === 'getSpaces') {
        return {
          'user-1': {
            space: {
              'space-123': {
                value: {
                  id: 'space-123',
                  name: 'Space 1',
                  pages: ['page-1'],
                },
              },
              'space-456': {
                value: {
                  id: 'space-456',
                  name: 'Space 2',
                  pages: ['page-3'],
                },
              },
            },
          },
        }
      }
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'page-3': {
                value: {
                  id: 'page-3',
                  type: 'page',
                  alive: true,
                  properties: {
                    title: [['Page 3']],
                  },
                },
                role: 'editor',
              },
            },
          },
        }
      }
      return {}
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-456')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['list', '--workspace-id', 'space-456'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.spaceId).toBeUndefined()
    expect(result.pages.length).toBe(1)
    expect(result.pages[0].id).toBe('page-3')
  })

  test('page list --depth 2 recursively walks children', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'getSpaces') {
        return {
          'user-1': {
            space: {
              'space-123': {
                value: {
                  id: 'space-123',
                  name: 'Test Space',
                  pages: ['page-1'],
                },
              },
            },
          },
        }
      }
      if (endpoint === 'syncRecordValues') {
        const pageIds = body.requests.map((r: any) => r.pointer.id)
        if (pageIds.includes('page-1')) {
          return {
            recordMap: {
              block: {
                'page-1': {
                  value: {
                    id: 'page-1',
                    type: 'page',
                    alive: true,
                    properties: {
                      title: [['Parent Page']],
                    },
                    content: ['page-1-child'],
                  },
                  role: 'editor',
                },
              },
            },
          }
        }
        if (pageIds.includes('page-1-child')) {
          return {
            recordMap: {
              block: {
                'page-1-child': {
                  value: {
                    id: 'page-1-child',
                    type: 'page',
                    alive: true,
                    properties: {
                      title: [['Child Page']],
                    },
                  },
                  role: 'editor',
                },
              },
            },
          }
        }
      }
      return {}
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['list', '--workspace-id', 'space-123', '--depth', '2'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.pages.length).toBe(1)
    expect(result.pages[0].id).toBe('page-1')
    expect(result.pages[0].title).toBe('Parent Page')
    expect(Array.isArray(result.pages[0].children)).toBe(true)
    expect(result.pages[0].children.length).toBe(1)
    expect(result.pages[0].children[0].id).toBe('page-1-child')
    expect(result.pages[0].children[0].title).toBe('Child Page')
  })

  test('page get loads page chunks until cursor stack is empty', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'loadPageChunk') {
        const chunkNumber = body.chunkNumber
        if (chunkNumber === 0) {
          return {
            cursor: {
              stack: [{ id: 'page-1', index: 0 }],
            },
            recordMap: {
              block: {
                'page-1': {
                  value: {
                    id: 'page-1',
                    type: 'page',
                    content: ['block-1', 'block-2'],
                    properties: {
                      title: [['Test Page']],
                    },
                  },
                  role: 'editor',
                },
                'block-1': {
                  value: {
                    id: 'block-1',
                    type: 'text',
                    properties: {
                      title: [['Block 1']],
                    },
                  },
                  role: 'editor',
                },
              },
            },
          }
        }
        if (chunkNumber === 1) {
          return {
            cursor: {
              stack: [],
            },
            recordMap: {
              block: {
                'block-2': {
                  value: {
                    id: 'block-2',
                    type: 'text',
                    properties: {
                      title: [['Block 2']],
                    },
                  },
                  role: 'editor',
                },
              },
            },
          }
        }
      }
      return {}
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['get', 'page-1', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('page-1')
    expect(result.title).toBe('Test Page')
    expect(result.blocks.length).toBe(2)
    expect(result.blocks[0].id).toBe('block-1')
    expect(result.blocks[0].text).toBe('Block 1')
    expect(result.blocks[1].id).toBe('block-2')
    expect(result.blocks[1].text).toBe('Block 2')
  })

  test('page get includes backlinks when --backlinks flag is set', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string) => {
      if (endpoint === 'loadPageChunk') {
        return {
          cursor: { stack: [] },
          recordMap: {
            block: {
              'page-1': {
                value: {
                  id: 'page-1',
                  type: 'page',
                  content: ['block-1'],
                  properties: { title: [['My Page']] },
                },
                role: 'editor',
              },
              'block-1': {
                value: { id: 'block-1', type: 'text', properties: { title: [['Hello']] } },
                role: 'editor',
              },
            },
          },
        }
      }
      if (endpoint === 'getBacklinksForBlock') {
        return {
          backlinks: [{ block_id: 'page-1', mentioned_from: { type: 'property_mention', block_id: 'ref-page' } }],
          recordMap: {
            block: {
              'ref-page': {
                value: { id: 'ref-page', type: 'page', properties: { title: [['Referencing Page']] } },
                role: 'editor',
              },
            },
          },
        }
      }
      return {}
    })

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))
    mock.module('./helpers', () => ({
      getCredentialsOrExit: mock(async () => ({ token_v2: 'test-token' })),
      generateId: mock(() => 'uuid-1'),
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['get', 'page-1', '--workspace-id', 'space-123', '--backlinks'], { from: 'user' })
    } catch {
      // Expected
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('page-1')
    expect(result.title).toBe('My Page')
    expect(result.backlinks).toEqual([{ id: 'ref-page', title: 'Referencing Page' }])
  })

  test('page create creates new page with title', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'saveTransactions') {
        expect(body.transactions[0].operations.length).toBe(2)
        expect(body.transactions[0].operations[0].command).toBe('set')
        expect(body.transactions[0].operations[0].args.type).toBe('page')
        expect(body.transactions[0].operations[0].args.properties.title[0][0]).toBe('New Page')
        expect(body.transactions[0].operations[1].command).toBe('listAfter')
        return {}
      }
      if (endpoint === 'syncRecordValues') {
        const pageIds = body.requests.map((r: any) => r.pointer.id)
        if (pageIds.includes('uuid-1')) {
          return {
            recordMap: {
              block: {
                'uuid-1': {
                  value: {
                    id: 'uuid-1',
                    type: 'page',
                    parent_id: 'parent-page',
                    space_id: 'space-123',
                    properties: {
                      title: [['New Page']],
                    },
                  },
                  role: 'editor',
                },
              },
            },
          }
        }
      }
      return {}
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(
        ['create', '--workspace-id', 'space-123', '--parent', 'parent-page', '--title', 'New Page'],
        {
          from: 'user',
        },
      )
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('uuid-1')
    expect(result.type).toBe('page')
    expect(result.title).toBe('New Page')
  })

  test('page update --title updates page title', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'saveTransactions') {
        expect(body.transactions[0].operations.length).toBe(1)
        expect(body.transactions[0].operations[0].command).toBe('set')
        expect(body.transactions[0].operations[0].path).toEqual(['properties', 'title'])
        expect(body.transactions[0].operations[0].args[0][0]).toBe('Updated Title')
        return {}
      }
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'page-1': {
                value: {
                  id: 'page-1',
                  type: 'page',
                  space_id: 'space-123',
                  properties: {
                    title: [['Updated Title']],
                  },
                },
                role: 'editor',
              },
            },
          },
        }
      }
      return {}
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['update', 'page-1', '--workspace-id', 'space-123', '--title', 'Updated Title'], {
        from: 'user',
      })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('page-1')
    expect(result.title).toBe('Updated Title')
    expect(result.type).toBe('page')
  })

  test('page update --replace-content preserves markdown block children and table format', async () => {
    let idCounter = 0
    type SavedOperation = {
      command: string
      pointer: { id: string }
      args: {
        id?: string
        type?: string
        parent_id?: string
        format?: Record<string, unknown>
        properties?: Record<string, unknown>
      }
    }
    type SaveTransactionsBody = { transactions: Array<{ operations: SavedOperation[] }> }
    const savedOperationBatches: SavedOperation[][] = []

    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: SaveTransactionsBody) => {
      if (endpoint === 'loadPageChunk') {
        return {
          recordMap: {
            block: {
              'page-1': {
                value: {
                  id: 'page-1',
                  type: 'page',
                  content: [],
                },
                role: 'editor',
              },
            },
          },
        }
      }
      if (endpoint === 'saveTransactions') {
        savedOperationBatches.push(body.transactions[0].operations)
        return {}
      }
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'page-1': {
                value: {
                  id: 'page-1',
                  type: 'page',
                  space_id: 'space-123',
                  properties: {
                    title: [['Updated Page']],
                  },
                },
                role: 'editor',
              },
            },
          },
        }
      }
      return {}
    })

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mock(async () => ({ token_v2: 'test-token' })),
      generateId: mock(() => `block-${idCounter++}`),
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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
      readMarkdownInput: mock(
        () => '### Decision table\n\n| No | Status |\n| --- | --- |\n| Q1 | ✅ |\n\n- Parent\n  - Child',
      ),
    }))

    mock.module('@/shared/markdown/to-notion-internal', () => ({
      markdownToBlocks: mock(() => [
        {
          type: 'sub_sub_header',
          properties: { title: [['Decision table']] },
        },
        {
          type: 'table',
          format: {
            table_block_column_order: ['col-a', 'col-b'],
            table_block_column_header: true,
          },
          children: [
            {
              type: 'table_row',
              properties: { 'col-a': [['No']], 'col-b': [['Status']] },
            },
            {
              type: 'table_row',
              properties: { 'col-a': [['Q1']], 'col-b': [['✅']] },
            },
          ],
        },
        {
          type: 'bulleted_list',
          properties: { title: [['Parent']] },
          children: [{ type: 'bulleted_list', properties: { title: [['Child']] } }],
        },
      ]),
    }))

    const { handlePageUpdate } = await import('./page')
    await handlePageUpdate('test-token', {
      page_id: 'page-1',
      replaceContent: true,
      markdown: 'content',
      workspaceId: 'space-123',
    })

    expect(savedOperationBatches).toHaveLength(1)
    const appendOps = savedOperationBatches[0]
    expect(appendOps).toHaveLength(12)

    const tableSetOp = appendOps.find((op) => op.command === 'set' && op.args.type === 'table')
    expect(tableSetOp?.args.format).toEqual({
      table_block_column_order: ['col-a', 'col-b'],
      table_block_column_header: true,
    })

    const tableRowSetOps = appendOps.filter((op) => op.command === 'set' && op.args.type === 'table_row')
    expect(tableRowSetOps).toHaveLength(2)
    expect(tableRowSetOps[0].args.parent_id).toBe(tableSetOp?.args.id)
    expect(tableRowSetOps[1].args.parent_id).toBe(tableSetOp?.args.id)
    const tableRowListOps = tableRowSetOps.map((rowOp) =>
      appendOps.find((op) => op.command === 'listAfter' && op.args.id === rowOp.args.id),
    )
    expect(tableRowListOps[0]?.pointer.id).toBe(tableSetOp?.args.id)
    expect(tableRowListOps[1]?.pointer.id).toBe(tableSetOp?.args.id)

    const bulletSetOps = appendOps.filter((op) => op.command === 'set' && op.args.type === 'bulleted_list')
    expect(bulletSetOps).toHaveLength(2)
    expect(bulletSetOps[1].args.parent_id).toBe(bulletSetOps[0].args.id)
    const childBulletListOp = appendOps.find(
      (op) => op.command === 'listAfter' && op.args.id === bulletSetOps[1].args.id,
    )
    expect(childBulletListOp?.pointer.id).toBe(bulletSetOps[0].args.id)
  })

  test('page update --icon updates page icon', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'saveTransactions') {
        expect(body.transactions[0].operations.length).toBe(1)
        expect(body.transactions[0].operations[0].command).toBe('set')
        expect(body.transactions[0].operations[0].path).toEqual(['format', 'page_icon'])
        expect(body.transactions[0].operations[0].args).toBe('🚀')
        return {}
      }
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'page-1': {
                value: {
                  id: 'page-1',
                  type: 'page',
                  space_id: 'space-123',
                  format: {
                    page_icon: '🚀',
                  },
                },
                role: 'editor',
              },
            },
          },
        }
      }
      return {}
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['update', 'page-1', '--workspace-id', 'space-123', '--icon', '🚀'], {
        from: 'user',
      })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('page-1')
    expect(result.type).toBe('page')
  })

  test('page update --icon on collection_view_page sets icon on collection', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'saveTransactions') {
        expect(body.transactions[0].operations.length).toBe(1)
        expect(body.transactions[0].operations[0].command).toBe('set')
        expect(body.transactions[0].operations[0].pointer.table).toBe('collection')
        expect(body.transactions[0].operations[0].pointer.id).toBe('collection-1')
        expect(body.transactions[0].operations[0].path).toEqual(['icon'])
        expect(body.transactions[0].operations[0].args).toBe('🚀')
        return {}
      }
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'page-1': {
                value: {
                  id: 'page-1',
                  type: 'collection_view_page',
                  collection_id: 'collection-1',
                  space_id: 'space-123',
                },
                role: 'editor',
              },
            },
          },
        }
      }
      return {}
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['update', 'page-1', '--workspace-id', 'space-123', '--icon', '🚀'], {
        from: 'user',
      })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('page-1')
    expect(result.type).toBe('collection_view_page')
  })

  test('page archive archives page and removes from parent', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'page-1': {
                value: {
                  id: 'page-1',
                  type: 'page',
                  parent_id: 'parent-page',
                  space_id: 'space-123',
                  alive: true,
                },
                role: 'editor',
              },
            },
          },
        }
      }
      if (endpoint === 'saveTransactions') {
        expect(body.transactions[0].operations.length).toBe(2)
        expect(body.transactions[0].operations[0].command).toBe('update')
        expect(body.transactions[0].operations[0].args.alive).toBe(false)
        expect(body.transactions[0].operations[1].command).toBe('listRemove')
        expect(body.transactions[0].operations[1].path).toEqual(['content'])
        return {}
      }
      return {}
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['archive', 'page-1', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.archived).toBe(true)
    expect(result.id).toBe('page-1')
  })

  test('page list handles errors', async () => {
    const mockInternalRequest = mock(async () => {
      throw new Error('API error')
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const errorOutput: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errorOutput.push(msg)

    let exitCode: number | undefined
    const originalExit = process.exit
    process.exit = ((code: number) => {
      exitCode = code
    }) as any

    try {
      await pageCommand.parseAsync(['list', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Expected
    }

    console.error = originalError
    process.exit = originalExit

    expect(errorOutput.length).toBeGreaterThan(0)
    const errorMsg = JSON.parse(errorOutput[0])
    expect(errorMsg.error).toBe('API error')
    expect(exitCode).toBe(1)
  })

  test('page get handles errors', async () => {
    const mockInternalRequest = mock(async () => {
      throw new Error('Page not found')
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const errorOutput: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errorOutput.push(msg)

    let exitCode: number | undefined
    const originalExit = process.exit
    process.exit = ((code: number) => {
      exitCode = code
    }) as any

    try {
      await pageCommand.parseAsync(['get', 'invalid-page', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Expected
    }

    console.error = originalError
    process.exit = originalExit

    expect(errorOutput.length).toBeGreaterThan(0)
    const errorMsg = JSON.parse(errorOutput[0])
    expect(errorMsg.error).toBe('Page not found')
    expect(exitCode).toBe(1)
  })

  test('page create handles errors', async () => {
    const mockInternalRequest = mock(async () => {
      throw new Error('Failed to create page')
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const errorOutput: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errorOutput.push(msg)

    let exitCode: number | undefined
    const originalExit = process.exit
    process.exit = ((code: number) => {
      exitCode = code
    }) as any

    try {
      await pageCommand.parseAsync(
        ['create', '--workspace-id', 'space-123', '--parent', 'parent-page', '--title', 'New Page'],
        {
          from: 'user',
        },
      )
    } catch {
      // Expected
    }

    console.error = originalError
    process.exit = originalExit

    expect(errorOutput.length).toBeGreaterThan(0)
    const errorMsg = JSON.parse(errorOutput[0])
    expect(errorMsg.error).toBe('Failed to create page')
    expect(exitCode).toBe(1)
  })

  test('page update handles errors', async () => {
    const mockInternalRequest = mock(async () => {
      throw new Error('Failed to update page')
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const errorOutput: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errorOutput.push(msg)

    let exitCode: number | undefined
    const originalExit = process.exit
    process.exit = ((code: number) => {
      exitCode = code
    }) as any

    try {
      await pageCommand.parseAsync(['update', 'page-1', '--workspace-id', 'space-123', '--title', 'New Title'], {
        from: 'user',
      })
    } catch {
      // Expected
    }

    console.error = originalError
    process.exit = originalExit

    expect(errorOutput.length).toBeGreaterThan(0)
    const errorMsg = JSON.parse(errorOutput[0])
    expect(errorMsg.error).toBe('Failed to update page')
    expect(exitCode).toBe(1)
  })

  test('page archive handles errors', async () => {
    const mockInternalRequest = mock(async () => {
      throw new Error('Failed to archive page')
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const errorOutput: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errorOutput.push(msg)

    let exitCode: number | undefined
    const originalExit = process.exit
    process.exit = ((code: number) => {
      exitCode = code
    }) as any

    try {
      await pageCommand.parseAsync(['archive', 'page-1', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Expected
    }

    console.error = originalError
    process.exit = originalExit

    expect(errorOutput.length).toBeGreaterThan(0)
    const errorMsg = JSON.parse(errorOutput[0])
    expect(errorMsg.error).toBe('Failed to archive page')
    expect(exitCode).toBe(1)
  })

  test('page create preprocesses markdown images before conversion', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string) => {
      if (endpoint === 'saveTransactions') {
        return {}
      }
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'uuid-1': {
                value: {
                  id: 'uuid-1',
                  type: 'page',
                  parent_id: 'parent-page',
                  space_id: 'space-123',
                  properties: {
                    title: [['New Page']],
                  },
                },
                role: 'editor',
              },
            },
          },
        }
      }
      return {}
    })
    const mockPreprocessMarkdownImages = mock(async (markdown: string) => markdown)

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mock(async () => ({ token_v2: 'test-token' })),
      generateId: mock(() => 'uuid-1'),
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    mock.module('@/shared/markdown/read-input', () => ({
      readMarkdownInput: mock(() => '![Local](./images/cat.png)'),
    }))

    const { handlePageCreate } = await import('./page')
    await handlePageCreate('test-token', {
      parent: 'parent-page',
      title: 'New Page',
      markdown: '![Local](./images/cat.png)',
      workspaceId: 'space-123',
    })

    expect(mockPreprocessMarkdownImages).toHaveBeenCalledTimes(1)
    expect(mockPreprocessMarkdownImages).toHaveBeenCalledWith(
      '![Local](./images/cat.png)',
      expect.any(Function),
      process.cwd(),
    )
  })

  test('page create skips markdown preprocessing when no local images exist', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string) => {
      if (endpoint === 'saveTransactions') {
        return {}
      }
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'uuid-1': {
                value: {
                  id: 'uuid-1',
                  type: 'page',
                  parent_id: 'parent-page',
                  space_id: 'space-123',
                  properties: {
                    title: [['New Page']],
                  },
                },
                role: 'editor',
              },
            },
          },
        }
      }
      return {}
    })
    const mockPreprocessMarkdownImages = mock(async () => '# Should not be used')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mock(async () => ({ token_v2: 'test-token' })),
      generateId: mock(() => 'uuid-1'),
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    mock.module('@/shared/markdown/read-input', () => ({
      readMarkdownInput: mock(() => '# Heading'),
    }))

    const { handlePageCreate } = await import('./page')
    await handlePageCreate('test-token', {
      parent: 'parent-page',
      title: 'New Page',
      markdown: '# Heading',
      workspaceId: 'space-123',
    })

    expect(mockPreprocessMarkdownImages).not.toHaveBeenCalled()
  })

  test('page create with markdown appends blocks to new page', async () => {
    let saveTransactionsCalls = 0
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'saveTransactions') {
        saveTransactionsCalls++
        if (saveTransactionsCalls === 1) {
          expect(body.transactions[0].operations.length).toBe(2)
          expect(body.transactions[0].operations[0].command).toBe('set')
          expect(body.transactions[0].operations[0].args.type).toBe('page')
        } else if (saveTransactionsCalls === 2) {
          expect(body.transactions[0].operations.length).toBeGreaterThan(0)
          const setOp = body.transactions[0].operations.find((op: any) => op.command === 'set')
          expect(setOp.args.type).toBe('header')
          expect(setOp.args.properties.title).toEqual([['Hello World']])
        }
        return {}
      }
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'uuid-1': {
                value: {
                  id: 'uuid-1',
                  type: 'page',
                  parent_id: 'parent-page',
                  space_id: 'space-123',
                  properties: {
                    title: [['New Page']],
                  },
                },
                role: 'editor',
              },
            },
          },
        }
      }
      return {}
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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
      readMarkdownInput: mock(() => '# Hello World'),
    }))

    mock.module('@/shared/markdown/to-notion-internal', () => ({
      markdownToBlocks: mock(() => [
        {
          type: 'header',
          properties: {
            title: [['Hello World']],
          },
        },
      ]),
    }))

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const errors: string[] = []
    const originalLog = console.log
    const originalError = console.error
    console.log = (msg: string) => output.push(msg)
    console.error = (msg: string) => errors.push(msg)

    try {
      await pageCommand.parseAsync(
        [
          'create',
          '--workspace-id',
          'space-123',
          '--parent',
          'parent-page',
          '--title',
          'New Page',
          '--markdown',
          '# Hello World',
        ],
        {
          from: 'user',
        },
      )
    } catch {
      // Expected to exit
    }

    console.log = originalLog
    console.error = originalError

    if (errors.length > 0) {
      console.error('Test errors:', errors)
    }

    expect(output.length).toBeGreaterThan(0)
    expect(saveTransactionsCalls).toBe(2)
  })

  test('page create without --parent creates root page at workspace root (no default team)', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'saveTransactions') {
        expect(body.transactions[0].operations.length).toBe(2)
        expect(body.transactions[0].operations[0].command).toBe('set')
        expect(body.transactions[0].operations[0].args.type).toBe('page')
        expect(body.transactions[0].operations[0].args.parent_table).toBe('space')
        expect(body.transactions[0].operations[0].args.parent_id).toBe('space-123')
        expect(body.transactions[0].operations[1].command).toBe('listAfter')
        expect(body.transactions[0].operations[1].pointer.table).toBe('space')
        expect(body.transactions[0].operations[1].path).toEqual(['pages'])
        return {}
      }
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'uuid-1': {
                value: {
                  id: 'uuid-1',
                  type: 'page',
                  parent_id: 'space-123',
                  parent_table: 'space',
                  space_id: 'space-123',
                  properties: {
                    title: [['Root Page']],
                  },
                },
                role: 'editor',
              },
            },
          },
        }
      }
      return {}
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['create', '--workspace-id', 'space-123', '--title', 'Root Page'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('uuid-1')
  })

  test('page create with --parent creates child page in parent block', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'saveTransactions') {
        expect(body.transactions[0].operations.length).toBe(2)
        expect(body.transactions[0].operations[0].command).toBe('set')
        expect(body.transactions[0].operations[0].args.type).toBe('page')
        expect(body.transactions[0].operations[0].args.parent_table).toBe('block')
        expect(body.transactions[0].operations[0].args.parent_id).toBe('parent-page')
        expect(body.transactions[0].operations[1].command).toBe('listAfter')
        expect(body.transactions[0].operations[1].pointer.table).toBe('block')
        expect(body.transactions[0].operations[1].path).toEqual(['content'])
        return {}
      }
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'uuid-1': {
                value: {
                  id: 'uuid-1',
                  type: 'page',
                  parent_id: 'parent-page',
                  parent_table: 'block',
                  space_id: 'space-123',
                  properties: {
                    title: [['Child Page']],
                  },
                },
                role: 'editor',
              },
            },
          },
        }
      }
      return {}
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(
        ['create', '--workspace-id', 'space-123', '--parent', 'parent-page', '--title', 'Child Page'],
        { from: 'user' },
      )
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('uuid-1')
  })

  test('page archive for root page removes from space pages', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'page-1': {
                value: {
                  id: 'page-1',
                  type: 'page',
                  parent_id: 'space-123',
                  parent_table: 'space',
                  space_id: 'space-123',
                  alive: true,
                },
                role: 'editor',
              },
            },
          },
        }
      }
      if (endpoint === 'saveTransactions') {
        expect(body.transactions[0].operations.length).toBe(2)
        expect(body.transactions[0].operations[0].command).toBe('update')
        expect(body.transactions[0].operations[0].args.alive).toBe(false)
        expect(body.transactions[0].operations[1].command).toBe('listRemove')
        expect(body.transactions[0].operations[1].pointer.table).toBe('space')
        expect(body.transactions[0].operations[1].path).toEqual(['pages'])
        return {}
      }
      return {}
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['archive', 'page-1', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.archived).toBe(true)
  })

  test('page archive for child page removes from block content', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'page-1': {
                value: {
                  id: 'page-1',
                  type: 'page',
                  parent_id: 'parent-page',
                  parent_table: 'block',
                  space_id: 'space-123',
                  alive: true,
                },
                role: 'editor',
              },
            },
          },
        }
      }
      if (endpoint === 'saveTransactions') {
        expect(body.transactions[0].operations.length).toBe(2)
        expect(body.transactions[0].operations[0].command).toBe('update')
        expect(body.transactions[0].operations[0].args.alive).toBe(false)
        expect(body.transactions[0].operations[1].command).toBe('listRemove')
        expect(body.transactions[0].operations[1].pointer.table).toBe('block')
        expect(body.transactions[0].operations[1].path).toEqual(['content'])
        return {}
      }
      return {}
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    const mockResolveSpaceId = mock(async () => 'space-123')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mockResolveSpaceId,
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['archive', 'page-1', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.archived).toBe(true)
  })

  test('page create without --parent creates root page under default team', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'saveTransactions') {
        expect(body.transactions[0].operations.length).toBe(2)
        expect(body.transactions[0].operations[0].command).toBe('set')
        expect(body.transactions[0].operations[0].args.type).toBe('page')
        expect(body.transactions[0].operations[0].args.parent_table).toBe('team')
        expect(body.transactions[0].operations[0].args.parent_id).toBe('team-123')
        expect(body.transactions[0].operations[1].command).toBe('listAfter')
        expect(body.transactions[0].operations[1].pointer.table).toBe('team')
        expect(body.transactions[0].operations[1].path).toEqual(['team_pages'])
        return {}
      }
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'uuid-1': {
                value: {
                  id: 'uuid-1',
                  type: 'page',
                  parent_id: 'team-123',
                  parent_table: 'team',
                  space_id: 'space-123',
                  properties: {
                    title: [['Team Root Page']],
                  },
                },
                role: 'editor',
              },
            },
          },
        }
      }
      return {}
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    const mockGenerateId = mock(() => 'uuid-1')

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mockGenerateId,
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
      resolveDefaultTeamId: mock(async () => 'team-123'),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['create', '--workspace-id', 'space-123', '--title', 'Team Root Page'], {
        from: 'user',
      })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('uuid-1')
  })

  test('page properties returns properties for database row', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string; id: string } }>
        const firstReq = requests[0]

        // Block fetch
        if (firstReq.pointer.table === 'block' && firstReq.pointer.id === 'row-1') {
          return {
            recordMap: {
              block: {
                'row-1': {
                  value: {
                    id: 'row-1',
                    type: 'page',
                    parent_id: 'collection-1',
                    parent_table: 'collection',
                    space_id: 'space-123',
                    properties: {
                      title: [['Task A']],
                      status: [['In Progress']],
                    },
                  },
                  role: 'editor',
                },
              },
            },
          }
        }

        // Collection fetch
        if (firstReq.pointer.table === 'collection') {
          return {
            recordMap: {
              collection: {
                'collection-1': {
                  value: {
                    id: 'collection-1',
                    schema: {
                      title: { name: 'Name', type: 'title' },
                      status: { name: 'Status', type: 'select' },
                    },
                  },
                },
              },
            },
          }
        }
      }
      return {}
    })

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mock(async () => ({ token_v2: 'test-token' })),
      generateId: mock(() => 'uuid-1'),
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['properties', 'row-1', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('row-1')
    expect(result.properties).toBeDefined()
    expect(result.properties.Name).toEqual({ type: 'title', value: 'Task A' })
    expect(result.properties.Status).toEqual({ type: 'select', value: 'In Progress' })
  })

  test('page properties returns basic info for regular page', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string) => {
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'page-1': {
                value: {
                  id: 'page-1',
                  type: 'page',
                  parent_id: 'space-123',
                  parent_table: 'space',
                  space_id: 'space-123',
                  properties: {
                    title: [['My Page']],
                  },
                },
                role: 'editor',
              },
            },
          },
        }
      }
      return {}
    })

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mock(async () => ({ token_v2: 'test-token' })),
      generateId: mock(() => 'uuid-1'),
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['properties', 'page-1', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('page-1')
    expect(result.title).toBe('My Page')
    expect(result.type).toBe('page')
    expect(result.properties).toBeUndefined()
  })

  test('page properties enriches relation and person references', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'syncRecordValues') {
        const requests = body.requests as Array<{ pointer: { table: string; id: string } }>
        const firstReq = requests[0]

        if (firstReq.pointer.table === 'block' && firstReq.pointer.id === 'row-1') {
          return {
            recordMap: {
              block: {
                'row-1': {
                  value: {
                    id: 'row-1',
                    type: 'page',
                    parent_id: 'collection-1',
                    parent_table: 'collection',
                    space_id: 'space-123',
                    properties: {
                      title: [['Task A']],
                      assignee: [['‣', [['u', 'user-1']]]],
                      related: [['‣', [['p', 'page-2']]]],
                    },
                  },
                  role: 'editor',
                },
              },
            },
          }
        }

        if (firstReq.pointer.table === 'collection') {
          return {
            recordMap: {
              collection: {
                'collection-1': {
                  value: {
                    id: 'collection-1',
                    schema: {
                      title: { name: 'Name', type: 'title' },
                      assignee: { name: 'Assignee', type: 'person' },
                      related: { name: 'Related', type: 'relation' },
                    },
                  },
                },
              },
            },
          }
        }

        // Reference resolution batch
        if (firstReq.pointer.table === 'block' && firstReq.pointer.id === 'page-2') {
          return {
            recordMap: {
              block: {
                'page-2': {
                  value: {
                    id: 'page-2',
                    type: 'page',
                    properties: { title: [['Related Task']] },
                  },
                  role: 'editor',
                },
              },
              notion_user: {
                'user-1': {
                  value: {
                    id: 'user-1',
                    name: 'Alice',
                  },
                  role: 'editor',
                },
              },
            },
          }
        }
      }
      return {}
    })

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mock(async () => ({ token_v2: 'test-token' })),
      generateId: mock(() => 'uuid-1'),
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['properties', 'row-1', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('row-1')
    expect(result.properties.Assignee).toEqual({
      type: 'person',
      value: [{ id: 'user-1', name: 'Alice' }],
    })
    expect(result.properties.Related).toEqual({
      type: 'relation',
      value: [{ id: 'page-2', title: 'Related Task' }],
    })
  })

  test('page properties handles errors', async () => {
    const mockInternalRequest = mock(async () => {
      throw new Error('Page not found')
    })

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mock(async () => ({ token_v2: 'test-token' })),
      generateId: mock(() => 'uuid-1'),
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const errorOutput: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errorOutput.push(msg)

    let exitCode: number | undefined
    const originalExit = process.exit
    process.exit = ((code: number) => {
      exitCode = code
    }) as any

    try {
      await pageCommand.parseAsync(['properties', 'invalid-page', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Expected
    }

    console.error = originalError
    process.exit = originalExit

    expect(errorOutput.length).toBeGreaterThan(0)
    const errorMsg = JSON.parse(errorOutput[0])
    expect(errorMsg.error).toBe('Page not found')
    expect(exitCode).toBe(1)
  })

  test('page archive for team root page removes from team pages', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'page-1': {
                value: {
                  id: 'page-1',
                  type: 'page',
                  parent_id: 'team-123',
                  parent_table: 'team',
                  space_id: 'space-123',
                  alive: true,
                },
                role: 'editor',
              },
            },
          },
        }
      }
      if (endpoint === 'saveTransactions') {
        expect(body.transactions[0].operations.length).toBe(2)
        expect(body.transactions[0].operations[0].command).toBe('update')
        expect(body.transactions[0].operations[0].args.alive).toBe(false)
        expect(body.transactions[0].operations[1].command).toBe('listRemove')
        expect(body.transactions[0].operations[1].pointer.table).toBe('team')
        expect(body.transactions[0].operations[1].path).toEqual(['team_pages'])
        return {}
      }
      return {}
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'uuid-1'),
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
      resolveBacklinkUsers: mock(async () => ({})),
      resolveDefaultTeamId: mock(async () => 'team-123'),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['archive', 'page-1', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.archived).toBe(true)
  })

  test('page list handles v3 nested space and block records', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string) => {
      if (endpoint === 'getSpaces') {
        return {
          'user-1': {
            space: {
              'space-123': {
                value: {
                  value: {
                    id: 'space-123',
                    name: 'V3 Space',
                    pages: ['page-v3-1', 'page-v3-2'],
                  },
                  role: 'editor',
                },
              },
            },
          },
        }
      }
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'page-v3-1': {
                value: {
                  value: {
                    id: 'page-v3-1',
                    type: 'page',
                    alive: true,
                    properties: {
                      title: [['V3 Page One']],
                    },
                  },
                  role: 'editor',
                },
              },
              'page-v3-2': {
                value: {
                  value: {
                    id: 'page-v3-2',
                    type: 'page',
                    alive: true,
                    properties: {
                      title: [['V3 Page Two']],
                    },
                  },
                  role: 'editor',
                },
              },
            },
          },
        }
      }
      return {}
    })

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mock(async () => ({ token_v2: 'test-token' })),
      generateId: mock(() => 'uuid-1'),
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(['list', '--workspace-id', 'space-123'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(Array.isArray(result.pages)).toBe(true)
    expect(result.pages.length).toBe(2)
    expect(result.pages[0].id).toBe('page-v3-1')
    expect(result.pages[0].title).toBe('V3 Page One')
    expect(result.pages[0].type).toBe('page')
    expect(result.pages[1].id).toBe('page-v3-2')
    expect(result.pages[1].title).toBe('V3 Page Two')
    expect(result.total).toBe(2)
  })

  test('page create handles v3 nested block response', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string) => {
      if (endpoint === 'saveTransactions') {
        return {}
      }
      if (endpoint === 'syncRecordValues') {
        return {
          recordMap: {
            block: {
              'uuid-v3': {
                value: {
                  value: {
                    id: 'uuid-v3',
                    type: 'page',
                    parent_id: 'parent-page',
                    space_id: 'space-123',
                    properties: {
                      title: [['V3 New Page']],
                    },
                  },
                  role: 'editor',
                },
              },
            },
          },
        }
      }
      return {}
    })

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mock(async () => ({ token_v2: 'test-token' })),
      generateId: mock(() => 'uuid-v3'),
      resolveSpaceId: mock(async () => 'space-123'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
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

    const { pageCommand } = await import('./page')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await pageCommand.parseAsync(
        ['create', '--workspace-id', 'space-123', '--parent', 'parent-page', '--title', 'V3 New Page'],
        { from: 'user' },
      )
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('uuid-v3')
    expect(result.type).toBe('page')
    expect(result.title).toBe('V3 New Page')
  })

  for (const [label, wrap] of [
    ['flat', (value: Record<string, unknown>) => ({ value, role: 'editor' })],
    ['wrapped', (value: Record<string, unknown>) => ({ spaceId: 'space-123', value: { value, role: 'editor' } })],
  ] as const) {
    test(`page properties resolves schema names for ${label} collection records`, async () => {
      // Given
      const collection = {
        id: 'coll-1',
        schema: {
          title: { name: 'Name', type: 'title' },
          brnd: { name: 'Brand', type: 'text' },
        },
      }
      mock.module('../client', () => ({
        internalRequest: mock(async (_tokenV2: string, endpoint: string, body: any) => {
          if (endpoint !== 'syncRecordValues') return {}
          const table = body.requests[0].pointer.table
          if (table === 'collection') {
            return { recordMap: { collection: { 'coll-1': wrap(collection) } } }
          }
          return {
            recordMap: {
              block: {
                'row-1': {
                  value: {
                    id: 'row-1',
                    type: 'page',
                    parent_table: 'collection',
                    parent_id: 'coll-1',
                    properties: { title: [['Pi Zero']], brnd: [['Raspberry']] },
                  },
                  role: 'editor',
                },
              },
            },
          }
        }),
      }))
      mock.module('./helpers', () => ({
        resolveAndSetActiveUserId: mock(async () => {}),
      }))

      // When
      const { handlePageProperties } = await import('./page')
      const result = (await handlePageProperties('test-token', {
        page_id: 'row-1',
        workspaceId: 'space-123',
        workspaceSource: 'explicit',
      })) as { properties: Record<string, unknown> }

      // Then
      expect(Object.keys(result.properties).sort()).toEqual(['Brand', 'Name'])
    })
  }
})
