import { Command } from 'commander'
import { getClient } from '@/platforms/notionbot/client'
import { handleError } from '@/shared/utils/error-handler'
import { formatOutput } from '@/shared/utils/output'

type CommandOptions = { pretty?: boolean }

type BotUser = {
  id: string
  name: string | null
  type: string
  bot?: { workspace_name?: string }
}

async function statusAction(options: CommandOptions): Promise<void> {
  try {
    const client = getClient()
    const me = (await client.users.me({})) as BotUser

    const output = {
      integration: {
        id: me.id,
        name: me.name,
        type: me.type,
        workspace_name: me.type === 'bot' ? me.bot?.workspace_name : undefined,
      },
    }

    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

export const authCommand = new Command('auth')
  .description('Authentication commands')
  .addCommand(
    new Command('status')
      .description('Show authentication status by calling users.me()')
      .option('--pretty', 'Pretty print JSON output')
      .action(statusAction),
  )
