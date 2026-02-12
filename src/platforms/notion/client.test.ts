import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { internalRequest } from './client'

let mockFetch: ReturnType<typeof mock>

afterEach(() => {
  mock.restore()
})

beforeEach(() => {
  mockFetch = mock((_url: string, _options: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
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
      cookie: 'token_v2=test_token_v2',
    })
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
    mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(responseData), { status: 200 }))
    )
    globalThis.fetch = mockFetch as any

    // When
    const result = await internalRequest('token', 'endpoint')

    // Then
    expect(result).toEqual(responseData)
  })

  test('throws on non-ok response with status code in message', async () => {
    // Given
    mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }))
    )
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
    mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }))
    )
    globalThis.fetch = mockFetch as any

    // When/Then
    expect(internalRequest('token', 'endpoint')).rejects.toThrow('Notion internal API error: 500')
  })

  test('throws on 401 status', async () => {
    // Given
    mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }))
    )
    globalThis.fetch = mockFetch as any

    // When/Then
    expect(internalRequest('token', 'endpoint')).rejects.toThrow('Notion internal API error: 401')
  })
})
