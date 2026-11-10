import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

function setupMocks(overrides: {
  internalRequest?: (...args: unknown[]) => Promise<unknown>
  generateId?: () => string
}) {
  const mockInternalRequest = mock(overrides.internalRequest ?? (() => Promise.resolve({})))
  const mockGetCredentials = mock(() => Promise.resolve({ token_v2: 'test-token', space_id: 'space-123' }))
  const mockResolveSpaceId = mock(() => Promise.resolve('space-123'))
  const mockGenerateId = mock(overrides.generateId ?? (() => 'mock-uuid'))

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

  return { mockInternalRequest, mockGetCredentials, mockResolveSpaceId, mockGenerateId }
}

describe('tableCommand', () => {
  beforeEach(() => {
    mock.restore()
  })

  afterEach(() => {
    mock.restore()
  })

  describe('table create', () => {
    test('creates table with headers and rows', async () => {
      // Given
      let idCounter = 0
      const { mockInternalRequest } = setupMocks({
        generateId: () => `id-${idCounter++}`,
      })

      const { tableCommand } = await import('./table')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await tableCommand.parseAsync(
          [
            'create',
            'parent-1',
            '--workspace-id',
            'space-123',
            '--headers',
            'Name,Role,Score',
            '--rows',
            '[["Alice","Dev","95"],["Bob","PM","88"]]',
          ],
          { from: 'user' },
        )
      } catch {
        // Expected
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result.table_id).toBeDefined()
      expect(result.column_ids).toBeDefined()
      expect(result.column_ids.length).toBe(3)
      expect(result.row_ids).toBeDefined()
      expect(result.row_ids.length).toBe(3) // 1 header + 2 data rows

      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as string[])[1] === 'saveTransactions')
      expect(saveCall).toBeDefined()
    })

    test('creates table with headers only (no rows)', async () => {
      // Given
      setupMocks({})

      const { tableCommand } = await import('./table')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await tableCommand.parseAsync(['create', 'parent-1', '--workspace-id', 'space-123', '--headers', 'A,B,C'], {
          from: 'user',
        })
      } catch {
        // Expected
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result.table_id).toBeDefined()
      expect(result.column_ids.length).toBe(3)
      expect(result.row_ids.length).toBe(1) // header row only
    })

    test('sets table format with column order and header flag', async () => {
      // Given
      const { mockInternalRequest } = setupMocks({})

      const { tableCommand } = await import('./table')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await tableCommand.parseAsync(
          ['create', 'parent-1', '--workspace-id', 'space-123', '--headers', 'Name,Score'],
          { from: 'user' },
        )
      } catch {
        // Expected
      }

      console.log = originalLog

      // Then
      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as string[])[1] === 'saveTransactions') as [
        unknown,
        unknown,
        { transactions: Array<{ operations: Array<{ args: Record<string, unknown> }> }> },
      ]
      expect(saveCall).toBeDefined()
      const operations = saveCall[2].transactions[0].operations
      const tableSetOp = operations.find((op) => op.args && (op.args as Record<string, unknown>).type === 'table')
      expect(tableSetOp).toBeDefined()
      const tableArgs = tableSetOp!.args as Record<string, unknown>
      const format = tableArgs.format as Record<string, unknown>
      expect(format.table_block_column_header).toBe(true)
      expect(Array.isArray(format.table_block_column_order)).toBe(true)
      expect((format.table_block_column_order as string[]).length).toBe(2)
    })

    test('errors on empty headers', async () => {
      // Given
      setupMocks({})

      const { tableCommand } = await import('./table')
      const errors: string[] = []
      const originalError = console.error
      console.error = (msg: string) => errors.push(msg)
      const mockExit = mock(() => {
        throw new Error('process.exit called')
      })
      const originalExit = process.exit
      process.exit = mockExit as never

      try {
        // When
        await tableCommand.parseAsync(['create', 'parent-1', '--workspace-id', 'space-123', '--headers', ''], {
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
      expect(errorMsg.error).toContain('empty')
    })

    test('errors when rows have more cells than headers', async () => {
      // Given
      setupMocks({})

      const { tableCommand } = await import('./table')
      const errors: string[] = []
      const originalError = console.error
      console.error = (msg: string) => errors.push(msg)
      const mockExit = mock(() => {
        throw new Error('process.exit called')
      })
      const originalExit = process.exit
      process.exit = mockExit as never

      try {
        // When
        await tableCommand.parseAsync(
          ['create', 'parent-1', '--workspace-id', 'space-123', '--headers', 'A,B', '--rows', '[["1","2","3"]]'],
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
      expect(errorMsg.error).toContain('Too many cells')
    })

    test('supports --after option for positional insertion', async () => {
      // Given
      const { mockInternalRequest } = setupMocks({})

      const { tableCommand } = await import('./table')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await tableCommand.parseAsync(
          ['create', 'parent-1', '--workspace-id', 'space-123', '--headers', 'A,B', '--after', 'sibling-1'],
          { from: 'user' },
        )
      } catch {
        // Expected
      }

      console.log = originalLog

      // Then
      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as string[])[1] === 'saveTransactions') as [
        unknown,
        unknown,
        { transactions: Array<{ operations: Array<Record<string, unknown>> }> },
      ]
      expect(saveCall).toBeDefined()
      const operations = saveCall[2].transactions[0].operations
      const parentListOp = operations.find(
        (op) =>
          (op.pointer as Record<string, unknown>).id === 'parent-1' &&
          (op.command === 'listAfter' || op.command === 'listBefore'),
      )
      expect(parentListOp).toBeDefined()
      expect((parentListOp!.args as Record<string, unknown>).after).toBe('sibling-1')
    })
  })

  describe('table add-row', () => {
    test('adds row to existing table', async () => {
      // Given
      const { mockInternalRequest } = setupMocks({
        internalRequest: (_token: string, endpoint: string) => {
          if (endpoint === 'syncRecordValues') {
            return Promise.resolve({
              recordMap: {
                block: {
                  'table-1': {
                    value: {
                      id: 'table-1',
                      type: 'table',
                      content: ['row-1'],
                      format: { table_block_column_order: ['col-a', 'col-b'] },
                      space_id: 'space-123',
                    },
                    role: 'editor',
                  },
                },
              },
            })
          }
          return Promise.resolve({})
        },
      })

      const { tableCommand } = await import('./table')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await tableCommand.parseAsync(['add-row', 'table-1', '--workspace-id', 'space-123', '--cells', 'Alice,Dev'], {
          from: 'user',
        })
      } catch {
        // Expected
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result.table_id).toBe('table-1')
      expect(result.row_id).toBeDefined()

      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as string[])[1] === 'saveTransactions') as [
        unknown,
        unknown,
        { transactions: Array<{ operations: Array<Record<string, unknown>> }> },
      ]
      expect(saveCall).toBeDefined()
      const operations = saveCall[2].transactions[0].operations
      const setOp = operations.find((op) => op.command === 'set')
      expect(setOp).toBeDefined()
      const setArgs = setOp!.args as Record<string, unknown>
      expect(setArgs.type).toBe('table_row')
      expect(setArgs.parent_id).toBe('table-1')
    })

    test('errors when block is not a table', async () => {
      // Given
      setupMocks({
        internalRequest: (_token: string, endpoint: string) => {
          if (endpoint === 'syncRecordValues') {
            return Promise.resolve({
              recordMap: {
                block: {
                  'not-table': {
                    value: { id: 'not-table', type: 'text', space_id: 'space-123' },
                    role: 'editor',
                  },
                },
              },
            })
          }
          return Promise.resolve({})
        },
      })

      const { tableCommand } = await import('./table')
      const errors: string[] = []
      const originalError = console.error
      console.error = (msg: string) => errors.push(msg)
      const mockExit = mock(() => {
        throw new Error('process.exit called')
      })
      const originalExit = process.exit
      process.exit = mockExit as never

      try {
        // When
        await tableCommand.parseAsync(['add-row', 'not-table', '--workspace-id', 'space-123', '--cells', 'A,B'], {
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
      expect(errorMsg.error).toContain('not a table')
    })
  })

  describe('table update-cell', () => {
    test('updates a specific cell by row and column index', async () => {
      // Given
      const { mockInternalRequest } = setupMocks({
        internalRequest: (_token: string, endpoint: string) => {
          if (endpoint === 'syncRecordValues') {
            return Promise.resolve({
              recordMap: {
                block: {
                  'table-1': {
                    value: {
                      id: 'table-1',
                      type: 'table',
                      content: ['header-row', 'data-row-0', 'data-row-1'],
                      format: {
                        table_block_column_order: ['col-a', 'col-b'],
                        table_block_column_header: true,
                      },
                      space_id: 'space-123',
                    },
                    role: 'editor',
                  },
                },
              },
            })
          }
          return Promise.resolve({})
        },
      })

      const { tableCommand } = await import('./table')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await tableCommand.parseAsync(
          ['update-cell', 'table-1', '--workspace-id', 'space-123', '--row', '0', '--col', '1', '--value', 'Updated'],
          { from: 'user' },
        )
      } catch {
        // Expected
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result.table_id).toBe('table-1')
      expect(result.row_id).toBe('data-row-0')
      expect(result.row).toBe(0)
      expect(result.col).toBe(1)

      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as string[])[1] === 'saveTransactions') as [
        unknown,
        unknown,
        { transactions: Array<{ operations: Array<Record<string, unknown>> }> },
      ]
      expect(saveCall).toBeDefined()
      const operations = saveCall[2].transactions[0].operations
      expect(operations).toEqual([
        {
          pointer: { table: 'block', id: 'data-row-0', spaceId: 'space-123' },
          command: 'updateBlockPropertyValue',
          path: ['properties', 'col-b'],
          args: { primitiveOp: { command: 'set', args: [['Updated']] } },
        },
      ])
    })

    test('errors on malformed index like "3abc"', async () => {
      // Given
      setupMocks({
        internalRequest: (_token: string, endpoint: string) => {
          if (endpoint === 'syncRecordValues') {
            return Promise.resolve({
              recordMap: {
                block: {
                  'table-1': {
                    value: {
                      id: 'table-1',
                      type: 'table',
                      content: ['header-row', 'data-row-0'],
                      format: {
                        table_block_column_order: ['col-a'],
                        table_block_column_header: true,
                      },
                      space_id: 'space-123',
                    },
                    role: 'editor',
                  },
                },
              },
            })
          }
          return Promise.resolve({})
        },
      })

      const { tableCommand } = await import('./table')
      const errors: string[] = []
      const originalError = console.error
      console.error = (msg: string) => errors.push(msg)
      const mockExit = mock(() => {
        throw new Error('process.exit called')
      })
      const originalExit = process.exit
      process.exit = mockExit as never

      try {
        // When
        await tableCommand.parseAsync(
          ['update-cell', 'table-1', '--workspace-id', 'space-123', '--row', '3abc', '--col', '0', '--value', 'X'],
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
      expect(errorMsg.error).toContain('Invalid --row index')
    })

    test('errors on column index out of bounds', async () => {
      // Given
      setupMocks({
        internalRequest: (_token: string, endpoint: string) => {
          if (endpoint === 'syncRecordValues') {
            return Promise.resolve({
              recordMap: {
                block: {
                  'table-1': {
                    value: {
                      id: 'table-1',
                      type: 'table',
                      content: ['header-row', 'data-row-0'],
                      format: {
                        table_block_column_order: ['col-a'],
                        table_block_column_header: true,
                      },
                      space_id: 'space-123',
                    },
                    role: 'editor',
                  },
                },
              },
            })
          }
          return Promise.resolve({})
        },
      })

      const { tableCommand } = await import('./table')
      const errors: string[] = []
      const originalError = console.error
      console.error = (msg: string) => errors.push(msg)
      const mockExit = mock(() => {
        throw new Error('process.exit called')
      })
      const originalExit = process.exit
      process.exit = mockExit as never

      try {
        // When
        await tableCommand.parseAsync(
          ['update-cell', 'table-1', '--workspace-id', 'space-123', '--row', '0', '--col', '5', '--value', 'X'],
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
      expect(errorMsg.error).toContain('Column index out of bounds')
    })
  })

  describe('table delete-row', () => {
    test('deletes a row by index', async () => {
      // Given
      const { mockInternalRequest } = setupMocks({
        internalRequest: (_token: string, endpoint: string) => {
          if (endpoint === 'syncRecordValues') {
            return Promise.resolve({
              recordMap: {
                block: {
                  'table-1': {
                    value: {
                      id: 'table-1',
                      type: 'table',
                      content: ['header-row', 'data-row-0', 'data-row-1'],
                      format: {
                        table_block_column_order: ['col-a', 'col-b'],
                        table_block_column_header: true,
                      },
                      space_id: 'space-123',
                    },
                    role: 'editor',
                  },
                },
              },
            })
          }
          return Promise.resolve({})
        },
      })

      const { tableCommand } = await import('./table')
      const output: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => output.push(msg)

      try {
        // When
        await tableCommand.parseAsync(['delete-row', 'table-1', '--workspace-id', 'space-123', '--row', '1'], {
          from: 'user',
        })
      } catch {
        // Expected
      }

      console.log = originalLog

      // Then
      expect(output.length).toBeGreaterThan(0)
      const result = JSON.parse(output[0])
      expect(result.deleted).toBe(true)
      expect(result.table_id).toBe('table-1')
      expect(result.row_id).toBe('data-row-1')
      expect(result.row).toBe(1)

      const saveCall = mockInternalRequest.mock.calls.find((call) => (call as string[])[1] === 'saveTransactions') as [
        unknown,
        unknown,
        { transactions: Array<{ operations: Array<Record<string, unknown>> }> },
      ]
      expect(saveCall).toBeDefined()
      const operations = saveCall[2].transactions[0].operations
      expect(operations.length).toBe(2)
      expect(operations[0].command).toBe('update')
      expect((operations[0].args as Record<string, unknown>).alive).toBe(false)
      expect(operations[1].command).toBe('listRemove')
    })

    test('errors on row index out of bounds', async () => {
      // Given
      setupMocks({
        internalRequest: (_token: string, endpoint: string) => {
          if (endpoint === 'syncRecordValues') {
            return Promise.resolve({
              recordMap: {
                block: {
                  'table-1': {
                    value: {
                      id: 'table-1',
                      type: 'table',
                      content: ['header-row'],
                      format: {
                        table_block_column_order: ['col-a'],
                        table_block_column_header: true,
                      },
                      space_id: 'space-123',
                    },
                    role: 'editor',
                  },
                },
              },
            })
          }
          return Promise.resolve({})
        },
      })

      const { tableCommand } = await import('./table')
      const errors: string[] = []
      const originalError = console.error
      console.error = (msg: string) => errors.push(msg)
      const mockExit = mock(() => {
        throw new Error('process.exit called')
      })
      const originalExit = process.exit
      process.exit = mockExit as never

      try {
        // When
        await tableCommand.parseAsync(['delete-row', 'table-1', '--workspace-id', 'space-123', '--row', '0'], {
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
      expect(errorMsg.error).toContain('Row index out of bounds')
    })
  })
})
