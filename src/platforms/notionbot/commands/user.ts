import { Command } from 'commander'
import { handleError } from '../../../shared/utils/error-handler'
import { formatOutput } from '../../../shared/utils/output'
import { getClient } from '../client'

async function listAction(options: { pageSize?: number; startCursor?: string; pretty?: boolean }): Promise<void> {
  try {
    const client = getClient()
    const response = await client.users.list({
      page_size: options.pageSize,
      start_cursor: options.startCursor,
    })

    const output = response.results.map((user: any) => ({
      id: user.id,
      name: user.name,
      type: user.type,
    }))

    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function getAction(userId: string, options: { pretty?: boolean }): Promise<void> {
  try {
    const client = getClient()
    const user = await client.users.retrieve({ user_id: userId })

    const output = {
      id: user.id,
      name: user.name,
      type: user.type,
    }

    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function meAction(options: { pretty?: boolean }): Promise<void> {
  try {
    const client = getClient()
    const me = await client.users.me({})

    const output = {
      id: me.id,
      name: me.name,
      type: me.type,
      workspace_name: me.type === 'bot' ? (me as any).bot?.workspace_name : undefined,
    }

    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

export const userCommand = new Command('user')
  .description('User commands')
  .addCommand(
    new Command('list')
      .description('List all users in workspace')
      .option('--page-size <n>', 'Number of users per page', (val) => parseInt(val, 10))
      .option('--start-cursor <cursor>', 'Pagination cursor')
      .option('--pretty', 'Pretty print JSON output')
      .action(listAction),
  )
  .addCommand(
    new Command('get')
      .description('Retrieve a specific user')
      .argument('<user_id>', 'User ID')
      .option('--pretty', 'Pretty print JSON output')
      .action(getAction),
  )
  .addCommand(
    new Command('me')
      .description('Get current bot/integration user info')
      .option('--pretty', 'Pretty print JSON output')
      .action(meAction),
  )
