import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const mockRetrieve = mock(() => Promise.resolve({}))
const mockRequest = mock(() => Promise.resolve({}))
const mockCreate = mock(() => Promise.resolve({}))
const mockUpdate = mock(() => Promise.resolve({}))
const mockSearch = mock(() => Promise.resolve({}))

mock.module('../client', () => ({
  getClient: () => ({
    databases: {
      retrieve: mockRetrieve,
      create: mockCreate,
      update: mockUpdate,
    },
    request: mockRequest,
    search: mockSearch,
  }),
}))

const { databaseCommand } = await import('./database')

describe('database commands', () => {
  let consoleOutput: string[]
  let consoleErrors: string[]
  let originalLog: typeof console.log
  let originalError: typeof console.error
  let originalExit: typeof process.exit

  beforeEach(() => {
    consoleOutput = []
    consoleErrors = []
    originalLog = console.log
    originalError = console.error
    originalExit = process.exit

    console.log = (...args: any[]) => consoleOutput.push(args.join(' '))
    console.error = (...args: any[]) => consoleErrors.push(args.join(' '))
    process.exit = mock(() => {
      throw new Error('process.exit called')
    }) as any

    mockRetrieve.mockReset()
    mockRequest.mockReset()
    mockCreate.mockReset()
    mockUpdate.mockReset()
    mockSearch.mockReset()
  })

  afterEach(() => {
    console.log = originalLog
    console.error = originalError
    process.exit = originalExit
  })

  describe('get', () => {
    test('retrieves database by id', async () => {
      // Given
      mockRetrieve.mockResolvedValue({
        id: 'db-123',
        title: [{ plain_text: 'My Database' }],
        properties: { Name: { type: 'title' } },
      })

      // When
      await databaseCommand.parseAsync(['get', 'db-123'], { from: 'user' })

      // Then
      expect(mockRetrieve).toHaveBeenCalledWith({ database_id: 'db-123' })
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('db-123')
    })

    test('handles error on retrieve failure', async () => {
      // Given
      mockRetrieve.mockRejectedValue(new Error('Not found'))

      // When
      try {
        await databaseCommand.parseAsync(['get', 'db-404'], { from: 'user' })
      } catch {
        // handleError calls process.exit
      }

      // Then
      const allOutput = [...consoleOutput, ...consoleErrors].join('\n')
      expect(allOutput).toContain('Not found')
    })
  })

  describe('query', () => {
    test('queries database with default params', async () => {
      // Given
      mockRequest.mockResolvedValue({
        results: [{ id: 'page-1' }],
        has_more: false,
        next_cursor: null,
      })

      // When
      await databaseCommand.parseAsync(['query', 'db-123'], { from: 'user' })

      // Then
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'post',
        path: 'databases/db-123/query',
        body: {},
      })
      const output = JSON.parse(consoleOutput[0])
      expect(output.results).toHaveLength(1)
    })

    test('queries database with filter, sort, page-size, and start-cursor', async () => {
      // Given
      const filter = JSON.stringify({ property: 'Status', select: { equals: 'Done' } })
      const sort = JSON.stringify([{ property: 'Created', direction: 'descending' }])
      mockRequest.mockResolvedValue({ results: [], has_more: false, next_cursor: null })

      // When
      await databaseCommand.parseAsync(
        [
          'query',
          'db-123',
          '--filter',
          filter,
          '--sort',
          sort,
          '--page-size',
          '10',
          '--start-cursor',
          'abc',
        ],
        { from: 'user' }
      )

      // Then
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'post',
        path: 'databases/db-123/query',
        body: {
          filter: { property: 'Status', select: { equals: 'Done' } },
          sorts: [{ property: 'Created', direction: 'descending' }],
          page_size: 10,
          start_cursor: 'abc',
        },
      })
    })
  })

  describe('create', () => {
    test('creates database with parent and title', async () => {
      // Given
      mockCreate.mockResolvedValue({ id: 'new-db-1', title: [{ plain_text: 'Tasks' }] })

      // When
      await databaseCommand.parseAsync(['create', '--parent', 'page-1', '--title', 'Tasks'], {
        from: 'user',
      })

      // Then
      expect(mockCreate).toHaveBeenCalledWith({
        parent: { type: 'page_id', page_id: 'page-1' },
        title: [{ type: 'text', text: { content: 'Tasks' } }],
        properties: {},
      })
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('new-db-1')
    })

    test('creates database with custom properties JSON', async () => {
      // Given
      const properties = JSON.stringify({ Status: { select: { options: [{ name: 'Done' }] } } })
      mockCreate.mockResolvedValue({ id: 'new-db-2' })

      // When
      await databaseCommand.parseAsync(
        ['create', '--parent', 'page-1', '--title', 'Tasks', '--properties', properties],
        {
          from: 'user',
        }
      )

      // Then
      expect(mockCreate).toHaveBeenCalledWith({
        parent: { type: 'page_id', page_id: 'page-1' },
        title: [{ type: 'text', text: { content: 'Tasks' } }],
        properties: { Status: { select: { options: [{ name: 'Done' }] } } },
      })
    })
  })

  describe('update', () => {
    test('updates database title', async () => {
      // Given
      mockUpdate.mockResolvedValue({ id: 'db-123', title: [{ plain_text: 'Updated' }] })

      // When
      await databaseCommand.parseAsync(['update', 'db-123', '--title', 'Updated'], { from: 'user' })

      // Then
      expect(mockUpdate).toHaveBeenCalledWith({
        database_id: 'db-123',
        title: [{ type: 'text', text: { content: 'Updated' } }],
      })
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('db-123')
    })
  })

  describe('list', () => {
    test('lists databases via search', async () => {
      // Given
      mockSearch.mockResolvedValue({
        results: [{ id: 'db-1' }, { id: 'db-2' }],
        has_more: false,
        next_cursor: null,
      })

      // When
      await databaseCommand.parseAsync(['list'], { from: 'user' })

      // Then
      expect(mockSearch).toHaveBeenCalledWith({
        filter: { property: 'object', value: 'database' },
      })
      const output = JSON.parse(consoleOutput[0])
      expect(output.results).toHaveLength(2)
    })

    test('lists databases with pagination params', async () => {
      // Given
      mockSearch.mockResolvedValue({ results: [], has_more: false, next_cursor: null })

      // When
      await databaseCommand.parseAsync(['list', '--page-size', '5', '--start-cursor', 'cur-1'], {
        from: 'user',
      })

      // Then
      expect(mockSearch).toHaveBeenCalledWith({
        filter: { property: 'object', value: 'database' },
        page_size: 5,
        start_cursor: 'cur-1',
      })
    })
  })
})
