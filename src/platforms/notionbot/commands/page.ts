import { Command } from 'commander'
import { handleError } from '../../../shared/utils/error-handler'
import { formatNotionId } from '../../../shared/utils/id'
import { formatOutput } from '../../../shared/utils/output'
import { getClient } from '../client'
import { formatPage } from '../formatters'

async function getAction(rawPageId: string, options: { pretty?: boolean }): Promise<void> {
  const pageId = formatNotionId(rawPageId)
  try {
    const client = getClient()
    const page = await client.pages.retrieve({ page_id: pageId })
    console.log(formatOutput(formatPage(page as Record<string, unknown>), options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function createAction(options: {
  parent: string
  title: string
  database?: boolean
  pretty?: boolean
}): Promise<void> {
  const parentId = formatNotionId(options.parent)
  try {
    const client = getClient()
    const parent = options.database ? { database_id: parentId } : { page_id: parentId }

    const page = await client.pages.create({
      parent,
      properties: {
        title: { title: [{ text: { content: options.title } }] },
      },
    })
    console.log(formatOutput(formatPage(page as Record<string, unknown>), options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

function parsePropertyPair(value: string, previous: Record<string, string>): Record<string, string> {
  const eqIndex = value.indexOf('=')
  if (eqIndex === -1) {
    throw new Error(`Invalid property format: "${value}". Expected key=value`)
  }
  const key = value.slice(0, eqIndex)
  const val = value.slice(eqIndex + 1)
  return { ...previous, [key]: val }
}

async function updateAction(
  rawPageId: string,
  options: { set: Record<string, string>; pretty?: boolean },
): Promise<void> {
  const pageId = formatNotionId(rawPageId)
  try {
    const client = getClient()
    const page = await client.pages.update({
      page_id: pageId,
      properties: options.set as any,
    })
    console.log(formatOutput(formatPage(page as Record<string, unknown>), options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function archiveAction(rawPageId: string, options: { pretty?: boolean }): Promise<void> {
  const pageId = formatNotionId(rawPageId)
  try {
    const client = getClient()
    const page = await client.pages.update({
      page_id: pageId,
      archived: true,
    })
    console.log(formatOutput(formatPage(page as Record<string, unknown>), options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

async function propertyAction(rawPageId: string, propertyId: string, options: { pretty?: boolean }): Promise<void> {
  const pageId = formatNotionId(rawPageId)
  try {
    const client = getClient()
    const property = await client.pages.properties.retrieve({
      page_id: pageId,
      property_id: propertyId,
    })
    console.log(formatOutput(property, options.pretty))
  } catch (error) {
    handleError(error as Error)
  }
}

export const pageCommand = new Command('page')
  .description('Page commands')
  .addCommand(
    new Command('get')
      .description('Retrieve a page')
      .argument('<page_id>', 'Page ID')
      .option('--pretty', 'Pretty print JSON output')
      .action(getAction),
  )
  .addCommand(
    new Command('create')
      .description('Create a new page')
      .requiredOption('--parent <parent_id>', 'Parent page or database ID')
      .requiredOption('--title <title>', 'Page title')
      .option('--database', 'Parent is a database (default: page)')
      .option('--pretty', 'Pretty print JSON output')
      .action(createAction),
  )
  .addCommand(
    new Command('update')
      .description('Update page properties')
      .argument('<page_id>', 'Page ID')
      .option('--set <property=value>', 'Set a property value (repeatable)', parsePropertyPair, {})
      .option('--pretty', 'Pretty print JSON output')
      .action(updateAction),
  )
  .addCommand(
    new Command('archive')
      .description('Archive a page')
      .argument('<page_id>', 'Page ID')
      .option('--pretty', 'Pretty print JSON output')
      .action(archiveAction),
  )
  .addCommand(
    new Command('property')
      .description('Retrieve a specific page property')
      .argument('<page_id>', 'Page ID')
      .argument('<property_id>', 'Property ID')
      .option('--pretty', 'Pretty print JSON output')
      .action(propertyAction),
  )
