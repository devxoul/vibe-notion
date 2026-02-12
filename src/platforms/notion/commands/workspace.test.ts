import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

describe('WorkspaceCommand', () => {
  beforeEach(() => {
    mock.restore()
  })

  afterEach(() => {
    mock.restore()
  })

  test('workspace list returns workspaces from getSpaces response', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string) => {
      if (endpoint === 'getSpaces') {
        return {
          'user-1': {
            space: {
              'space-1': {
                value: {
                  id: 'space-1',
                  name: 'Personal',
                  icon: '🏠',
                  plan_type: 'personal',
                },
              },
              'space-2': {
                value: {
                  id: 'space-2',
                  name: 'Work',
                  icon: '💼',
                  plan_type: 'team',
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
      setActiveUserId: mock(),
      getActiveUserId: mock(),
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
    }))

    const { workspaceCommand } = await import('./workspace')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await workspaceCommand.parseAsync(['list'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(2)
    expect(result[0].id).toBe('space-1')
    expect(result[0].name).toBe('Personal')
    expect(result[0].icon).toBe('🏠')
    expect(result[0].plan_type).toBe('personal')
    expect(result[1].id).toBe('space-2')
    expect(result[1].name).toBe('Work')
  })

  test('workspace list deduplicates spaces across multiple users', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string) => {
      if (endpoint === 'getSpaces') {
        return {
          'user-1': {
            space: {
              'space-1': {
                value: { id: 'space-1', name: 'Shared Workspace' },
              },
            },
          },
          'user-2': {
            space: {
              'space-1': {
                value: { id: 'space-1', name: 'Shared Workspace' },
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
      setActiveUserId: mock(),
      getActiveUserId: mock(),
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
    }))

    const { workspaceCommand } = await import('./workspace')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await workspaceCommand.parseAsync(['list'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.length).toBe(1)
    expect(result[0].id).toBe('space-1')
    expect(result[0].name).toBe('Shared Workspace')
  })

  test('workspace list returns empty array when no spaces', async () => {
    const mockInternalRequest = mock(async (_tokenV2: string, endpoint: string) => {
      if (endpoint === 'getSpaces') {
        return {
          'user-1': {},
        }
      }
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
      setActiveUserId: mock(),
      getActiveUserId: mock(),
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
    }))

    const { workspaceCommand } = await import('./workspace')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await workspaceCommand.parseAsync(['list'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog

    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(0)
  })

  test('workspace list handles errors', async () => {
    const mockInternalRequest = mock(async () => {
      throw new Error('API error')
    })

    const mockGetCredentials = mock(async () => ({
      token_v2: 'test-token',
    }))

    mock.module('../client', () => ({
      internalRequest: mockInternalRequest,
      setActiveUserId: mock(),
      getActiveUserId: mock(),
    }))

    mock.module('./helpers', () => ({
      getCredentialsOrExit: mockGetCredentials,
      generateId: mock(() => 'mock-uuid'),
      resolveSpaceId: mock(async () => 'space-mock'),
      resolveCollectionViewId: mock(async () => 'view-mock'),
      resolveAndSetActiveUserId: mock(async () => {}),
    }))

    const { workspaceCommand } = await import('./workspace')
    const errorOutput: string[] = []
    const originalError = console.error
    console.error = (msg: string) => errorOutput.push(msg)

    let exitCode: number | undefined
    const originalExit = process.exit
    process.exit = ((code: number) => {
      exitCode = code
    }) as any

    try {
      await workspaceCommand.parseAsync(['list'], { from: 'user' })
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
