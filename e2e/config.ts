// E2E Test Environment Configuration
// Hardcoded IDs for the notionbot test workspace

export const NOTIONBOT_E2E_PAGE_ID = '305c0fcf-90b3-802a-aebc-db1e05bb6926'
export const NOTIONBOT_WORKSPACE_NAME = 'Agent Notion'
export const NOTIONBOT_BOT_ID = '98cf032f-d67b-457b-b2b3-2063f1cf5c68'
export const NOTIONBOT_KNOWN_USER_ID = '562f9c80-1b28-46e2-85f8-91227533d192'

export async function validateNotionBotEnvironment() {
  const { runCLI, parseJSON } = await import('./helpers')

  // Check if token is set
  if (!process.env.E2E_NOTIONBOT_TOKEN) {
    throw new Error(
      'E2E_NOTIONBOT_TOKEN environment variable is not set. ' +
      'Please set your Notion integration token: export E2E_NOTIONBOT_TOKEN=your_token_here'
    )
  }

  // Check auth status
  const result = await runCLI(['auth', 'status'])
  if (result.exitCode !== 0) {
    throw new Error(
      'Notion authentication failed. ' +
      'Please verify your E2E_NOTIONBOT_TOKEN is valid. ' +
      `Error: ${result.stderr || result.stdout}`
    )
  }

  // Parse and validate workspace name
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
