import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const mockPageRetrieve = mock(() => Promise.resolve({}))
const mockPageCreate = mock(() => Promise.resolve({}))
const mockPageUpdate = mock(() => Promise.resolve({}))
const mockPagePropertyRetrieve = mock(() => Promise.resolve({}))
const mockAppendBlockChildren = mock(() => Promise.resolve([{ results: [] }] as any))
const mockBlockChildrenList = mock(() => Promise.resolve({ results: [], has_more: false, next_cursor: null }))
const mockBlockDelete = mock(() => Promise.resolve({}))

mock.module('../client', () => ({
  getClient: () => ({
    pages: {
      retrieve: mockPageRetrieve,
      create: mockPageCreate,
      update: mockPageUpdate,
      properties: { retrieve: mockPagePropertyRetrieve },
    },
    blocks: {
      children: { list: mockBlockChildrenList },
      delete: mockBlockDelete,
    },
    appendBlockChildren: mockAppendBlockChildren,
  }),
}))

const { pageCommand } = await import('./page')

describe('page commands', () => {
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

    mockPageRetrieve.mockReset()
    mockPageCreate.mockReset()
    mockPageUpdate.mockReset()
    mockPagePropertyRetrieve.mockReset()
    mockAppendBlockChildren.mockReset()
    mockBlockChildrenList.mockReset()
    mockBlockDelete.mockReset()
  })

  afterEach(() => {
    console.log = originalLog
    console.error = originalError
    process.exit = originalExit
  })

  describe('page get', () => {
    test('retrieves a page by id', async () => {
      // Given
      mockPageRetrieve.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {
          Name: { id: 'title', type: 'title', title: [{ plain_text: 'Test Page' }] },
        },
      })

      // When
      await pageCommand.parseAsync(['get', 'page-123'], { from: 'user' })

      // Then
      expect(mockPageRetrieve).toHaveBeenCalledWith({ page_id: 'page-123' })
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('page-123')
      expect(output.title).toBe('Test Page')
      expect(output.url).toBe('https://notion.so/page-123')
      expect(output.properties.Name).toBe('Test Page')
    })

    test('handles not found error with sharing hint', async () => {
      // Given
      const error = new Error('Could not find page')
      ;(error as any).code = 'object_not_found'
      mockPageRetrieve.mockRejectedValue(error)

      // When
      try {
        await pageCommand.parseAsync(['get', 'not-found-id'], { from: 'user' })
      } catch {
        // handleError calls process.exit which our mock throws
      }

      // Then
      const allOutput = [...consoleOutput, ...consoleErrors].join('\n')
      expect(allOutput).toContain('Could not find page')
    })
  })

  describe('page create', () => {
    test('creates a page under a page parent with title', async () => {
      // Given
      mockPageCreate.mockResolvedValue({
        id: 'new-page-456',
        object: 'page',
        url: 'https://notion.so/new-page-456',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-123' },
        properties: {
          title: { id: 'title', type: 'title', title: [{ plain_text: 'My Page' }] },
        },
      })

      // When
      await pageCommand.parseAsync(['create', '--parent', 'parent-123', '--title', 'My Page'], {
        from: 'user',
      })

      // Then
      expect(mockPageCreate).toHaveBeenCalledWith({
        parent: { page_id: 'parent-123' },
        properties: {
          title: { title: [{ text: { content: 'My Page' } }] },
        },
      })
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('new-page-456')
      expect(output.title).toBe('My Page')
    })

    test('creates a page under a database parent when --database flag used', async () => {
      // Given
      mockPageCreate.mockResolvedValue({
        id: 'new-page-789',
        object: 'page',
        url: 'https://notion.so/new-page-789',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'database_id', database_id: 'db-123' },
        properties: {
          Name: { id: 'title', type: 'title', title: [{ plain_text: 'DB Entry' }] },
        },
      })

      // When
      await pageCommand.parseAsync(['create', '--parent', 'db-123', '--title', 'DB Entry', '--database'], {
        from: 'user',
      })

      // Then
      expect(mockPageCreate).toHaveBeenCalledWith({
        parent: { database_id: 'db-123' },
        properties: {
          title: { title: [{ text: { content: 'DB Entry' } }] },
        },
      })
    })

    test('creates a page with markdown content appended', async () => {
      // Given
      mockPageCreate.mockResolvedValue({
        id: 'new-page-md',
        object: 'page',
        url: 'https://notion.so/new-page-md',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-123' },
        properties: {
          title: { id: 'title', type: 'title', title: [{ plain_text: 'Page with Markdown' }] },
        },
      })
      mockAppendBlockChildren.mockResolvedValue([{ results: [] }] as any)

      // When
      await pageCommand.parseAsync(
        ['create', '--parent', 'parent-123', '--title', 'Page with Markdown', '--markdown', '# Hello\n\nWorld'],
        { from: 'user' },
      )

      // Then
      expect(mockPageCreate).toHaveBeenCalledWith({
        parent: { page_id: 'parent-123' },
        properties: {
          title: { title: [{ text: { content: 'Page with Markdown' } }] },
        },
      })
      expect(mockAppendBlockChildren).toHaveBeenCalled()
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('new-page-md')
      expect(output.title).toBe('Page with Markdown')
    })
  })

  describe('page update', () => {
    test('updates page properties with --set key=value pairs', async () => {
      // Given
      mockPageUpdate.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {},
      })
      mockPageRetrieve.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {},
      })

      // When
      await pageCommand.parseAsync(['update', 'page-123', '--set', 'Status=Done'], {
        from: 'user',
      })

      // Then
      expect(mockPageUpdate).toHaveBeenCalledWith({
        page_id: 'page-123',
        properties: {
          Status: 'Done',
        },
      })
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('page-123')
    })

    test('handles multiple --set flags', async () => {
      // Given
      mockPageUpdate.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {},
      })
      mockPageRetrieve.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {},
      })

      // When
      await pageCommand.parseAsync(['update', 'page-123', '--set', 'Status=Done', '--set', 'Priority=High'], {
        from: 'user',
      })

      // Then
      expect(mockPageUpdate).toHaveBeenCalledWith({
        page_id: 'page-123',
        properties: {
          Status: 'Done',
          Priority: 'High',
        },
      })
    })

    test('replace-content deletes old blocks and appends new markdown', async () => {
      // Given
      mockBlockChildrenList.mockResolvedValue({
        results: [{ id: 'old-block-1' }, { id: 'old-block-2' }],
        has_more: false,
        next_cursor: null,
      } as any)
      mockBlockDelete.mockResolvedValue({})
      mockAppendBlockChildren.mockResolvedValue([{ results: [] }] as any)
      mockPageRetrieve.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {
          Name: { id: 'title', type: 'title', title: [{ plain_text: 'Test Page' }] },
        },
      })

      // When
      await pageCommand.parseAsync(['update', 'page-123', '--replace-content', '--markdown', '# New Content'], {
        from: 'user',
      })

      // Then
      expect(mockBlockChildrenList).toHaveBeenCalled()
      expect(mockBlockDelete).toHaveBeenCalledTimes(2)
      expect(mockBlockDelete).toHaveBeenCalledWith({ block_id: 'old-block-1' })
      expect(mockBlockDelete).toHaveBeenCalledWith({ block_id: 'old-block-2' })
      expect(mockAppendBlockChildren).toHaveBeenCalled()
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('page-123')
    })

    test('replace-content without --markdown errors', async () => {
      // When
      try {
        await pageCommand.parseAsync(['update', 'page-123', '--replace-content'], { from: 'user' })
      } catch {}

      // Then
      const allOutput = [...consoleOutput, ...consoleErrors].join('\n')
      expect(allOutput).toContain('--replace-content requires --markdown or --markdown-file')
    })

    test('append failure after delete shows clear error', async () => {
      // Given
      mockBlockChildrenList.mockResolvedValue({
        results: [{ id: 'old-block-1' }],
        has_more: false,
        next_cursor: null,
      } as any)
      mockBlockDelete.mockResolvedValue({})
      mockAppendBlockChildren.mockRejectedValue(new Error('API rate limit'))

      // When
      try {
        await pageCommand.parseAsync(['update', 'page-123', '--replace-content', '--markdown', '# New Content'], {
          from: 'user',
        })
      } catch {}

      // Then
      const allOutput = [...consoleOutput, ...consoleErrors].join('\n')
      expect(allOutput).toContain('Page content cleared but new content failed to append')
    })
  })

  describe('page archive', () => {
    test('archives a page by setting archived=true', async () => {
      // Given
      mockPageUpdate.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: true,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {},
      })

      // When
      await pageCommand.parseAsync(['archive', 'page-123'], { from: 'user' })

      // Then
      expect(mockPageUpdate).toHaveBeenCalledWith({
        page_id: 'page-123',
        archived: true,
      })
      const output = JSON.parse(consoleOutput[0])
      expect(output.archived).toBe(true)
    })
  })

  describe('page property', () => {
    test('retrieves a specific page property', async () => {
      // Given
      mockPagePropertyRetrieve.mockResolvedValue({
        object: 'property_item',
        type: 'title',
        title: { plain_text: 'Hello' },
      })

      // When
      await pageCommand.parseAsync(['property', 'page-123', 'title-prop-id'], { from: 'user' })

      // Then
      expect(mockPagePropertyRetrieve).toHaveBeenCalledWith({
        page_id: 'page-123',
        property_id: 'title-prop-id',
      })
      const output = JSON.parse(consoleOutput[0])
      expect(output.type).toBe('title')
    })
  })
})
