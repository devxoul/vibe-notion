import { CredentialManager } from '@/platforms/notion/credential-manager'
import { BROWSER_USER_AGENT } from '@/platforms/notion/request-headers'
import { TokenExtractor } from '@/platforms/notion/token-extractor'
import { delay } from '@/shared/utils/delay'

let activeUserId: string | undefined
let activeSpaceId: string | undefined

export function setActiveUserId(userId: string | undefined): void {
  activeUserId = userId
}

export function getActiveUserId(): string | undefined {
  return activeUserId
}

export function setActiveSpaceId(spaceId: string | undefined): void {
  activeSpaceId = spaceId
}

export function getActiveSpaceId(): string | undefined {
  return activeSpaceId
}

async function doRequest(tokenV2: string, endpoint: string, body: Record<string, unknown>): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': BROWSER_USER_AGENT,
    cookie: `token_v2=${tokenV2}`,
  }

  if (activeUserId) {
    headers['x-notion-active-user-header'] = activeUserId
    headers.cookie += `; notion_user_id=${activeUserId}`
  }

  if (activeSpaceId) {
    headers['x-notion-space-id'] = activeSpaceId
  }

  return fetch(`https://www.notion.so/api/v3/${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function buildErrorMessage(status: number, detail: string): string {
  const suffix = detail ? `: ${detail}` : ''
  return `Notion internal API error: ${status}${suffix}`
}

async function extractResponseDetail(response: Response): Promise<string> {
  try {
    const text = await response.text()
    if (text) {
      try {
        const json = JSON.parse(text)
        return json.message || json.msg || json.error || ''
      } catch {
        return text
      }
    }
  } catch {
    // could not read response body
  }
  return ''
}

async function tryReExtractToken(staleToken: string): Promise<string | null> {
  try {
    const extractor = new TokenExtractor()
    const extracted = await extractor.extract()
    if (!extracted || extracted.token_v2 === staleToken) {
      return null
    }

    const manager = new CredentialManager()
    await manager.setCredentials(extracted)
    return extracted.token_v2
  } catch {
    return null
  }
}

const MAX_RATE_LIMIT_RETRIES = 3
const RATE_LIMIT_BASE_DELAY_MS = 1000

export async function internalRequest(
  tokenV2: string,
  endpoint: string,
  body: Record<string, unknown> = {},
): Promise<unknown> {
  let currentToken = tokenV2

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    const response = await doRequest(currentToken, endpoint, body)

    if (response.ok) {
      return response.json()
    }

    // On 429, retry with exponential backoff
    if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfter = response.headers.get('retry-after')
      const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN
      const delayMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt
      await delay(delayMs)
      continue
    }

    // On 401, attempt token re-extraction and retry once
    if (response.status === 401) {
      const freshToken = await tryReExtractToken(currentToken)
      if (freshToken) {
        currentToken = freshToken
        const retryResponse = await doRequest(currentToken, endpoint, body)
        if (retryResponse.ok) {
          return retryResponse.json()
        }
        const retryDetail = await extractResponseDetail(retryResponse)
        throw new Error(buildErrorMessage(retryResponse.status, retryDetail))
      }
    }

    const detail = await extractResponseDetail(response)
    throw new Error(buildErrorMessage(response.status, detail))
  }

  throw new Error(`Notion internal API error: 429: Rate limited after ${MAX_RATE_LIMIT_RETRIES} retries`)
}
