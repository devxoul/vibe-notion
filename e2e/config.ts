// E2E Test Environment Configuration

// ── notionbot (official API) ────────────────────────────────────────────

export const NOTIONBOT_E2E_PAGE_ID = '305c0fcf-90b3-802a-aebc-db1e05bb6926'
export const NOTIONBOT_WORKSPACE_NAME = 'Vibe Notion'
export const NOTIONBOT_BOT_ID = '98cf032f-d67b-457b-b2b3-2063f1cf5c68'
export const NOTIONBOT_KNOWN_USER_ID = '562f9c80-1b28-46e2-85f8-91227533d192'

export async function validateNotionBotEnvironment() {
  const { runCLI, parseJSON } = await import('./helpers')

  if (!process.env.E2E_NOTIONBOT_TOKEN) {
    throw new Error(
      'E2E_NOTIONBOT_TOKEN environment variable is not set. ' +
      'Please set your Notion integration token: export E2E_NOTIONBOT_TOKEN=your_token_here'
    )
  }

  const result = await runCLI(['auth', 'status'])
  if (result.exitCode !== 0) {
    throw new Error(
      'Notion authentication failed. ' +
      'Please verify your E2E_NOTIONBOT_TOKEN is valid. ' +
      `Error: ${result.stderr || result.stdout}`
    )
  }

  const data = parseJSON<{ integration: { workspace_name?: string } }>(result.stdout)
  if (!data?.integration?.workspace_name) {
    throw new Error(
      'Failed to parse auth status response. ' +
      `Got: ${result.stdout}`
    )
  }

  if (data.integration.workspace_name !== NOTIONBOT_WORKSPACE_NAME) {
    throw new Error(
      `Wrong Notion workspace. Expected: ${NOTIONBOT_WORKSPACE_NAME}, ` +
      `Got: ${data.integration.workspace_name}. ` +
      'Please ensure your token is for the correct workspace.'
    )
  }
}

// ── notion (internal API) ───────────────────────────────────────────────

export const NOTION_E2E_PAGE_ID = '305c0fcf-90b3-802a-aebc-db1e05bb6926'

export async function validateNotionEnvironment(): Promise<string> {
  const { runNotionCLI, parseJSON } = await import('./helpers')

  const result = await runNotionCLI(['auth', 'status'])
  if (result.exitCode !== 0) {
    throw new Error(
      'Notion auth status failed. ' +
      'Please run `vibe-notion auth extract` first to store credentials. ' +
      `Error: ${result.stderr || result.stdout}`
    )
  }

  const data = parseJSON<{ stored_token_v2: { token_v2: string; user_id?: string } | null }>(result.stdout)
  if (!data?.stored_token_v2) {
    throw new Error(
      'No stored credentials found. ' +
      'Please run `vibe-notion auth extract` to extract token_v2 from the Notion desktop app.'
    )
  }

  const wsResult = await runNotionCLI(['workspace', 'list'])
  if (wsResult.exitCode !== 0) {
    throw new Error(
      'Failed to list workspaces. ' +
      `Error: ${wsResult.stderr || wsResult.stdout}`
    )
  }

  const workspaces = parseJSON<Array<{ id: string; name?: string }>>(wsResult.stdout)
  if (!workspaces || workspaces.length === 0) {
    throw new Error('No workspaces found. Please ensure your Notion account has at least one workspace.')
  }

  return workspaces[0].id
}
