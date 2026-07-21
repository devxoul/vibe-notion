import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const MEMBER_SPACE = 'space-member'
const FOREIGN_SPACE = 'space-foreign'
const PUBLIC_PAGE_ID = '11111111-1111-1111-1111-111111111111'

// Exercises the real ensureWorkspaceContext -> action/handler ->
// resolveAndSetActiveUserId path; only the Notion network boundary
// (../client) and credential storage (../credential-manager) are mocked, so a
// provenance regression at the action-to-handler boundary is caught.
function mockBoundaries(getSpacesSpaceIds: string[]): void {
  mock.module('../client', () => {
    let activeUserId: string | undefined
    return {
      setActiveUserId: (id: string | undefined) => {
        activeUserId = id
      },
      getActiveUserId: () => activeUserId,
      setActiveSpaceId: () => {},
      getActiveSpaceId: () => undefined,
      internalRequest: async (_tokenV2: string, endpoint: string) => {
        if (endpoint === 'syncRecordValues') {
          return { recordMap: { block: { [PUBLIC_PAGE_ID]: { value: { space_id: FOREIGN_SPACE } } } } }
        }
        if (endpoint === 'getSpaces') {
          return {
            'user-1': { space: Object.fromEntries(getSpacesSpaceIds.map((id) => [id, {}])) },
          }
        }
        if (endpoint === 'loadPageChunk') {
          return {
            cursor: { stack: [] },
            recordMap: {
              block: {
                [PUBLIC_PAGE_ID]: { value: { id: PUBLIC_PAGE_ID, type: 'page', properties: { title: [['Public']] } } },
              },
            },
          }
        }
        return {}
      },
    }
  })

  mock.module('../credential-manager', () => ({
    getDefaultConfigDir: () => '/tmp/vibe-notion-test',
    CredentialManager: class {
      async getCredentials() {
        return { token_v2: 'test-token', user_id: 'user-1' }
      }
      async setCredentials() {}
    },
  }))
}

function captureStderr(): { warnings: string[]; restore: () => void } {
  const warnings: string[] = []
  const original = console.error
  console.error = ((...args: unknown[]) => {
    warnings.push(String(args[0]))
  }) as never
  return { warnings, restore: () => (console.error = original) }
}

async function runPageSubcommand(subcommand: 'get' | 'properties', args: string[]): Promise<void> {
  const { pageCommand } = await import('./page')
  await pageCommand.parseAsync(['node', 'vibe-notion', subcommand, PUBLIC_PAGE_ID, ...args])
}

describe('page command workspace warning provenance', () => {
  let logSpy: ReturnType<typeof mock>
  let originalLog: typeof console.log

  beforeEach(() => {
    mock.restore()
    originalLog = console.log
    logSpy = mock(() => {})
    console.log = logSpy as never
  })

  afterEach(() => {
    console.log = originalLog
    mock.restore()
  })

  for (const subcommand of ['get', 'properties'] as const) {
    test(`page ${subcommand} suppresses the missing-membership warning for an auto-resolved public target`, async () => {
      // Given: the target's space is not among the user's spaces, and no --workspace-id is passed
      mockBoundaries([MEMBER_SPACE])
      const stderr = captureStderr()

      // When
      try {
        await runPageSubcommand(subcommand, [])
      } finally {
        stderr.restore()
      }

      // Then
      expect(stderr.warnings.some((w) => w.includes('not found in your spaces'))).toBe(false)
    })

    test(`page ${subcommand} retains the warning for a wrong explicit --workspace-id`, async () => {
      // Given: an explicit workspace id the user does not belong to
      mockBoundaries([MEMBER_SPACE])
      const stderr = captureStderr()

      // When
      try {
        await runPageSubcommand(subcommand, ['--workspace-id', FOREIGN_SPACE])
      } finally {
        stderr.restore()
      }

      // Then
      expect(stderr.warnings.some((w) => w.includes('not found in your spaces'))).toBe(true)
    })
  }
})
