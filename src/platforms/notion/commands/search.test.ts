import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

describe('SearchCommand', () => {
  beforeEach(() => {
    mock.restore()
  })

  afterEach(() => {
    mock.restore()
  })

  test('search with query and auto-resolves space ID', async () => {
    const mockInternalRequest = mock(async (tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'getSpaces') {
        return {
          'user-1': {
            space: {
              'space-123': {},
            },
          },
        }
      }
      if (endpoint === 'search') {
        return {
          results: [
            {
              id: 'page-1',
              highlight: { title: 'Test Page' },
              score: 0.95,
              spaceId: 'space-123',
            },
          ],
          total: 1,
        }
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
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
    }))

    const { searchCommand } = await import('./search')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await searchCommand.parseAsync(['test query'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.results).toBeDefined()
    expect(result.results.length).toBe(1)
    expect(result.results[0].id).toBe('page-1')
    expect(result.results[0].title).toBe('Test Page')
    expect(result.results[0].score).toBe(0.95)
    expect(result.results[0].spaceId).toBe('space-123')
  })

  test('search with explicit workspace-id', async () => {
    const mockInternalRequest = mock(async (tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'search') {
        expect(body.spaceId).toBe('space-456')
        return {
          results: [
            {
              id: 'page-2',
              highlight: { title: 'Another Page' },
              score: 0.85,
              spaceId: 'space-456',
            },
          ],
          total: 1,
        }
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
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
    }))

    const { searchCommand } = await import('./search')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await searchCommand.parseAsync(['test query', '--workspace-id', 'space-456'], {
        from: 'user',
      })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.results[0].spaceId).toBe('space-456')
  })

  test('search passes limit option', async () => {
    const mockInternalRequest = mock(async (tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'getSpaces') {
        return {
          'user-1': {
            space: {
              'space-123': {},
            },
          },
        }
      }
      if (endpoint === 'search') {
        expect(body.limit).toBe(50)
        return {
          results: [],
          total: 0,
        }
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
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
    }))

    const { searchCommand } = await import('./search')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await searchCommand.parseAsync(['test query', '--limit', '50'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(mockInternalRequest.mock.calls.length).toBeGreaterThan(0)
  })

  test('search handles errors', async () => {
    const mockInternalRequest = mock(async (tokenV2: string, endpoint: string) => {
      if (endpoint === 'getSpaces') {
        return {
          'user-1': {
            space: {
              'space-123': {},
            },
          },
        }
      }
      throw new Error('API error')
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
    }))

    const { searchCommand } = await import('./search')
    const errorOutput: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errorOutput.push(msg)

    let exitCode: number | undefined
    const originalExit = process.exit
    process.exit = ((code: number) => {
      exitCode = code
    }) as any

    try {
      await searchCommand.parseAsync(['test query'], { from: 'user' })
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
})
