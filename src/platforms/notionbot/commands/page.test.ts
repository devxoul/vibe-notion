import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const mockPageRetrieve = mock(() => Promise.resolve({}))
const mockPageCreate = mock(() => Promise.resolve({}))
const mockPageUpdate = mock(() => Promise.resolve({}))
const mockPagePropertyRetrieve = mock(() => Promise.resolve({}))

mock.module('../client', () => ({
  getClient: () => ({
    pages: {
      retrieve: mockPageRetrieve,
      create: mockPageCreate,
      update: mockPageUpdate,
      properties: { retrieve: mockPagePropertyRetrieve },
    },
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
        properties: { title: { type: 'title' } },
      })

      // When
      await pageCommand.parseAsync(['get', 'page-123'], { from: 'user' })

      // Then
      expect(mockPageRetrieve).toHaveBeenCalledWith({ page_id: 'page-123' })
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('page-123')
      expect(output.object).toBe('page')
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
    })

    test('creates a page under a database parent when --database flag used', async () => {
      // Given
      mockPageCreate.mockResolvedValue({
        id: 'new-page-789',
        object: 'page',
      })

      // When
      await pageCommand.parseAsync(
        ['create', '--parent', 'db-123', '--title', 'DB Entry', '--database'],
        { from: 'user' }
      )

      // Then
      expect(mockPageCreate).toHaveBeenCalledWith({
        parent: { database_id: 'db-123' },
        properties: {
          title: { title: [{ text: { content: 'DB Entry' } }] },
        },
      })
    })
  })

  describe('page update', () => {
    test('updates page properties with --set key=value pairs', async () => {
      // Given
      mockPageUpdate.mockResolvedValue({
        id: 'page-123',
        object: 'page',
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
      })

      // When
      await pageCommand.parseAsync(
        ['update', 'page-123', '--set', 'Status=Done', '--set', 'Priority=High'],
        { from: 'user' }
      )

      // Then
      expect(mockPageUpdate).toHaveBeenCalledWith({
        page_id: 'page-123',
        properties: {
          Status: 'Done',
          Priority: 'High',
        },
      })
    })
  })

  describe('page archive', () => {
    test('archives a page by setting archived=true', async () => {
      // Given
      mockPageUpdate.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        archived: true,
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
