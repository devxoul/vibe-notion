import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import { getActiveSpaceId, getActiveUserId, internalRequest, setActiveSpaceId, setActiveUserId } from './client'
import { BROWSER_USER_AGENT } from './request-headers'

let mockFetch: ReturnType<typeof mock>
const originalFetch = globalThis.fetch

afterEach(() => {
  mock.restore()
  globalThis.fetch = originalFetch
  setActiveUserId(undefined)
  setActiveSpaceId(undefined)
})

beforeEach(() => {
  mockFetch = mock((_url: string, _options: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 })),
  )
  globalThis.fetch = mockFetch as any
})

describe('internalRequest', () => {
  test('sends POST to correct URL with token cookie', async () => {
    // When
    await internalRequest('test_token_v2', 'testEndpoint')

    // Then
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://www.notion.so/api/v3/testEndpoint')
    expect(options.method).toBe('POST')
    expect(options.headers).toEqual({
      'Content-Type': 'application/json',
      'User-Agent': BROWSER_USER_AGENT,
      cookie: 'token_v2=test_token_v2',
    })
  })

  test('sends a browser User-Agent so Cloudflare does not challenge the request', async () => {
    // When
    await internalRequest('test_token_v2', 'testEndpoint')

    // Then
    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers['User-Agent']).toBe(BROWSER_USER_AGENT)
    expect(options.headers['User-Agent']).toContain('Mozilla/5.0')
  })

  test('passes body as JSON', async () => {
    // Given
    const body = { key: 'value', nested: { prop: 123 } }

    // When
    await internalRequest('token', 'endpoint', body)

    // Then
    const [, options] = mockFetch.mock.calls[0]
    expect(options.body).toBe(JSON.stringify(body))
  })

  test('returns parsed JSON on success', async () => {
    // Given
    const responseData = { result: 'success', data: [1, 2, 3] }
    mockFetch = mock(() => Promise.resolve(new Response(JSON.stringify(responseData), { status: 200 })))
    globalThis.fetch = mockFetch as any

    // When
    const result = await internalRequest('token', 'endpoint')

    // Then
    expect(result).toEqual(responseData)
  })

  test('throws on non-ok response with status code in message', async () => {
    // Given
    mockFetch = mock(() => Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })))
    globalThis.fetch = mockFetch as any

    // When/Then
    expect(internalRequest('token', 'endpoint')).rejects.toThrow('Notion internal API error: 404')
  })

  test('sends correct Content-Type header', async () => {
    // When
    await internalRequest('token', 'endpoint')

    // Then
    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers).toHaveProperty('Content-Type', 'application/json')
  })

  test('uses empty object as default body', async () => {
    // When
    await internalRequest('token', 'endpoint')

    // Then
    const [, options] = mockFetch.mock.calls[0]
    expect(options.body).toBe(JSON.stringify({}))
  })

  test('throws on 500 status', async () => {
    // Given
    mockFetch = mock(() => Promise.resolve(new Response(JSON.stringify({ error: 'Server error' }), { status: 500 })))
    globalThis.fetch = mockFetch as any

    // When/Then
    expect(internalRequest('token', 'endpoint')).rejects.toThrow('Notion internal API error: 500')
  })

  test('throws on 401 status', async () => {
    // Given
    mockFetch = mock(() => Promise.resolve(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })))
    globalThis.fetch = mockFetch as any

    // When/Then
    expect(internalRequest('token', 'endpoint')).rejects.toThrow('Notion internal API error: 401')
  })

  describe('multi-account header logic', () => {
    test('includes x-notion-active-user-header when activeUserId is set', async () => {
      // Given
      setActiveUserId('user123')

      // When
      await internalRequest('test_token_v2', 'testEndpoint')

      // Then
      const [, options] = mockFetch.mock.calls[0]
      expect(options.headers).toHaveProperty('x-notion-active-user-header', 'user123')
    })

    test('appends notion_user_id to cookie when activeUserId is set', async () => {
      // Given
      setActiveUserId('user456')

      // When
      await internalRequest('test_token_v2', 'testEndpoint')

      // Then
      const [, options] = mockFetch.mock.calls[0]
      expect(options.headers.cookie).toBe('token_v2=test_token_v2; notion_user_id=user456')
    })

    test('does not include x-notion-active-user-header when activeUserId is not set', async () => {
      // When
      await internalRequest('test_token_v2', 'testEndpoint')

      // Then
      const [, options] = mockFetch.mock.calls[0]
      expect(options.headers).not.toHaveProperty('x-notion-active-user-header')
    })

    test('cookie is only token_v2 when activeUserId is not set', async () => {
      // When
      await internalRequest('test_token_v2', 'testEndpoint')

      // Then
      const [, options] = mockFetch.mock.calls[0]
      expect(options.headers.cookie).toBe('token_v2=test_token_v2')
    })

    test('includes x-notion-space-id when activeSpaceId is set', async () => {
      // Given
      setActiveSpaceId('space-abc')

      // When
      await internalRequest('test_token_v2', 'testEndpoint')

      // Then
      const [, options] = mockFetch.mock.calls[0]
      expect(options.headers).toHaveProperty('x-notion-space-id', 'space-abc')
    })

    test('does not include x-notion-space-id when activeSpaceId is not set', async () => {
      // When
      await internalRequest('test_token_v2', 'testEndpoint')

      // Then
      const [, options] = mockFetch.mock.calls[0]
      expect(options.headers).not.toHaveProperty('x-notion-space-id')
    })
  })
})

describe('setActiveUserId / getActiveUserId', () => {
  test('getActiveUserId returns undefined by default', () => {
    // When
    const result = getActiveUserId()

    // Then
    expect(result).toBeUndefined()
  })

  test('setActiveUserId sets the user ID', () => {
    // When
    setActiveUserId('user789')

    // Then
    expect(getActiveUserId()).toBe('user789')
  })

  test('setActiveUserId with undefined clears the user ID', () => {
    // Given
    setActiveUserId('user789')

    // When
    setActiveUserId(undefined)

    // Then
    expect(getActiveUserId()).toBeUndefined()
  })

  test('setActiveUserId overwrites previous value', () => {
    // Given
    setActiveUserId('user1')

    // When
    setActiveUserId('user2')

    // Then
    expect(getActiveUserId()).toBe('user2')
  })
})

describe('setActiveSpaceId / getActiveSpaceId', () => {
  test('getActiveSpaceId returns undefined by default', () => {
    // When
    const result = getActiveSpaceId()

    // Then
    expect(result).toBeUndefined()
  })

  test('setActiveSpaceId sets the space ID', () => {
    // When
    setActiveSpaceId('space789')

    // Then
    expect(getActiveSpaceId()).toBe('space789')
  })

  test('setActiveSpaceId with undefined clears the space ID', () => {
    // Given
    setActiveSpaceId('space789')

    // When
    setActiveSpaceId(undefined)

    // Then
    expect(getActiveSpaceId()).toBeUndefined()
  })

  test('setActiveSpaceId overwrites previous value', () => {
    // Given
    setActiveSpaceId('space1')

    // When
    setActiveSpaceId('space2')

    // Then
    expect(getActiveSpaceId()).toBe('space2')
  })
})

describe('401 auto-recovery', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('retries with fresh token when re-extraction returns different token', async () => {
    // Given
    const mockSetCredentials = mock(() => Promise.resolve())
    mock.module('@/platforms/notion/token-extractor', () => ({
      TokenExtractor: class {
        extract = mock(() => Promise.resolve({ token_v2: 'fresh_token', user_id: 'user-1' }))
        getNotionDir = () => '/fake'
      },
    }))
    mock.module('@/platforms/notion/credential-manager', () => ({
      CredentialManager: class {
        setCredentials = mockSetCredentials
      },
    }))

    let callCount = 0
    globalThis.fetch = mock(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ recovered: true }), { status: 200 }))
    }) as any

    const { internalRequest: req } = await import('./client')

    // When
    const result = await req('stale_token', 'endpoint', { key: 'value' })

    // Then
    expect(result).toEqual({ recovered: true })
    expect(callCount).toBe(2)
    const secondCall = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock.calls[1]
    expect(secondCall[1].headers.cookie).toBe('token_v2=fresh_token')
  })

  test('throws original error when re-extraction returns same token', async () => {
    // Given
    mock.module('@/platforms/notion/token-extractor', () => ({
      TokenExtractor: class {
        extract = mock(() => Promise.resolve({ token_v2: 'same_token' }))
        getNotionDir = () => '/fake'
      },
    }))
    mock.module('@/platforms/notion/credential-manager', () => ({
      CredentialManager: class {
        setCredentials = mock(() => Promise.resolve())
      },
    }))

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })),
    ) as any

    const { internalRequest: req } = await import('./client')

    // When/Then
    await expect(req('same_token', 'endpoint')).rejects.toThrow('Notion internal API error: 401')
  })

  test('throws original error when re-extraction fails', async () => {
    // Given
    mock.module('@/platforms/notion/token-extractor', () => ({
      TokenExtractor: class {
        extract = mock(() => Promise.reject(new Error('No Notion directory')))
        getNotionDir = () => '/fake'
      },
    }))
    mock.module('@/platforms/notion/credential-manager', () => ({
      CredentialManager: class {
        setCredentials = mock(() => Promise.resolve())
      },
    }))

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })),
    ) as any

    const { internalRequest: req } = await import('./client')

    // When/Then
    await expect(req('stale_token', 'endpoint')).rejects.toThrow('Notion internal API error: 401')
  })

  test('throws retry error when fresh token also gets rejected', async () => {
    // Given
    mock.module('@/platforms/notion/token-extractor', () => ({
      TokenExtractor: class {
        extract = mock(() => Promise.resolve({ token_v2: 'fresh_but_bad', user_id: 'u1' }))
        getNotionDir = () => '/fake'
      },
    }))
    mock.module('@/platforms/notion/credential-manager', () => ({
      CredentialManager: class {
        setCredentials = mock(() => Promise.resolve())
      },
    }))

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })),
    ) as any

    const { internalRequest: req } = await import('./client')

    // When/Then
    await expect(req('stale_token', 'endpoint')).rejects.toThrow('Notion internal API error: 403')
  })

  test('persists fresh credentials on successful recovery', async () => {
    // Given
    const mockSetCredentials = mock(() => Promise.resolve())
    mock.module('@/platforms/notion/token-extractor', () => ({
      TokenExtractor: class {
        extract = mock(() => Promise.resolve({ token_v2: 'fresh_token', user_id: 'user-1' }))
        getNotionDir = () => '/fake'
      },
    }))
    mock.module('@/platforms/notion/credential-manager', () => ({
      CredentialManager: class {
        setCredentials = mockSetCredentials
      },
    }))

    let callCount = 0
    globalThis.fetch = mock(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    }) as any

    const { internalRequest: req } = await import('./client')

    // When
    await req('stale_token', 'endpoint')

    // Then
    expect(mockSetCredentials).toHaveBeenCalledWith({ token_v2: 'fresh_token', user_id: 'user-1' })
  })

  test('does not retry on non-401/non-429 errors', async () => {
    // Given
    mock.module('@/platforms/notion/token-extractor', () => ({
      TokenExtractor: class {
        extract = mock(() => Promise.resolve({ token_v2: 'fresh_token' }))
        getNotionDir = () => '/fake'
      },
    }))
    mock.module('@/platforms/notion/credential-manager', () => ({
      CredentialManager: class {
        setCredentials = mock(() => Promise.resolve())
      },
    }))

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Server error' }), { status: 500 })),
    ) as any

    const { internalRequest: req } = await import('./client')

    // When/Then
    await expect(req('token', 'endpoint')).rejects.toThrow('Notion internal API error: 500')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  test('returns null from re-extraction when extract returns null', async () => {
    // Given
    mock.module('@/platforms/notion/token-extractor', () => ({
      TokenExtractor: class {
        extract = mock(() => Promise.resolve(null))
        getNotionDir = () => '/fake'
      },
    }))
    mock.module('@/platforms/notion/credential-manager', () => ({
      CredentialManager: class {
        setCredentials = mock(() => Promise.resolve())
      },
    }))

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })),
    ) as any

    const { internalRequest: req } = await import('./client')

    // When/Then
    await expect(req('stale_token', 'endpoint')).rejects.toThrow('Notion internal API error: 401')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })
})

describe('429 rate limit retry', () => {
  beforeEach(() => {
    mock.module('@/shared/utils/delay', () => ({
      delay: mock(() => Promise.resolve()),
    }))
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('retries on 429 and succeeds on subsequent attempt', async () => {
    // Given
    let callCount = 0
    globalThis.fetch = mock(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve(new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    }) as any

    const { internalRequest: req } = await import('./client')

    // When
    const result = await req('token', 'endpoint')

    // Then
    expect(result).toEqual({ ok: true })
    expect(callCount).toBe(2)
  })

  test('retries up to 3 times on consecutive 429 responses', async () => {
    // Given
    let callCount = 0
    globalThis.fetch = mock(() => {
      callCount++
      if (callCount <= 3) {
        return Promise.resolve(new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ recovered: true }), { status: 200 }))
    }) as any

    const { internalRequest: req } = await import('./client')

    // When
    const result = await req('token', 'endpoint')

    // Then
    expect(result).toEqual({ recovered: true })
    expect(callCount).toBe(4)
  })

  test('throws after exhausting all 429 retries', async () => {
    // Given
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 })),
    ) as any

    const { internalRequest: req } = await import('./client')

    // When/Then
    await expect(req('token', 'endpoint')).rejects.toThrow('429')
  })

  test('falls back to exponential backoff on malformed retry-after header', async () => {
    // Given
    let callCount = 0
    globalThis.fetch = mock(() => {
      callCount++
      if (callCount === 1) {
        const headers = new Headers({ 'retry-after': 'invalid' })
        return Promise.resolve(new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429, headers }))
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    }) as any

    const { internalRequest: req } = await import('./client')

    // When
    const result = await req('token', 'endpoint')

    // Then
    expect(result).toEqual({ ok: true })
    expect(callCount).toBe(2)
  })
})
