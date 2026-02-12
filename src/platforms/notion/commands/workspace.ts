import { Command } from 'commander'
import { formatOutput } from '../../../shared/utils/output'
import { internalRequest } from '../client'
import { type CommandOptions, getCredentialsOrExit } from './helpers'

type SpaceValue = {
  id: string
  name?: string
  icon?: string
  plan_type?: string
  created_time?: number
  [key: string]: unknown
}

type SpaceRecord = {
  value: SpaceValue
}

type GetSpacesUserEntry = {
  space?: Record<string, SpaceRecord>
  [key: string]: unknown
}

type GetSpacesResponse = Record<string, GetSpacesUserEntry>

async function listAction(options: CommandOptions): Promise<void> {
  try {
    const creds = await getCredentialsOrExit()
    const response = (await internalRequest(creds.token_v2, 'getSpaces', {})) as GetSpacesResponse

    const seen = new Set<string>()
    const workspaces: { id: string; name?: string; icon?: string; plan_type?: string }[] = []

    for (const entry of Object.values(response)) {
      for (const record of Object.values(entry.space ?? {})) {
        const space = record.value
        if (seen.has(space.id)) continue
        seen.add(space.id)
        workspaces.push({
          id: space.id,
          name: space.name,
          icon: space.icon,
          plan_type: space.plan_type,
        })
      }
    }

    console.log(formatOutput(workspaces, options.pretty))
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }))
    process.exit(1)
  }
}

export const workspaceCommand = new Command('workspace')
  .description('Workspace commands')
  .addCommand(
    new Command('list')
      .description('List workspaces accessible to current user')
      .option('--pretty', 'Pretty print JSON output')
      .action(listAction),
  )
