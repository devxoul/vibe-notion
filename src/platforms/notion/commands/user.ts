import { Command } from 'commander'
import { formatOutput } from '../../../shared/utils/output'
import { internalRequest } from '../client'
import { type CommandOptions, getCredentialsOrExit } from './helpers'

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

type LoadUserContentResponse = {
  recordMap: {
    notion_user?: Record<string, UserRecord>
    space?: Record<string, SpaceRecord>
  }
}

async function listAction(options: CommandOptions): Promise<void> {
  try {
    const creds = await getCredentialsOrExit()
    const response = (await internalRequest(creds.token_v2, 'getSpaces', {})) as GetSpacesResponse

    const firstUserId = Object.keys(response)[0]
    const notionUsers = firstUserId ? response[firstUserId]?.notion_user : undefined

    const output = Object.values(notionUsers ?? {}).map((record) => {
      const user = record.value
      return {
        id: user.id,
        name: user.name,
        email: user.email,
      }
    })

    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

async function getAction(userId: string, options: CommandOptions): Promise<void> {
  try {
    const creds = await getCredentialsOrExit()
    const response = (await internalRequest(creds.token_v2, 'syncRecordValues', {
      requests: [{ pointer: { table: 'notion_user', id: userId }, version: -1 }],
    })) as SyncRecordValuesResponse

    const user = Object.values(response.recordMap.notion_user ?? {})[0]?.value

    console.log(formatOutput(user, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

async function meAction(options: CommandOptions): Promise<void> {
  try {
    const creds = await getCredentialsOrExit()
    const response = (await internalRequest(creds.token_v2, 'loadUserContent', {})) as LoadUserContentResponse

    const currentUser = Object.values(response.recordMap.notion_user ?? {})[0]?.value
    const spaces = Object.values(response.recordMap.space ?? {}).map((record) => {
      const space = record.value
      return {
        id: space.id,
        name: space.name,
      }
    })

    const output = {
      id: currentUser?.id,
      name: currentUser?.name,
      email: currentUser?.email,
      spaces,
    }

    console.log(formatOutput(output, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

export const userCommand = new Command('user')
  .description('User commands')
  .addCommand(
    new Command('list')
      .description('List users in workspace')
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
      .description('Get current user info')
      .option('--pretty', 'Pretty print JSON output')
      .action(meAction),
  )
