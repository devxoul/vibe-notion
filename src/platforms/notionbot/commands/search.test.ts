import { beforeEach, describe, expect, mock, test } from 'bun:test'

describe('SearchCommand', () => {
  beforeEach(() => {
    mock.restore()
  })

  test('search returns results with query', async () => {
    // Given: A mock client with search results
    const mockResults = [
      {
        id: 'page-1',
        object: 'page',
        title: [{ plain_text: 'Test Page' }],
        url: 'https://notion.so/test-page',
        last_edited_time: '2026-02-12T08:00:00.000Z',
      },
      {
        id: 'db-1',
        object: 'database',
        title: [{ plain_text: 'Test Database' }],
        url: 'https://notion.so/test-database',
        last_edited_time: '2026-02-12T07:00:00.000Z',
      },
    ]

    const mockClient = {
      search: mock(async () => ({
        results: mockResults,
        next_cursor: null,
        has_more: false,
      })),
    }

    mock.module('../client', () => ({
      getClient: () => mockClient,
    }))

    // When: Searching with a query
    const { searchCommand: cmd } = await import('./search')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await cmd.parseAsync(['test'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    // Then: Should return formatted results
    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(2)
    expect(result[0].id).toBe('page-1')
    expect(result[0].object).toBe('page')
  })

  test('search with page filter', async () => {
    // Given: A mock client with page filter
    const mockResults = [
      {
        id: 'page-1',
        object: 'page',
        title: [{ plain_text: 'Test Page' }],
        url: 'https://notion.so/test-page',
        last_edited_time: '2026-02-12T08:00:00.000Z',
      },
    ]

    const mockSearch = mock(async (params: any) => {
      expect(params.filter?.value).toBe('page')
      return {
        results: mockResults,
        next_cursor: null,
        has_more: false,
      }
    })

    const mockClient = {
      search: mockSearch,
    }

    mock.module('../client', () => ({
      getClient: () => mockClient,
    }))

    // When: Searching with page filter
    const { searchCommand: cmd } = await import('./search')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await cmd.parseAsync(['test', '--filter', 'page'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    // Then: Should pass filter to API
    expect(mockSearch.mock.calls.length).toBeGreaterThan(0)
  })

  test('search with database filter', async () => {
    // Given: A mock client with database filter
    const mockResults = [
      {
        id: 'db-1',
        object: 'database',
        title: [{ plain_text: 'Test Database' }],
        url: 'https://notion.so/test-database',
        last_edited_time: '2026-02-12T07:00:00.000Z',
      },
    ]

    const mockSearch = mock(async (params: any) => {
      expect(params.filter?.value).toBe('database')
      return {
        results: mockResults,
        next_cursor: null,
        has_more: false,
      }
    })

    const mockClient = {
      search: mockSearch,
    }

    mock.module('../client', () => ({
      getClient: () => mockClient,
    }))

    // When: Searching with database filter
    const { searchCommand: cmd } = await import('./search')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await cmd.parseAsync(['test', '--filter', 'database'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    // Then: Should pass filter to API
    expect(mockSearch.mock.calls.length).toBeGreaterThan(0)
  })

  test('search with sort ascending', async () => {
    // Given: A mock client with sort ascending
    const mockResults = [
      {
        id: 'page-1',
        object: 'page',
        title: [{ plain_text: 'Test Page' }],
        url: 'https://notion.so/test-page',
        last_edited_time: '2026-02-12T08:00:00.000Z',
      },
    ]

    const mockSearch = mock(async (params: any) => {
      expect(params.sort?.direction).toBe('ascending')
      expect(params.sort?.timestamp).toBe('last_edited_time')
      return {
        results: mockResults,
        next_cursor: null,
        has_more: false,
      }
    })

    const mockClient = {
      search: mockSearch,
    }

    mock.module('../client', () => ({
      getClient: () => mockClient,
    }))

    // When: Searching with sort ascending
    const { searchCommand: cmd } = await import('./search')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await cmd.parseAsync(['test', '--sort', 'asc'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    // Then: Should pass sort to API
    expect(mockSearch.mock.calls.length).toBeGreaterThan(0)
  })

  test('search with pagination', async () => {
    // Given: A mock client with pagination params
    const mockResults = [
      {
        id: 'page-1',
        object: 'page',
        title: [{ plain_text: 'Test Page' }],
        url: 'https://notion.so/test-page',
        last_edited_time: '2026-02-12T08:00:00.000Z',
      },
    ]

    const mockSearch = mock(async (params: any) => {
      expect(params.page_size).toBe(10)
      expect(params.start_cursor).toBe('cursor-123')
      return {
        results: mockResults,
        next_cursor: 'cursor-456',
        has_more: true,
      }
    })

    const mockClient = {
      search: mockSearch,
    }

    mock.module('../client', () => ({
      getClient: () => mockClient,
    }))

    // When: Searching with pagination
    const { searchCommand: cmd } = await import('./search')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await cmd.parseAsync(['test', '--page-size', '10', '--start-cursor', 'cursor-123'], {
        from: 'user',
      })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    // Then: Should pass pagination to API
    expect(mockSearch.mock.calls.length).toBeGreaterThan(0)
  })
})
