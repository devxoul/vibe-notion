import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

describe('UserCommand', () => {
  beforeEach(() => {
    mock.restore()
  })

  afterEach(() => {
    mock.restore()
  })

  test('user list returns users from getSpaces response', async () => {
    const mockInternalRequest = mock(async (tokenV2: string, endpoint: string) => {
      if (endpoint === 'getSpaces') {
        return {
          'user-1': {
            notion_user: {
              'user-id-1': {
                value: {
                  id: 'user-id-1',
                  name: 'Alice',
                  email: 'alice@example.com',
                },
              },
              'user-id-2': {
                value: {
                  id: 'user-id-2',
                  name: 'Bob',
                  email: 'bob@example.com',
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
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
    }))

    const { userCommand } = await import('./user')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await userCommand.parseAsync(['list'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(2)
    expect(result[0].id).toBe('user-id-1')
    expect(result[0].name).toBe('Alice')
    expect(result[0].email).toBe('alice@example.com')
    expect(result[1].id).toBe('user-id-2')
    expect(result[1].name).toBe('Bob')
  })

  test('user get returns specific user from syncRecordValues', async () => {
    const mockInternalRequest = mock(async (tokenV2: string, endpoint: string, body: any) => {
      if (endpoint === 'syncRecordValues') {
        expect(body.requests[0].pointer.table).toBe('notion_user')
        expect(body.requests[0].pointer.id).toBe('user-id-123')
        return {
          recordMap: {
            notion_user: {
              'user-id-123': {
                value: {
                  id: 'user-id-123',
                  name: 'Charlie',
                  email: 'charlie@example.com',
                  profile_photo: 'https://example.com/photo.jpg',
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
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
    }))

    const { userCommand } = await import('./user')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await userCommand.parseAsync(['get', 'user-id-123'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('user-id-123')
    expect(result.name).toBe('Charlie')
    expect(result.email).toBe('charlie@example.com')
    expect(result.profile_photo).toBe('https://example.com/photo.jpg')
  })

  test('user me returns current user with spaces from loadUserContent', async () => {
    const mockInternalRequest = mock(async (tokenV2: string, endpoint: string) => {
      if (endpoint === 'loadUserContent') {
        return {
          recordMap: {
            notion_user: {
              'current-user-id': {
                value: {
                  id: 'current-user-id',
                  name: 'Current User',
                  email: 'current@example.com',
                },
              },
            },
            space: {
              'space-1': {
                value: {
                  id: 'space-1',
                  name: 'Personal',
                },
              },
              'space-2': {
                value: {
                  id: 'space-2',
                  name: 'Work',
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
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
    }))

    const { userCommand } = await import('./user')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await userCommand.parseAsync(['me'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('current-user-id')
    expect(result.name).toBe('Current User')
    expect(result.email).toBe('current@example.com')
    expect(Array.isArray(result.spaces)).toBe(true)
    expect(result.spaces.length).toBe(2)
    expect(result.spaces[0].id).toBe('space-1')
    expect(result.spaces[0].name).toBe('Personal')
    expect(result.spaces[1].id).toBe('space-2')
    expect(result.spaces[1].name).toBe('Work')
  })

  test('user list handles errors', async () => {
    const mockInternalRequest = mock(async () => {
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

    const { userCommand } = await import('./user')
    const errorOutput: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errorOutput.push(msg)

    let exitCode: number | undefined
    const originalExit = process.exit
    process.exit = ((code: number) => {
      exitCode = code
    }) as any

    try {
      await userCommand.parseAsync(['list'], { from: 'user' })
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

  test('user get handles errors', async () => {
    const mockInternalRequest = mock(async () => {
      throw new Error('User not found')
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

    const { userCommand } = await import('./user')
    const errorOutput: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errorOutput.push(msg)

    let exitCode: number | undefined
    const originalExit = process.exit
    process.exit = ((code: number) => {
      exitCode = code
    }) as any

    try {
      await userCommand.parseAsync(['get', 'invalid-id'], { from: 'user' })
    } catch {
      // Expected
    }

    console.error = originalError
    process.exit = originalExit

    expect(errorOutput.length).toBeGreaterThan(0)
    const errorMsg = JSON.parse(errorOutput[0])
    expect(errorMsg.error).toBe('User not found')
    expect(exitCode).toBe(1)
  })

  test('user me handles errors', async () => {
    const mockInternalRequest = mock(async () => {
      throw new Error('Failed to load user content')
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

    const { userCommand } = await import('./user')
    const errorOutput: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errorOutput.push(msg)

    let exitCode: number | undefined
    const originalExit = process.exit
    process.exit = ((code: number) => {
      exitCode = code
    }) as any

    try {
      await userCommand.parseAsync(['me'], { from: 'user' })
    } catch {
      // Expected
    }

    console.error = originalError
    process.exit = originalExit

    expect(errorOutput.length).toBeGreaterThan(0)
    const errorMsg = JSON.parse(errorOutput[0])
    expect(errorMsg.error).toBe('Failed to load user content')
    expect(exitCode).toBe(1)
  })
})
