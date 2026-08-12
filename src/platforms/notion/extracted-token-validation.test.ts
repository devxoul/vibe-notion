import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import { maskToken, validateCandidates, validateTokenV2, withStoredAccounts } from './extracted-token-validation'
import { BROWSER_USER_AGENT } from './request-headers'

let originalFetch: typeof fetch

beforeEach(() => {
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  mock.restore()
})

describe('extracted-token-validation', () => {
  test('validateTokenV2 sends a browser User-Agent so Cloudflare does not challenge the request', async () => {
    const fetchMock = mock(() => Promise.resolve({ ok: true })) as unknown as typeof fetch
    globalThis.fetch = fetchMock

    await validateTokenV2('some-token')

    const [, init] = (fetchMock as unknown as ReturnType<typeof mock>).mock.calls[0]
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(BROWSER_USER_AGENT)
  })

  test('validateCandidates keeps later valid candidates when earlier ones are stale', async () => {
    globalThis.fetch = mock((url: string, init?: RequestInit) => {
      const cookieHeader =
        init?.headers && 'cookie' in init.headers
          ? init.headers.cookie
          : init?.headers instanceof Headers
            ? init.headers.get('cookie')
            : undefined

      if (cookieHeader?.includes('stale-token')) {
        return Promise.resolve({ ok: false, status: 401 })
      }

      return Promise.resolve({ ok: true })
    }) as unknown as typeof fetch

    const result = await validateCandidates(
      [
        { token_v2: 'stale-token', user_id: 'user-stale' },
        { token_v2: 'fresh-token', user_id: 'user-fresh' },
      ],
      'app',
    )

    expect(result.extracted).toEqual({ token_v2: 'fresh-token', user_id: 'user-fresh' })
    expect(result.accounts).toEqual([{ token_v2: 'fresh-token', user_id: 'user-fresh' }])
    expect(result.errors).toEqual([
      `validateTokenV2: rejected extracted app token ${maskToken('stale-token')} with status 401`,
    ])
  })

  test('withStoredAccounts attaches accounts metadata only when multiple valid accounts remain', () => {
    expect(withStoredAccounts({ token_v2: 'one' }, [{ token_v2: 'one' }])).toEqual({ token_v2: 'one' })
    expect(
      withStoredAccounts({ token_v2: 'one', user_id: 'user-1' }, [
        { token_v2: 'one', user_id: 'user-1' },
        { token_v2: 'two', user_id: 'user-2' },
      ]),
    ).toEqual({
      token_v2: 'one',
      user_id: 'user-1',
      accounts: [
        { token_v2: 'one', user_id: 'user-1' },
        { token_v2: 'two', user_id: 'user-2' },
      ],
    })
  })

  test('validateTokenV2 throws on rejected responses', async () => {
    globalThis.fetch = mock(() => Promise.resolve({ ok: false, status: 403 })) as unknown as typeof fetch

    await expect(validateTokenV2('bad-token')).rejects.toThrow('Notion internal API error: 403')
  })
})
