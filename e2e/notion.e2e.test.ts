import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { runNotionCLI, parseJSON, generateTestId, waitForRateLimit } from './helpers'
import { NOTION_E2E_PAGE_ID, validateNotionEnvironment } from './config'

let containerId = ''
let containerTitle = ''
let runStartedAt = 0
let testPageIds: string[] = []
let testBlockIds: string[] = []
let testDatabaseIds: string[] = []
let workspaceId = ''

describe('Notion E2E Tests', () => {
  beforeAll(async () => {
    workspaceId = await validateNotionEnvironment()
    await waitForRateLimit()

    runStartedAt = Date.now()
    containerTitle = `e2e-notion-run-${runStartedAt}`

    const result = await runNotionCLI([
      'page',
      'create',
      '--workspace-id',
      workspaceId,
      '--parent',
      NOTION_E2E_PAGE_ID,
      '--title',
      containerTitle,
    ])
    expect(result.exitCode).toBe(0)

    const data = parseJSON<{ value: { id: string; type: string }; role: string }>(result.stdout)
    expect(data?.value?.id).toBeTruthy()
    expect(data?.value?.type).toBe('page')

    containerId = data!.value.id
    testPageIds.push(containerId)
    await waitForRateLimit()
  }, 30000)

  afterAll(async () => {
    for (const blockId of testBlockIds) {
      try {
        await runNotionCLI(['block', 'delete', '--workspace-id', workspaceId, blockId])
        await waitForRateLimit()
      } catch {}
    }

    for (const pageId of testPageIds) {
      if (pageId === containerId) continue
      try {
        await runNotionCLI(['page', 'archive', '--workspace-id', workspaceId, pageId])
        await waitForRateLimit()
      } catch {}
    }

    for (const databaseBlockId of testDatabaseIds) {
      try {
        await runNotionCLI(['page', 'archive', '--workspace-id', workspaceId, databaseBlockId])
        await waitForRateLimit()
      } catch {}
    }

    if (containerId) {
      try {
        await runNotionCLI(['page', 'archive', '--workspace-id', workspaceId, containerId])
        await waitForRateLimit()
      } catch {}
    }

    try {
      const result = await runNotionCLI(['block', 'children', '--workspace-id', workspaceId, NOTION_E2E_PAGE_ID])
      const data = parseJSON<{
        results: Array<{
          id: string
          alive: boolean
          created_time?: number
          properties?: { title?: string[][] }
        }>
      }>(result.stdout)

      if (data?.results) {
        for (const block of data.results) {
          const title = block.properties?.title?.[0]?.[0] ?? ''
          const createdThisRun =
            block.id === containerId
            || title.includes(containerTitle)
            || (typeof block.created_time === 'number' && block.created_time >= runStartedAt)

          if (block.alive && createdThisRun) {
            await runNotionCLI(['block', 'delete', '--workspace-id', workspaceId, block.id])
            await waitForRateLimit()
          }
        }
      }

      await waitForRateLimit()
    } catch {}
  }, 60000)

  // ── auth ──────────────────────────────────────────────────────────────

  describe('auth', () => {
    test('auth status returns stored token_v2 credentials', async () => {
      const result = await runNotionCLI(['auth', 'status'])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ stored_token_v2: { token_v2: string; user_id?: string } | null }>(result.stdout)
      expect(data).not.toBeNull()
      expect(data?.stored_token_v2).not.toBeNull()
      expect(data?.stored_token_v2?.token_v2).toBeTruthy()

      await waitForRateLimit()
    }, 15000)
  })

  // ── page ──────────────────────────────────────────────────────────────

  describe('page', () => {
    let createdPageId = ''

    test('page create creates a page under container', async () => {
      const testId = generateTestId()
      const result = await runNotionCLI([
        'page',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        `e2e-page-${testId}`,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{
        value: { id: string; type: string; properties?: Record<string, unknown> }
        role: string
      }>(result.stdout)
      expect(data?.value?.id).toBeTruthy()
      expect(data?.value?.type).toBe('page')

      createdPageId = data!.value.id
      testPageIds.push(createdPageId)
      await waitForRateLimit()
    }, 15000)

    test('page get retrieves the created page record map', async () => {
      expect(createdPageId).toBeTruthy()

      const result = await runNotionCLI(['page', 'get', '--workspace-id', workspaceId, createdPageId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{
        cursor: Record<string, unknown>
        recordMap: { block: Record<string, { value: Record<string, unknown>; role: string }> }
      }>(result.stdout)
      expect(data?.recordMap?.block).toBeTruthy()
      expect(Object.keys(data?.recordMap?.block ?? {}).length).toBeGreaterThan(0)

      await waitForRateLimit()
    }, 15000)

    test('page list returns pages and total count', async () => {
      const result = await runNotionCLI(['page', 'list', '--workspace-id', workspaceId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{
        spaceId: string
        pages: Array<{ id: string; title?: string; type: string }>
        total: number
      }>(result.stdout)
      expect(Array.isArray(data?.pages)).toBe(true)
      expect((data?.total ?? 0)).toBeGreaterThan(0)

      await waitForRateLimit()
    }, 15000)

    test('page update updates the page title', async () => {
      expect(createdPageId).toBeTruthy()

      const testId = generateTestId()
      const result = await runNotionCLI([
        'page',
        'update',
        '--workspace-id',
        workspaceId,
        createdPageId,
        '--title',
        `e2e-updated-${testId}`,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{
        value: { id: string; properties?: Record<string, unknown> }
        role: string
      }>(result.stdout)
      expect(data?.value?.id).toBe(createdPageId)

      await waitForRateLimit()
    }, 15000)

    test('page archive archives a newly created page', async () => {
      const testId = generateTestId()
      const createResult = await runNotionCLI([
        'page',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        `e2e-archive-${testId}`,
      ])
      expect(createResult.exitCode).toBe(0)

      const created = parseJSON<{ value: { id: string; type: string }; role: string }>(createResult.stdout)
      expect(created?.value?.id).toBeTruthy()

      const pageToArchive = created!.value.id
      testPageIds.push(pageToArchive)
      await waitForRateLimit()

      const result = await runNotionCLI(['page', 'archive', '--workspace-id', workspaceId, pageToArchive])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ archived: boolean; id: string }>(result.stdout)
      expect(data?.archived).toBe(true)
      expect(data?.id).toBe(pageToArchive)

      await waitForRateLimit()
    }, 15000)
  })

  // ── database ──────────────────────────────────────────────────────────

  describe('database', () => {
    let createdDbId = ''

    beforeAll(async () => {
      const testId = generateTestId()
      const result = await runNotionCLI([
        'database',
        'create',
        '--workspace-id',
        workspaceId,
        '--parent',
        containerId,
        '--title',
        `e2e-db-${testId}`,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; name?: string[][]; schema?: Record<string, unknown>; parent_id: string }>(result.stdout)
      expect(data?.id).toBeTruthy()

      createdDbId = data!.id
      if (data?.parent_id) {
        testDatabaseIds.push(data.parent_id)
      }

      await waitForRateLimit()
    }, 15000)

    test('database list returns database summaries', async () => {
      const result = await runNotionCLI(['database', 'list', '--workspace-id', workspaceId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<Array<{ id: string; name?: string; schema_properties?: unknown[] }>>(result.stdout)
      expect(Array.isArray(data)).toBe(true)

      await waitForRateLimit()
    }, 15000)

    test('database get retrieves the created database', async () => {
      expect(createdDbId).toBeTruthy()

      const result = await runNotionCLI(['database', 'get', '--workspace-id', workspaceId, createdDbId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; name?: string[][]; schema?: Record<string, unknown> }>(result.stdout)
      expect(data?.id).toBe(createdDbId)

      await waitForRateLimit()
    }, 15000)

    test('database query returns result and recordMap', async () => {
      expect(createdDbId).toBeTruthy()

      const result = await runNotionCLI(['database', 'query', '--workspace-id', workspaceId, createdDbId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ result: Record<string, unknown>; recordMap: Record<string, unknown> }>(result.stdout)
      expect(data?.result).toBeTruthy()
      expect(data?.recordMap).toBeTruthy()

      await waitForRateLimit()
    }, 15000)

    test('database update updates the created database title', async () => {
      expect(createdDbId).toBeTruthy()

      const testId = generateTestId()
      const result = await runNotionCLI([
        'database',
        'update',
        '--workspace-id',
        workspaceId,
        createdDbId,
        '--title',
        `e2e-db-updated-${testId}`,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; name?: string[][] }>(result.stdout)
      expect(data?.id).toBe(createdDbId)

      await waitForRateLimit()
    }, 15000)
  })

  // ── block ─────────────────────────────────────────────────────────────

  describe('block', () => {
    let appendedBlockId = ''

    test('block append creates a text block under container', async () => {
      const testId = generateTestId()
      const result = await runNotionCLI([
        'block',
        'append',
        '--workspace-id',
        workspaceId,
        containerId,
        '--content',
        `[{"type":"text","properties":{"title":[["e2e-block-${testId}"]]}}]`,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ created: string[] }>(result.stdout)
      expect(Array.isArray(data?.created)).toBe(true)
      expect((data?.created?.length ?? 0)).toBeGreaterThan(0)

      appendedBlockId = data!.created[0]
      testBlockIds.push(appendedBlockId)
      await waitForRateLimit()
    }, 15000)

    test('block get retrieves the appended text block', async () => {
      expect(appendedBlockId).toBeTruthy()

      const result = await runNotionCLI(['block', 'get', '--workspace-id', workspaceId, appendedBlockId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; type: string; version: number }>(result.stdout)
      expect(data?.id).toBe(appendedBlockId)
      expect(data?.type).toBe('text')

      await waitForRateLimit()
    }, 15000)

    test('block children lists children under container', async () => {
      const result = await runNotionCLI(['block', 'children', '--workspace-id', workspaceId, containerId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ results: unknown[]; has_more: boolean }>(result.stdout)
      expect(Array.isArray(data?.results)).toBe(true)
      expect((data?.results?.length ?? 0)).toBeGreaterThan(0)

      await waitForRateLimit()
    }, 15000)

    test('block update updates block content fields', async () => {
      expect(appendedBlockId).toBeTruthy()

      const result = await runNotionCLI([
        'block',
        'update',
        '--workspace-id',
        workspaceId,
        appendedBlockId,
        '--content',
        '{"properties":{"title":[["e2e-block-updated"]]}}',
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; type: string; properties?: Record<string, unknown> }>(result.stdout)
      expect(data?.id).toBe(appendedBlockId)

      await waitForRateLimit()
    }, 15000)

    test('block delete deletes a newly appended block', async () => {
      const testId = generateTestId()
      const appendResult = await runNotionCLI([
        'block',
        'append',
        '--workspace-id',
        workspaceId,
        containerId,
        '--content',
        `[{"type":"text","properties":{"title":[["e2e-delete-${testId}"]]}}]`,
      ])
      expect(appendResult.exitCode).toBe(0)

      const appended = parseJSON<{ created: string[] }>(appendResult.stdout)
      expect(Array.isArray(appended?.created)).toBe(true)
      expect((appended?.created?.length ?? 0)).toBeGreaterThan(0)

      const blockToDelete = appended!.created[0]
      await waitForRateLimit()

      const result = await runNotionCLI(['block', 'delete', '--workspace-id', workspaceId, blockToDelete])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ deleted: boolean; id: string }>(result.stdout)
      expect(data?.deleted).toBe(true)
      expect(data?.id).toBe(blockToDelete)

      await waitForRateLimit()
    }, 15000)
  })

  // ── search ────────────────────────────────────────────────────────────

  describe('search', () => {
    test('search returns matching results', async () => {
      await waitForRateLimit(5000)

      const result = await runNotionCLI(['search', '--workspace-id', workspaceId, 'e2e-notion-run'])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ results: unknown[]; total: number }>(result.stdout)
      expect(Array.isArray(data?.results)).toBe(true)

      await waitForRateLimit()
    }, 15000)
  })

  // ── user ──────────────────────────────────────────────────────────────

  describe('user', () => {
    let currentUserId = ''

    beforeAll(async () => {
      const result = await runNotionCLI(['user', 'me'])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; name?: string; email?: string; spaces: unknown[] }>(result.stdout)
      expect(data?.id).toBeTruthy()
      currentUserId = data!.id

      await waitForRateLimit()
    }, 15000)

    test('user list returns users array', async () => {
      const result = await runNotionCLI(['user', 'list'])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<Array<{ id: string; name: string; email: string }>>(result.stdout)
      expect(Array.isArray(data)).toBe(true)
      expect((data?.length ?? 0)).toBeGreaterThan(0)

      await waitForRateLimit()
    }, 15000)

    test('user me returns current user with spaces', async () => {
      const result = await runNotionCLI(['user', 'me'])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; name?: string; email?: string; spaces: unknown[] }>(result.stdout)
      expect(data?.id).toBeTruthy()
      expect(Array.isArray(data?.spaces)).toBe(true)

      await waitForRateLimit()
    }, 15000)

    test('user get returns the fetched current user', async () => {
      expect(currentUserId).toBeTruthy()

      const result = await runNotionCLI(['user', 'get', '--workspace-id', workspaceId, currentUserId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; name?: string }>(result.stdout)
      expect(data?.id).toBe(currentUserId)

      await waitForRateLimit()
    }, 15000)
  })
})
