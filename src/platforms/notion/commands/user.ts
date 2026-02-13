import { Command } from 'commander'
import { formatOutput } from '../../../shared/utils/output'
import { internalRequest } from '../client'
import { formatUserValue } from '../formatters'
import { type CommandOptions, getCredentialsOrExit, resolveAndSetActiveUserId } from './helpers'

type UserGetOptions = CommandOptions & { workspaceId: string }

type NotionUserValue = {
  id: string
  name?: string
  email?: string
  profile_photo?: string
  [key: string]: unknown
}

type UserRecord = {
  value: NotionUserValue
}

type SpaceValue = {
  id: string
  name?: string
  [key: string]: unknown
}

type SpaceRecord = {
  value: SpaceValue
}

type GetSpacesUserEntry = {
  notion_user?: Record<string, UserRecord>
  space?: Record<string, SpaceRecord>
  [key: string]: unknown
}

type GetSpacesResponse = Record<string, GetSpacesUserEntry>

type SyncRecordValuesResponse = {
  recordMap: {
    notion_user?: Record<string, UserRecord>
  }
}

async function getAction(userId: string, options: UserGetOptions): Promise<void> {
  try {
    const creds = await getCredentialsOrExit()
    await resolveAndSetActiveUserId(creds.token_v2, options.workspaceId)
    const response = (await internalRequest(creds.token_v2, 'syncRecordValues', {
      requests: [{ pointer: { table: 'notion_user', id: userId }, version: -1 }],
    })) as SyncRecordValuesResponse

    const user = Object.values(response.recordMap.notion_user ?? {})[0]?.value

    console.log(formatOutput(formatUserValue(user as Record<string, unknown>), options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

async function meAction(options: CommandOptions): Promise<void> {
  try {
    const creds = await getCredentialsOrExit()
    const response = (await internalRequest(creds.token_v2, 'getSpaces', {})) as GetSpacesResponse

    const accounts = Object.entries(response).map(([userId, entry]) => {
      const userRecord = entry.notion_user ? Object.values(entry.notion_user)[0] : undefined
      const spaces = Object.values(entry.space ?? {}).map((record) => ({
        id: record.value.id,
        name: record.value.name,
      }))

      return {
        id: userId,
        name: userRecord?.value.name,
        email: userRecord?.value.email,
        spaces,
      }
    })

    const output = accounts.length === 1 ? accounts[0] : accounts
    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

export const userCommand = new Command('user')
  .description('User commands')
  .addCommand(
    new Command('get')
      .description('Retrieve a specific user')
      .argument('<user_id>', 'User ID')
      .requiredOption('--workspace-id <id>', 'Workspace ID (use `workspace list` to find it)')
      .option('--pretty', 'Pretty print JSON output')
      .action(getAction),
  )
  .addCommand(
    new Command('me')
      .description('Get current user info')
      .option('--pretty', 'Pretty print JSON output')
      .action(meAction),
  )
