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
    expect(result.spaceId).toBe('space-123')
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
    expect(result.spaceId).toBe('space-456')
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
})
