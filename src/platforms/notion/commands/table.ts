import { Command } from 'commander'

import { internalRequest } from '@/platforms/notion/client'
import { extractTableColumnOrder } from '@/platforms/notion/formatters'
import { handleNotionError } from '@/shared/utils/error-handler'
import { formatNotionId } from '@/shared/utils/id'
import { formatOutput } from '@/shared/utils/output'

import {
  type CommandOptions,
  ensureWorkspaceContext,
  generateId,
  getCredentialsOrExit,
  resolveAndSetActiveUserId,
  resolveSpaceId,
} from './helpers'

type WorkspaceOptions = CommandOptions & { workspaceId?: string }

type BlockValue = {
  id: string
  type: string
  content?: string[]
  format?: Record<string, unknown>
  properties?: Record<string, unknown>
  parent_id?: string
  space_id?: string
  [key: string]: unknown
}

type BlockRecord = {
  value?: BlockValue
}

type SyncRecordValuesResponse = {
  recordMap: {
    block: Record<string, BlockRecord>
  }
}

type SaveOperation = {
  pointer: {
    table: 'block'
    id: string
    spaceId: string
  }
  command: 'set' | 'listAfter' | 'listBefore' | 'listRemove' | 'update' | 'updateBlockPropertyValue'
  path: string[]
  args: Record<string, unknown> | unknown[][]
}

type SaveTransactionsRequest = {
  requestId: string
  transactions: Array<{
    id: string
    spaceId: string
    operations: SaveOperation[]
  }>
}

type CreateOptions = WorkspaceOptions & {
  headers: string
  rows?: string
  after?: string
  before?: string
}

type AddRowOptions = WorkspaceOptions & {
  cells: string
}

type UpdateCellOptions = WorkspaceOptions & {
  row: string
  col: string
  value: string
}

type DeleteRowOptions = WorkspaceOptions & {
  row: string
}

function generateColumnId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let key = ''
  for (let i = 0; i < 4; i++) {
    key += chars[Math.floor(Math.random() * chars.length)]
  }
  return key
}

function parseCsvCells(input: string): string[] {
  return input.split(',').map((part) => part.trim())
}

function parseRowsJson(raw: string): string[][] {
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('--rows must be a JSON array of arrays')
  }
  return parsed.map((row, index) => {
    if (!Array.isArray(row)) {
      throw new Error(`Row at index ${index} must be an array`)
    }
    return row.map((cell) => String(cell ?? ''))
  })
}

function parseIndex(raw: string, label: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid --${label} index: ${raw}`)
  }
  return Number(raw)
}

function buildTableRowProperties(columnIds: string[], cells: string[]): Record<string, unknown[][]> {
  if (cells.length > columnIds.length) {
    throw new Error(`Too many cells: got ${cells.length}, expected at most ${columnIds.length}`)
  }
  const properties: Record<string, unknown[][]> = {}
  for (let i = 0; i < columnIds.length; i++) {
    properties[columnIds[i]] = [[cells[i] ?? '']]
  }
  return properties
}

function unwrapBlockRecord(record: BlockRecord | undefined): BlockValue | undefined {
  if (!record?.value) return undefined
  const outer = record.value as unknown as Record<string, unknown>
  if (typeof outer.role === 'string' && outer.value !== undefined) {
    return outer.value as BlockValue
  }
  return record.value
}

function getBlockById(blockMap: Record<string, BlockRecord>, blockId: string): BlockValue | undefined {
  const direct = unwrapBlockRecord(blockMap[blockId])
  if (direct) return direct
  for (const record of Object.values(blockMap)) {
    const value = unwrapBlockRecord(record)
    if (value?.id === blockId) return value
  }
  return undefined
}

function assertTableBlock(block: BlockValue | undefined, tableId: string): BlockValue {
  if (!block) {
    throw new Error(`Block not found: ${tableId}`)
  }
  if (block.type !== 'table') {
    throw new Error(`Block ${tableId} is not a table (type: ${block.type})`)
  }
  return block
}

export async function handleTableCreate(
  tokenV2: string,
  args: {
    parent_id: string
    headers: string[]
    rows: string[][]
    after?: string
    before?: string
    workspaceId: string
  },
): Promise<unknown> {
  const parentId = formatNotionId(args.parent_id)

  if (args.headers.length === 0 || args.headers.every((h) => h === '')) {
    throw new Error('Headers cannot be empty')
  }

  if (args.after && args.before) {
    throw new Error('--after and --before are mutually exclusive')
  }

  await resolveAndSetActiveUserId(tokenV2, args.workspaceId)
  const spaceId = await resolveSpaceId(tokenV2, parentId)
  const tableId = generateId()
  const columnIds = args.headers.map(() => generateColumnId())
  const rowData = [args.headers, ...args.rows]
  const operations: SaveOperation[] = []
  const rowIds: string[] = []

  operations.push({
    pointer: { table: 'block', id: tableId, spaceId },
    command: 'set',
    path: [],
    args: {
      type: 'table',
      id: tableId,
      version: 1,
      format: {
        table_block_column_order: columnIds,
        table_block_column_header: true,
      },
      parent_id: parentId,
      parent_table: 'block',
      alive: true,
      space_id: spaceId,
    },
  })

  let previousRowId: string | undefined
  for (const cells of rowData) {
    const rowId = generateId()
    rowIds.push(rowId)
    operations.push({
      pointer: { table: 'block', id: rowId, spaceId },
      command: 'set',
      path: [],
      args: {
        type: 'table_row',
        id: rowId,
        version: 1,
        properties: buildTableRowProperties(columnIds, cells),
        parent_id: tableId,
        parent_table: 'block',
        alive: true,
        space_id: spaceId,
      },
    })

    const rowListArgs: Record<string, string> = { id: rowId }
    if (previousRowId) {
      rowListArgs.after = previousRowId
    }
    operations.push({
      pointer: { table: 'block', id: tableId, spaceId },
      command: 'listAfter',
      path: ['content'],
      args: rowListArgs,
    })
    previousRowId = rowId
  }

  const afterId = args.after ? formatNotionId(args.after) : undefined
  const beforeId = args.before ? formatNotionId(args.before) : undefined
  operations.push({
    pointer: { table: 'block', id: parentId, spaceId },
    command: beforeId ? 'listBefore' : 'listAfter',
    path: ['content'],
    args: beforeId ? { id: tableId, before: beforeId } : afterId ? { id: tableId, after: afterId } : { id: tableId },
  })

  const payload: SaveTransactionsRequest = {
    requestId: generateId(),
    transactions: [{ id: generateId(), spaceId, operations }],
  }
  await internalRequest(tokenV2, 'saveTransactions', payload)

  return { table_id: tableId, column_ids: columnIds, row_ids: rowIds }
}

export async function handleTableAddRow(
  tokenV2: string,
  args: { table_id: string; cells: string[]; workspaceId: string },
): Promise<unknown> {
  const tableId = formatNotionId(args.table_id)
  await resolveAndSetActiveUserId(tokenV2, args.workspaceId)

  const response = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'block', id: tableId }, version: -1 }],
  })) as SyncRecordValuesResponse

  const tableBlock = assertTableBlock(getBlockById(response.recordMap.block, tableId), tableId)
  const columnIds = extractTableColumnOrder(tableBlock as Record<string, unknown>)
  if (columnIds.length === 0) {
    throw new Error('Table has no columns')
  }

  const spaceId = await resolveSpaceId(tokenV2, tableId)
  const rowId = generateId()
  const existingRows = Array.isArray(tableBlock.content) ? tableBlock.content : []
  const listArgs: Record<string, string> = { id: rowId }
  if (existingRows.length > 0) {
    listArgs.after = existingRows[existingRows.length - 1]
  }

  const operations: SaveOperation[] = [
    {
      pointer: { table: 'block', id: rowId, spaceId },
      command: 'set',
      path: [],
      args: {
        type: 'table_row',
        id: rowId,
        version: 1,
        properties: buildTableRowProperties(columnIds, args.cells),
        parent_id: tableId,
        parent_table: 'block',
        alive: true,
        space_id: spaceId,
      },
    },
    {
      pointer: { table: 'block', id: tableId, spaceId },
      command: 'listAfter',
      path: ['content'],
      args: listArgs,
    },
  ]

  const payload: SaveTransactionsRequest = {
    requestId: generateId(),
    transactions: [{ id: generateId(), spaceId, operations }],
  }
  await internalRequest(tokenV2, 'saveTransactions', payload)

  return { table_id: tableId, row_id: rowId }
}

export async function handleTableUpdateCell(
  tokenV2: string,
  args: { table_id: string; row: number; col: number; value: string; workspaceId: string },
): Promise<unknown> {
  const tableId = formatNotionId(args.table_id)
  await resolveAndSetActiveUserId(tokenV2, args.workspaceId)

  const response = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'block', id: tableId }, version: -1 }],
  })) as SyncRecordValuesResponse

  const tableBlock = assertTableBlock(getBlockById(response.recordMap.block, tableId), tableId)
  const columnIds = extractTableColumnOrder(tableBlock as Record<string, unknown>)
  if (columnIds.length === 0) {
    throw new Error('Table has no columns')
  }

  const columnId = columnIds[args.col]
  if (!columnId) {
    throw new Error(`Column index out of bounds: ${args.col}`)
  }

  const hasHeader = Boolean((tableBlock.format as Record<string, unknown> | undefined)?.table_block_column_header)
  const allRowIds = Array.isArray(tableBlock.content) ? tableBlock.content : []
  const dataRowIds = hasHeader ? allRowIds.slice(1) : allRowIds
  const targetRowId = dataRowIds[args.row]
  if (!targetRowId) {
    throw new Error(`Row index out of bounds: ${args.row}`)
  }

  const spaceId = await resolveSpaceId(tokenV2, tableId)
  // Notion rejects a plain `set` on block properties with a 400, so the cell
  // goes through `updateBlockPropertyValue` like `block update` and `update-row`.
  const operations: SaveOperation[] = [
    {
      pointer: { table: 'block', id: targetRowId, spaceId },
      command: 'updateBlockPropertyValue',
      path: ['properties', columnId],
      args: { primitiveOp: { command: 'set', args: [[args.value]] } },
    },
  ]

  const payload: SaveTransactionsRequest = {
    requestId: generateId(),
    transactions: [{ id: generateId(), spaceId, operations }],
  }
  await internalRequest(tokenV2, 'saveTransactions', payload)

  return { table_id: tableId, row_id: targetRowId, row: args.row, col: args.col }
}

export async function handleTableDeleteRow(
  tokenV2: string,
  args: { table_id: string; row: number; workspaceId: string },
): Promise<unknown> {
  const tableId = formatNotionId(args.table_id)
  await resolveAndSetActiveUserId(tokenV2, args.workspaceId)

  const response = (await internalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'block', id: tableId }, version: -1 }],
  })) as SyncRecordValuesResponse

  const tableBlock = assertTableBlock(getBlockById(response.recordMap.block, tableId), tableId)
  const hasHeader = Boolean((tableBlock.format as Record<string, unknown> | undefined)?.table_block_column_header)
  const allRowIds = Array.isArray(tableBlock.content) ? tableBlock.content : []
  const dataRowIds = hasHeader ? allRowIds.slice(1) : allRowIds
  const targetRowId = dataRowIds[args.row]
  if (!targetRowId) {
    throw new Error(`Row index out of bounds: ${args.row}`)
  }

  const spaceId = await resolveSpaceId(tokenV2, tableId)
  const operations: SaveOperation[] = [
    {
      pointer: { table: 'block', id: targetRowId, spaceId },
      command: 'update',
      path: [],
      args: { alive: false },
    },
    {
      pointer: { table: 'block', id: tableId, spaceId },
      command: 'listRemove',
      path: ['content'],
      args: { id: targetRowId },
    },
  ]

  const payload: SaveTransactionsRequest = {
    requestId: generateId(),
    transactions: [{ id: generateId(), spaceId, operations }],
  }
  await internalRequest(tokenV2, 'saveTransactions', payload)

  return { deleted: true, table_id: tableId, row_id: targetRowId, row: args.row }
}

async function createAction(rawParentId: string, options: CreateOptions): Promise<void> {
  try {
    const parentId = formatNotionId(rawParentId)
    const creds = await getCredentialsOrExit()
    const ctx = await ensureWorkspaceContext(creds, options.workspaceId, parentId)
    const headers = parseCsvCells(options.headers)
    const rows = options.rows ? parseRowsJson(options.rows) : []
    const result = await handleTableCreate(ctx.tokenV2, {
      parent_id: parentId,
      headers,
      rows,
      after: options.after,
      before: options.before,
      workspaceId: ctx.workspaceId,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleNotionError(error)
  }
}

async function addRowAction(rawTableId: string, options: AddRowOptions): Promise<void> {
  try {
    const tableId = formatNotionId(rawTableId)
    const creds = await getCredentialsOrExit()
    const ctx = await ensureWorkspaceContext(creds, options.workspaceId, tableId)
    const cells = parseCsvCells(options.cells)
    const result = await handleTableAddRow(ctx.tokenV2, {
      table_id: tableId,
      cells,
      workspaceId: ctx.workspaceId,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleNotionError(error)
  }
}

async function updateCellAction(rawTableId: string, options: UpdateCellOptions): Promise<void> {
  try {
    const tableId = formatNotionId(rawTableId)
    const creds = await getCredentialsOrExit()
    const ctx = await ensureWorkspaceContext(creds, options.workspaceId, tableId)
    const row = parseIndex(options.row, 'row')
    const col = parseIndex(options.col, 'col')
    const result = await handleTableUpdateCell(ctx.tokenV2, {
      table_id: tableId,
      row,
      col,
      value: options.value,
      workspaceId: ctx.workspaceId,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleNotionError(error)
  }
}

async function deleteRowAction(rawTableId: string, options: DeleteRowOptions): Promise<void> {
  try {
    const tableId = formatNotionId(rawTableId)
    const creds = await getCredentialsOrExit()
    const ctx = await ensureWorkspaceContext(creds, options.workspaceId, tableId)
    const row = parseIndex(options.row, 'row')
    const result = await handleTableDeleteRow(ctx.tokenV2, {
      table_id: tableId,
      row,
      workspaceId: ctx.workspaceId,
    })
    console.log(formatOutput(result, options.pretty))
  } catch (error) {
    handleNotionError(error)
  }
}

const WORKSPACE_ID_OPTION_DESC = 'Workspace ID (optional; auto-resolved from the target when omitted)'

export const tableCommand = new Command('table')
  .description('Simple table commands (non-database tables)')
  .addCommand(
    new Command('create')
      .description('Create a simple table')
      .argument('<parent_id>', 'Parent page or block ID')
      .option('--workspace-id <id>', WORKSPACE_ID_OPTION_DESC)
      .requiredOption('--headers <csv>', 'Comma-separated column headers (e.g. "Name,Role,Score")')
      .option(
        '--rows <json>',
        'Initial rows as JSON array of arrays (e.g. \'[["Alice","Dev","95"],["Bob","PM","88"]]\')',
      )
      .option('--after <block_id>', 'Insert after this block ID')
      .option('--before <block_id>', 'Insert before this block ID')
      .option('--pretty', 'Pretty print JSON output')
      .action(createAction),
  )
  .addCommand(
    new Command('add-row')
      .description('Add a row to a simple table')
      .argument('<table_id>', 'Table block ID')
      .option('--workspace-id <id>', WORKSPACE_ID_OPTION_DESC)
      .requiredOption('--cells <csv>', 'Comma-separated cell values')
      .option('--pretty', 'Pretty print JSON output')
      .action(addRowAction),
  )
  .addCommand(
    new Command('update-cell')
      .description('Update a single cell in a simple table')
      .argument('<table_id>', 'Table block ID')
      .option('--workspace-id <id>', WORKSPACE_ID_OPTION_DESC)
      .requiredOption('--row <index>', 'Row index (0-based, excluding header row)')
      .requiredOption('--col <index>', 'Column index (0-based)')
      .requiredOption('--value <text>', 'New cell value')
      .option('--pretty', 'Pretty print JSON output')
      .action(updateCellAction),
  )
  .addCommand(
    new Command('delete-row')
      .description('Delete a row from a simple table')
      .argument('<table_id>', 'Table block ID')
      .option('--workspace-id <id>', WORKSPACE_ID_OPTION_DESC)
      .requiredOption('--row <index>', 'Row index (0-based, excluding header row)')
      .option('--pretty', 'Pretty print JSON output')
      .action(deleteRowAction),
  )
