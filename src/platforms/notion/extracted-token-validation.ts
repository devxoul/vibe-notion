import { BROWSER_USER_AGENT } from '@/platforms/notion/request-headers'
import type { ExtractedToken } from '@/platforms/notion/token-extractor'

export type ExtractionOutcome = {
  extracted: ExtractedToken | null
  accounts: ExtractedToken[]
  errors: string[]
  source: 'app' | 'browser'
}

export class TokenValidationError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export function maskToken(token: string): string {
  if (token.length <= 10) {
    return '***'
  }

  return `${token.slice(0, 6)}...${token.slice(-4)}`
}

export async function validateTokenV2(tokenV2: string): Promise<void> {
  const response = await fetch('https://www.notion.so/api/v3/getSpaces', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': BROWSER_USER_AGENT,
      cookie: `token_v2=${tokenV2}`,
    },
    body: '{}',
  })

  if (!response.ok) {
    throw new TokenValidationError(response.status, `Notion internal API error: ${response.status}`)
  }
}

export function isInvalidTokenError(error: unknown): error is TokenValidationError {
  return error instanceof TokenValidationError && (error.status === 401 || error.status === 403)
}

export async function validateCandidates(
  candidates: ExtractedToken[],
  source: 'app' | 'browser',
): Promise<ExtractionOutcome> {
  const validAccounts: ExtractedToken[] = []
  const errors: string[] = []

  for (const candidate of candidates) {
    try {
      await validateTokenV2(candidate.token_v2)
      validAccounts.push(candidate)
    } catch (error) {
      if (!isInvalidTokenError(error)) {
        throw error
      }

      errors.push(
        `validateTokenV2: rejected extracted ${source} token ${maskToken(candidate.token_v2)} with status ${error.status}`,
      )
    }
  }

  return {
    extracted: validAccounts[0] ?? null,
    accounts: validAccounts,
    errors,
    source,
  }
}

export function withStoredAccounts(extracted: ExtractedToken, accounts: ExtractedToken[]): ExtractedToken {
  if (accounts.length <= 1) {
    return extracted
  }

  return {
    ...extracted,
    accounts,
  }
}

export function maskAccount(account: ExtractedToken): { token_v2: string; user_id?: string; user_ids?: string[] } {
  return {
    token_v2: maskToken(account.token_v2),
    user_id: account.user_id,
    user_ids: account.user_ids,
  }
}
