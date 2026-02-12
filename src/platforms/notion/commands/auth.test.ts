import { beforeEach, describe, expect, mock, test } from 'bun:test'

let mockExtract: ReturnType<typeof mock>
let mockSetCredentials: ReturnType<typeof mock>
let mockGetCredentials: ReturnType<typeof mock>
let mockRemove: ReturnType<typeof mock>
let mockFetch: ReturnType<typeof mock>
let mockExit: ReturnType<typeof mock>
let consoleLogMock: ReturnType<typeof mock>
let consoleErrorMock: ReturnType<typeof mock>

beforeEach(() => {
  mockExtract = mock(() => Promise.resolve({ token_v2: 'v02%3Atest-token', user_id: 'user-1' }))
  mockSetCredentials = mock(() => Promise.resolve())
  mockGetCredentials = mock(() =>
    Promise.resolve({ token_v2: 'v02%3Atest-token', user_id: 'user-1' })
  )
  mockRemove = mock(() => Promise.resolve())
  mockFetch = mock(() => Promise.resolve({ ok: true }))
  mockExit = mock(() => {
    throw new Error('process.exit called')
  })
  consoleLogMock = mock(() => {})
  consoleErrorMock = mock(() => {})

  mock.module('../token-extractor', () => ({
    TokenExtractor: class {
      getNotionDir = () => '/tmp/notion'
      extract = mockExtract
    },
  }))

  mock.module('../credential-manager', () => ({
    CredentialManager: class {
      setCredentials = mockSetCredentials
      getCredentials = mockGetCredentials
      remove = mockRemove
    },
  }))

  globalThis.fetch = mockFetch as unknown as typeof fetch
  process.exit = mockExit as any
  console.log = consoleLogMock as any
  console.error = consoleErrorMock as any
})

describe('auth status', () => {
  test('outputs stored credentials with masked token', async () => {
    // Given
    mockGetCredentials = mock(() =>
      Promise.resolve({ token_v2: 'v02%3Atest-token', user_id: 'user-1' })
    )
    mock.module('../credential-manager', () => ({
      CredentialManager: class {
        setCredentials = mockSetCredentials
        getCredentials = mockGetCredentials
        remove = mockRemove
      },
    }))

    const { authCommand } = await import('./auth')

    // When
    await authCommand.parseAsync(['status'], { from: 'user' })

    // Then
    expect(consoleLogMock).toHaveBeenCalled()
    const output = consoleLogMock.mock.calls[0]?.[0]
    expect(output).toContain('v02%3A')
    expect(output).toContain('...')
  })

  test('outputs null when no credentials stored', async () => {
    // Given
    mockGetCredentials = mock(() => Promise.resolve(null))
    mock.module('../credential-manager', () => ({
      CredentialManager: class {
        setCredentials = mockSetCredentials
        getCredentials = mockGetCredentials
        remove = mockRemove
      },
    }))

    const { authCommand } = await import('./auth')

    // When
    await authCommand.parseAsync(['status'], { from: 'user' })

    // Then
    expect(consoleLogMock).toHaveBeenCalled()
    const output = consoleLogMock.mock.calls[0]?.[0]
    expect(output).toContain('null')
  })
})

describe('auth logout', () => {
  test('calls remove and outputs success', async () => {
    // Given
    mockRemove = mock(() => Promise.resolve())
    mock.module('../credential-manager', () => ({
      CredentialManager: class {
        setCredentials = mockSetCredentials
        getCredentials = mockGetCredentials
        remove = mockRemove
      },
    }))

    const { authCommand } = await import('./auth')

    // When
    await authCommand.parseAsync(['logout'], { from: 'user' })

    // Then
    expect(mockRemove).toHaveBeenCalled()
    expect(consoleLogMock).toHaveBeenCalled()
    const output = consoleLogMock.mock.calls[0]?.[0]
    expect(output).toContain('success')
  })
})

describe('auth extract', () => {
  test('extracts token, validates via fetch, stores credentials, outputs masked token', async () => {
    // Given
    mockExtract = mock(() =>
      Promise.resolve({ token_v2: 'v02%3Atest-token-long', user_id: 'user-1' })
    )
    mockSetCredentials = mock(() => Promise.resolve())
    mockFetch = mock(() => Promise.resolve({ ok: true }))

    mock.module('../token-extractor', () => ({
      TokenExtractor: class {
        getNotionDir = () => '/tmp/notion'
        extract = mockExtract
      },
    }))

    mock.module('../credential-manager', () => ({
      CredentialManager: class {
        setCredentials = mockSetCredentials
        getCredentials = mockGetCredentials
        remove = mockRemove
      },
    }))

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const { authCommand } = await import('./auth')

    // When
    await authCommand.parseAsync(['extract'], { from: 'user' })

    // Then
    expect(mockExtract).toHaveBeenCalled()
    expect(mockFetch).toHaveBeenCalled()
    expect(mockSetCredentials).toHaveBeenCalledWith({
      token_v2: 'v02%3Atest-token-long',
      user_id: 'user-1',
    })
    expect(consoleLogMock).toHaveBeenCalled()
  })

  test('outputs error when no token found', async () => {
    // Given
    mockExtract = mock(() => Promise.resolve(null))
    mock.module('../token-extractor', () => ({
      TokenExtractor: class {
        getNotionDir = () => '/tmp/notion'
        extract = mockExtract
      },
    }))

    const { authCommand } = await import('./auth')

    // When
    try {
      await authCommand.parseAsync(['extract'], { from: 'user' })
    } catch {
      // Expected to throw
    }

    // Then
    expect(consoleLogMock).toHaveBeenCalled()
  })
})
