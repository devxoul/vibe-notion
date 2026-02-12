import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const mockUsersMe = mock(() =>
  Promise.resolve({
    id: 'bot-123',
    type: 'bot',
    name: 'Test Integration',
    bot: {
      owner: { type: 'workspace', workspace: true },
      workspace_name: 'Test Workspace',
    },
  })
)

mock.module('../client', () => ({
  getClient: () => ({ users: { me: mockUsersMe } }),
}))

const { authCommand } = await import('./auth')

describe('auth status command', () => {
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

    mockUsersMe.mockReset()
  })

  afterEach(() => {
    console.log = originalLog
    console.error = originalError
    process.exit = originalExit
  })

  test('outputs bot info when token is valid', async () => {
    // Given
    mockUsersMe.mockResolvedValue({
      id: 'bot-123',
      type: 'bot',
      name: 'Test Integration',
      bot: {
        owner: { type: 'workspace', workspace: true },
        workspace_name: 'Test Workspace',
      },
    })

    // When
    await authCommand.parseAsync(['status'], { from: 'user' })

    // Then
    const output = consoleOutput.join('\n')
    expect(output).toContain('bot-123')
    expect(output).toContain('Test Integration')
    expect(output).toContain('Test Workspace')
  })

  test('does not include stored_token_v2 in output', async () => {
    // Given
    mockUsersMe.mockResolvedValue({
      id: 'bot-123',
      type: 'bot',
      name: 'Test Integration',
      bot: { owner: { type: 'workspace', workspace: true }, workspace_name: 'Test Workspace' },
    })

    // When
    await authCommand.parseAsync(['status'], { from: 'user' })

    // Then
    const output = consoleOutput.join('\n')
    expect(output).not.toContain('stored_token_v2')
    expect(output).not.toContain('token_v2')
  })

  test('exits with error when users.me fails (missing token)', async () => {
    // Given
    mockUsersMe.mockRejectedValue(
      new Error(
        'NOTION_TOKEN is required. Create an integration at https://www.notion.so/profile/integrations'
      )
    )

    // When
    try {
      await authCommand.parseAsync(['status'], { from: 'user' })
    } catch {
      // handleError calls process.exit which our mock throws
    }

    // Then
    const allOutput = [...consoleOutput, ...consoleErrors].join('\n')
    expect(allOutput).toContain('NOTION_TOKEN')
    expect(allOutput).toContain('notion.so/profile/integrations')
  })

  test('handles API error from users.me', async () => {
    // Given
    mockUsersMe.mockRejectedValue(new Error('Unauthorized'))

    // When
    try {
      await authCommand.parseAsync(['status'], { from: 'user' })
    } catch {
      // handleError calls process.exit which our mock throws
    }

    // Then
    const allOutput = [...consoleOutput, ...consoleErrors].join('\n')
    expect(allOutput).toContain('Unauthorized')
  })
})
