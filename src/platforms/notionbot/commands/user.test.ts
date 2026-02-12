import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { userCommand } from './user'

describe('UserCommands', () => {
  let mockClient: any

  beforeEach(() => {
    mock(() => {
      throw new Error('process.exit called')
    })
    mock.module('../client', () => ({
      getClient: mock(() => mockClient),
    }))
  })

  test('user list returns array of users', async () => {
    // Given: A mock client with users list
    mockClient = {
      users: {
        list: mock(async () => ({
          results: [
            { id: 'user1', name: 'Alice', type: 'person' },
            { id: 'user2', name: 'Bot', type: 'bot' },
          ],
          next_cursor: null,
          has_more: false,
        })),
      },
    }

    // When: Listing users
    const output: string[] = []
    const originalLog = console.log
    console.log = mock((msg: string) => output.push(msg))

    try {
      await userCommand.parseAsync(['list'], { from: 'user' })
    } catch (_e) {
      // Expected if process.exit is called
    }

    console.log = originalLog

    // Then: Should output formatted user array
    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(2)
    expect(result[0].id).toBe('user1')
  })

  test('user get returns specific user', async () => {
    // Given: A mock client with user data
    mockClient = {
      users: {
        retrieve: mock(async () => ({
          id: 'user123',
          name: 'Alice',
          type: 'person',
        })),
      },
    }

    // When: Getting a specific user
    const output: string[] = []
    const originalLog = console.log
    console.log = mock((msg: string) => output.push(msg))

    try {
      await userCommand.parseAsync(['get', 'user123'], { from: 'user' })
    } catch (_e) {
      // Expected if process.exit is called
    }

    console.log = originalLog

    // Then: Should output formatted user object
    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('user123')
    expect(result.name).toBe('Alice')
  })

  test('user me returns current bot info', async () => {
    // Given: A mock client with bot info
    mockClient = {
      users: {
        me: mock(async () => ({
          id: 'bot123',
          name: 'MyBot',
          type: 'bot',
          bot: { workspace_name: 'My Workspace' },
        })),
      },
    }

    // When: Getting current user
    const output: string[] = []
    const originalLog = console.log
    console.log = mock((msg: string) => output.push(msg))

    try {
      await userCommand.parseAsync(['me'], { from: 'user' })
    } catch (_e) {
      // Expected if process.exit is called
    }

    console.log = originalLog

    // Then: Should output formatted bot object
    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.id).toBe('bot123')
    expect(result.type).toBe('bot')
  })

  test('user list with pagination params', async () => {
    // Given: A mock client that accepts pagination params
    mockClient = {
      users: {
        list: mock(async (params: any) => {
          expect(params.page_size).toBe(10)
          expect(params.start_cursor).toBe('cursor123')
          return {
            results: [{ id: 'user1', name: 'Alice', type: 'person' }],
            next_cursor: 'cursor456',
            has_more: true,
          }
        }),
      },
    }

    // When: Listing with pagination options
    const output: string[] = []
    const originalLog = console.log
    console.log = mock((msg: string) => output.push(msg))

    try {
      await userCommand.parseAsync(['list', '--page-size', '10', '--start-cursor', 'cursor123'], {
        from: 'user',
      })
    } catch (_e) {
      // Expected if process.exit is called
    }

    console.log = originalLog

    // Then: Should pass pagination params to API
    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(Array.isArray(result)).toBe(true)
  })
})
