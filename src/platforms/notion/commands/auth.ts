import { Command } from 'commander'
import { formatOutput } from '../../../shared/utils/output'
import { CredentialManager } from '../credential-manager'
import { TokenExtractor } from '../token-extractor'

type CommandOptions = { pretty?: boolean; debug?: boolean }

function maskToken(token: string): string {
  if (token.length <= 10) {
    return '***'
  }
  return `${token.slice(0, 6)}...${token.slice(-4)}`
}

async function validateTokenV2(tokenV2: string): Promise<void> {
  const response = await fetch('https://www.notion.so/api/v3/getSpaces', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `token_v2=${tokenV2}`,
    },
    body: '{}',
  })

  if (!response.ok) {
    throw new Error(`Notion internal API error: ${response.status}`)
  }
}

async function extractAction(options: CommandOptions): Promise<void> {
  try {
    const extractor = new TokenExtractor()

    if (process.platform === 'darwin') {
      console.log('')
      console.log('  Extracting your Notion credentials...')
      console.log('')
      console.log('  Your Mac may ask for your password to access Keychain.')
      console.log('  This is required because Notion encrypts your login cookies')
      console.log('  using macOS Keychain for security.')
      console.log('')
      console.log('  What happens:')
      console.log("    1. We read the encrypted cookie from Notion's local storage")
      console.log('    2. macOS Keychain decrypts it (requires your password)')
      console.log('    3. The token is stored locally in ~/.config/agent-notion/')
      console.log('')
      console.log('  Your password is never stored or transmitted anywhere.')
      console.log('')
    }

    if (options.debug) {
      console.error(`[debug] Notion directory: ${extractor.getNotionDir()}`)
    }

    const extracted = await extractor.extract()
    if (!extracted) {
      console.log(
        formatOutput(
          {
            error: 'No token_v2 found. Make sure Notion desktop app is installed and logged in.',
            hint: options.debug ? undefined : 'Run with --debug for more info.',
          },
          options.pretty,
        ),
      )
      process.exit(1)
    }

    if (options.debug) {
      console.error(`[debug] token_v2 extracted: ${maskToken(extracted.token_v2)}`)
    }

    await validateTokenV2(extracted.token_v2)

    const manager = new CredentialManager()
    await manager.setCredentials(extracted)

    console.log(
      formatOutput(
        {
          token_v2: maskToken(extracted.token_v2),
          user_id: extracted.user_id,
          valid: true,
        },
        options.pretty,
      ),
    )
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

async function logoutAction(options: CommandOptions): Promise<void> {
  try {
    const manager = new CredentialManager()
    await manager.remove()
    console.log(formatOutput({ success: true }, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

async function statusAction(options: CommandOptions): Promise<void> {
  try {
    const manager = new CredentialManager()
    const stored = await manager.getCredentials()

    const output = {
      stored_token_v2: stored
        ? {
            token_v2: maskToken(stored.token_v2),
            user_id: stored.user_id,
          }
        : null,
    }

    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

export const authCommand = new Command('auth')
  .description('Authentication commands')
  .addCommand(
    new Command('extract')
      .description('Extract token_v2 from Notion desktop app')
      .option('--pretty', 'Pretty print JSON output')
      .option('--debug', 'Show debug output for troubleshooting')
      .action(extractAction),
  )
  .addCommand(
    new Command('logout')
      .description('Remove locally stored token_v2 credentials')
      .option('--pretty', 'Pretty print JSON output')
      .action(logoutAction),
  )
  .addCommand(
    new Command('status')
      .description('Show stored credential status')
      .option('--pretty', 'Pretty print JSON output')
      .action(statusAction),
  )
