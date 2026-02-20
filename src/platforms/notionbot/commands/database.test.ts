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
        url: 'https://notion.so/db-123',
        title: [{ plain_text: 'My Database' }],
        parent: { type: 'page_id', page_id: 'parent-1' },
        last_edited_time: '2024-01-01T00:00:00.000Z',
        properties: { Name: { id: 'title', type: 'title', title: {} } },
      })

      // When
      await databaseCommand.parseAsync(['get', 'db-123'], { from: 'user' })

      // Then
      expect(mockRetrieve).toHaveBeenCalledWith({ database_id: 'db-123' })
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('db-123')
      expect(output.title).toBe('My Database')
      expect(output.properties.Name).toEqual({ type: 'title' })
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
        results: [
          {
            id: 'page-1',
            object: 'page',
            url: 'https://notion.so/page-1',
            properties: { Name: { id: 'title', type: 'title', title: [{ plain_text: 'Item 1' }] } },
          },
        ],
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
      expect(output.results[0].title).toBe('Item 1')
    })

    test('queries database with filter, sort, page-size, and start-cursor', async () => {
      // Given
      const filter = JSON.stringify({ property: 'Status', select: { equals: 'Done' } })
      const sort = JSON.stringify([{ property: 'Created', direction: 'descending' }])
      mockRequest.mockResolvedValue({
        results: [
          {
            id: 'page-1',
            object: 'page',
            url: 'https://notion.so/page-1',
            properties: { Name: { id: 'title', type: 'title', title: [{ plain_text: 'Item 1' }] } },
          },
        ],
        has_more: false,
        next_cursor: null,
      })

      // When
      await databaseCommand.parseAsync(
        ['query', 'db-123', '--filter', filter, '--sort', sort, '--page-size', '10', '--start-cursor', 'abc'],
        { from: 'user' },
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
      mockRequest.mockResolvedValue({
        id: 'new-db-1',
        url: 'https://notion.so/new-db-1',
        title: [{ plain_text: 'Tasks' }],
        parent: { type: 'page_id', page_id: 'page-1' },
        last_edited_time: '2024-01-01T00:00:00.000Z',
        properties: {},
      })

      // When
      await databaseCommand.parseAsync(['create', '--parent', 'page-1', '--title', 'Tasks'], {
        from: 'user',
      })

      // Then — auto-adds Name title property when none provided
      expect(mockRequest).toHaveBeenCalledWith({
        path: 'databases',
        method: 'post',
        body: {
          parent: { type: 'page_id', page_id: 'page-1' },
          title: [{ type: 'text', text: { content: 'Tasks' } }],
          properties: { Name: { title: {} } },
        },
      })
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('new-db-1')
      expect(output.title).toBe('Tasks')
    })

    test('creates database with custom properties JSON', async () => {
      // Given — properties without title get Name prepended
      const properties = JSON.stringify({ Status: { select: { options: [{ name: 'Done' }] } } })
      mockRequest.mockResolvedValue({
        id: 'new-db-2',
        url: 'https://notion.so/new-db-2',
        title: [{ plain_text: 'Tasks' }],
        parent: { type: 'page_id', page_id: 'page-1' },
        last_edited_time: '2024-01-01T00:00:00.000Z',
        properties: {},
      })

      // When
      await databaseCommand.parseAsync(
        ['create', '--parent', 'page-1', '--title', 'Tasks', '--properties', properties],
        {
          from: 'user',
        },
      )

      // Then
      expect(mockRequest).toHaveBeenCalledWith({
        path: 'databases',
        method: 'post',
        body: {
          parent: { type: 'page_id', page_id: 'page-1' },
          title: [{ type: 'text', text: { content: 'Tasks' } }],
          properties: { Name: { title: {} }, Status: { select: { options: [{ name: 'Done' }] } } },
        },
      })
    })
  })

  describe('update', () => {
    test('updates database title', async () => {
      // Given
      mockRequest.mockResolvedValue({
        id: 'db-123',
        url: 'https://notion.so/db-123',
        title: [{ plain_text: 'Updated' }],
        parent: { type: 'page_id', page_id: 'parent-1' },
        last_edited_time: '2024-01-01T00:00:00.000Z',
        properties: {},
      })

      // When
      await databaseCommand.parseAsync(['update', 'db-123', '--title', 'Updated'], { from: 'user' })

      // Then
      expect(mockRequest).toHaveBeenCalledWith({
        path: 'databases/db-123',
        method: 'patch',
        body: {
          title: [{ type: 'text', text: { content: 'Updated' } }],
        },
      })
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('db-123')
      expect(output.title).toBe('Updated')
    })
  })

  describe('delete-property', () => {
    test('deletes property by name via PATCH with null value', async () => {
      // Given
      mockRequest.mockResolvedValue({
        id: 'db-123',
        url: 'https://notion.so/db-123',
        title: [{ plain_text: 'My Database' }],
        parent: { type: 'page_id', page_id: 'parent-1' },
        last_edited_time: '2024-01-01T00:00:00.000Z',
        properties: { Name: { id: 'title', type: 'title', title: {} } },
      })

      // When
      await databaseCommand.parseAsync(['delete-property', 'db-123', '--property', 'Status'], { from: 'user' })

      // Then
      expect(mockRequest).toHaveBeenCalledWith({
        path: 'databases/db-123',
        method: 'patch',
        body: {
          properties: { Status: null },
        },
      })
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('db-123')
    })

    test('handles error on delete failure', async () => {
      // Given
      mockRequest.mockRejectedValue(new Error('Property not found'))

      // When
      try {
        await databaseCommand.parseAsync(['delete-property', 'db-123', '--property', 'Missing'], { from: 'user' })
      } catch {
        // handleError calls process.exit
      }

      // Then
      const allOutput = [...consoleOutput, ...consoleErrors].join('\n')
      expect(allOutput).toContain('Property not found')
    })
  })

  describe('list', () => {
    test('lists databases via search', async () => {
      // Given
      mockSearch.mockResolvedValue({
        results: [
          { id: 'db-1', object: 'database', title: [{ plain_text: 'DB 1' }], url: 'https://notion.so/db-1' },
          { id: 'db-2', object: 'database', title: [{ plain_text: 'DB 2' }], url: 'https://notion.so/db-2' },
        ],
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
      expect(Array.isArray(output)).toBe(true)
      expect(output).toHaveLength(2)
      expect(output[0].title).toBe('DB 1')
    })

    test('lists databases with pagination params', async () => {
      // Given
      mockSearch.mockResolvedValue({
        results: [
          { id: 'db-1', object: 'database', title: [{ plain_text: 'DB 1' }], url: 'https://notion.so/db-1' },
          { id: 'db-2', object: 'database', title: [{ plain_text: 'DB 2' }], url: 'https://notion.so/db-2' },
        ],
        has_more: false,
        next_cursor: null,
      })

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
