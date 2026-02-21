import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { runCLI, parseJSON, generateTestId, waitForRateLimit } from './helpers'
import {
  NOTIONBOT_E2E_PAGE_ID,
  NOTIONBOT_BOT_ID,
  NOTIONBOT_KNOWN_USER_ID,
  NOTIONBOT_WORKSPACE_NAME,
  validateNotionBotEnvironment,
} from './config'

let containerId = ''
let testPageIds: string[] = []
let testBlockIds: string[] = []
let testDatabaseIds: string[] = []

describe('NotionBot E2E Tests', () => {
  beforeAll(async () => {
    await validateNotionBotEnvironment()
    await waitForRateLimit()

    const result = await runCLI([
      'page', 'create',
      '--parent', NOTIONBOT_E2E_PAGE_ID,
      '--title', `e2e-run-${Date.now()}`,
    ])
    expect(result.exitCode).toBe(0)

    const data = parseJSON<{ id: string }>(result.stdout)
    expect(data?.id).toBeTruthy()
    containerId = data!.id
    await waitForRateLimit()
  }, 30000)

  afterAll(async () => {
    for (const blockId of testBlockIds) {
      try {
        await runCLI(['block', 'delete', blockId])
        await waitForRateLimit()
      } catch { /* best-effort */ }
    }

    for (const pageId of testPageIds) {
      try {
        await runCLI(['page', 'archive', pageId])
        await waitForRateLimit()
      } catch { /* best-effort */ }
    }

    for (const dbId of testDatabaseIds) {
      try {
        await runCLI(['page', 'archive', dbId])
        await waitForRateLimit()
      } catch { /* best-effort */ }
    }

    if (containerId) {
      try {
        await runCLI(['page', 'archive', containerId])
        await waitForRateLimit()
      } catch { /* best-effort */ }
    }

    try {
      const result = await runCLI(['block', 'children', NOTIONBOT_E2E_PAGE_ID])
      const data = parseJSON<{
        results: Array<{ id: string; created_by: { id: string }; archived: boolean }>
      }>(result.stdout)
      if (data?.results) {
        for (const block of data.results) {
          if (block.created_by?.id === NOTIONBOT_BOT_ID && !block.archived) {
            await runCLI(['block', 'delete', block.id])
            await waitForRateLimit()
          }
        }
      }
    } catch { /* best-effort */ }
  }, 60000)

  // ── auth ──────────────────────────────────────────────────────────────

  describe('auth', () => {
    test('auth status returns valid bot info', async () => {
      const result = await runCLI(['auth', 'status'])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{
        integration: { id: string; name: string; type: string; workspace_name: string }
      }>(result.stdout)
      expect(data).not.toBeNull()
      expect(data?.integration?.id).toBeTruthy()
      expect(data?.integration?.name).toBeTruthy()
      expect(data?.integration?.type).toBe('bot')
      expect(data?.integration?.workspace_name).toBe(NOTIONBOT_WORKSPACE_NAME)

      await waitForRateLimit()
    }, 15000)
  })

  // ── page ──────────────────────────────────────────────────────────────

  describe('page', () => {
    let createdPageId = ''

    test('page create creates a page under container', async () => {
      const testId = generateTestId()
      const result = await runCLI([
        'page', 'create',
        '--parent', containerId,
        '--title', `e2e-page-${testId}`,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; title: string }>(result.stdout)
      expect(data?.id).toBeTruthy()
      expect(data?.title).toBeTruthy()

      createdPageId = data!.id
      testPageIds.push(createdPageId)
      await waitForRateLimit()
    }, 15000)

    test('page get retrieves the created page', async () => {
      expect(createdPageId).toBeTruthy()

      const result = await runCLI(['page', 'get', createdPageId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; title: string }>(result.stdout)
      expect(data?.id).toBe(createdPageId)
      expect(data?.title).toBeTruthy()

      await waitForRateLimit()
    }, 15000)

    test('page update via archive and retrieve round-trip', async () => {
      expect(createdPageId).toBeTruthy()

      const result = await runCLI(['page', 'archive', createdPageId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; archived: boolean }>(result.stdout)
      expect(data?.id).toBe(createdPageId)
      expect(data?.archived).toBe(true)

      await waitForRateLimit()

      const getResult = await runCLI(['page', 'get', createdPageId])
      expect(getResult.exitCode).toBe(0)

      const getPage = parseJSON<{ id: string; archived: boolean }>(getResult.stdout)
      expect(getPage?.archived).toBe(true)

      await waitForRateLimit()
    }, 15000)

    test('page archive archives the page', async () => {
      const testId = generateTestId()
      const createResult = await runCLI([
        'page', 'create',
        '--parent', containerId,
        '--title', `e2e-archive-${testId}`,
      ])
      const created = parseJSON<{ id: string }>(createResult.stdout)
      expect(created?.id).toBeTruthy()

      await waitForRateLimit()

      const result = await runCLI(['page', 'archive', created!.id])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; archived: boolean }>(result.stdout)
      expect(data?.id).toBe(created!.id)
      expect(data?.archived).toBe(true)

      await waitForRateLimit()
    }, 15000)
  })

  // ── database ──────────────────────────────────────────────────────────

  describe('database', () => {
    let createdDbId = ''

    beforeAll(async () => {
      const testId = generateTestId()
      const result = await runCLI([
        'database', 'create',
        '--parent', containerId,
        '--title', `e2e-db-${testId}`,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string }>(result.stdout)
      expect(data?.id).toBeTruthy()

      createdDbId = data!.id
      testDatabaseIds.push(createdDbId)
      await waitForRateLimit()
    }, 15000)

    test('database create with select properties', async () => {
      const testId = generateTestId()
      const properties = JSON.stringify({
        Name: { title: {} },
        Status: { select: { options: [{ name: 'Open', color: 'green' }, { name: 'Closed', color: 'red' }] } },
      })
      const result = await runCLI([
        'database', 'create',
        '--parent', containerId,
        '--title', `e2e-select-db-${testId}`,
        '--properties', properties,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; properties: Record<string, string> }>(result.stdout)
      expect(data?.id).toBeTruthy()
      expect(data?.properties?.Status).toBe('select')

      testDatabaseIds.push(data!.id)
      await waitForRateLimit()
    }, 15000)

    test('database update adds select properties', async () => {
      expect(createdDbId).toBeTruthy()

      const properties = JSON.stringify({
        Priority: { select: { options: [{ name: 'High' }, { name: 'Low' }] } },
      })
      const result = await runCLI([
        'database', 'update', createdDbId,
        '--properties', properties,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; properties: Record<string, string> }>(result.stdout)
      expect(data?.id).toBe(createdDbId)
      expect(data?.properties?.Priority).toBe('select')

      await waitForRateLimit()
    }, 15000)

    test('database delete-property removes a property', async () => {
      expect(createdDbId).toBeTruthy()

      const properties = JSON.stringify({
        E2EProp: { rich_text: {} },
      })
      const addResult = await runCLI([
        'database', 'update', createdDbId,
        '--properties', properties,
      ])
      expect(addResult.exitCode).toBe(0)

      const added = parseJSON<{ id: string; properties: Record<string, string> }>(addResult.stdout)
      expect(added?.properties?.E2EProp).toBe('rich_text')

      await waitForRateLimit()

      const result = await runCLI([
        'database', 'delete-property', createdDbId,
        '--property', 'E2EProp',
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; properties: Record<string, string> }>(result.stdout)
      expect(data?.id).toBe(createdDbId)
      expect(data?.properties?.E2EProp).toBeUndefined()

      await waitForRateLimit()
    }, 30000)

    test('database list returns databases', async () => {
      const result = await runCLI(['database', 'list', '--page-size', '5'])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<Array<{ id: string; title: string; url: string }>>(result.stdout)
      expect(data).not.toBeNull()
      expect(Array.isArray(data)).toBe(true)

      await waitForRateLimit()
    }, 15000)

    test('database get retrieves a database', async () => {
      expect(createdDbId).toBeTruthy()

      const result = await runCLI(['database', 'get', createdDbId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; title: string }>(result.stdout)
      expect(data?.id).toBe(createdDbId)
      expect(data?.title).toBeTruthy()

      await waitForRateLimit()
    }, 15000)

    test('database query returns results', async () => {
      expect(createdDbId).toBeTruthy()

      await waitForRateLimit()

      const result = await runCLI(['database', 'query', createdDbId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ results: unknown[]; has_more: boolean }>(result.stdout)
      expect(Array.isArray(data?.results)).toBe(true)

      await waitForRateLimit()
    }, 15000)
  })

  // ── block ─────────────────────────────────────────────────────────────

  describe('block', () => {
    let appendedBlockId = ''

    test('block append adds blocks to a page', async () => {
      const blockContent = JSON.stringify([
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: `e2e-block-${generateTestId()}` } }],
          },
        },
      ])

      const result = await runCLI([
        'block', 'append', containerId,
        '--content', blockContent,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ results: Array<{ id: string; type: string }> }>(result.stdout)
      expect(data).not.toBeNull()
      expect(data!.results.length).toBeGreaterThan(0)

      appendedBlockId = data!.results[0].id
      testBlockIds.push(appendedBlockId)
      await waitForRateLimit()
    }, 15000)

    test('block get retrieves the appended block', async () => {
      expect(appendedBlockId).toBeTruthy()

      const result = await runCLI(['block', 'get', appendedBlockId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; type: string }>(result.stdout)
      expect(data?.id).toBe(appendedBlockId)
      expect(data?.type).toBe('paragraph')

      await waitForRateLimit()
    }, 15000)

    test('block children lists child blocks', async () => {
      const result = await runCLI(['block', 'children', containerId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ results: Array<{ id: string }>; has_more: boolean }>(result.stdout)
      expect(Array.isArray(data?.results)).toBe(true)
      expect(data!.results.length).toBeGreaterThan(0)

      await waitForRateLimit()
    }, 15000)

    test('block delete removes a block', async () => {
      const blockContent = JSON.stringify([
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: `e2e-delete-${generateTestId()}` } }],
          },
        },
      ])

      const appendResult = await runCLI([
        'block', 'append', containerId,
        '--content', blockContent,
      ])
      const appended = parseJSON<{ results: Array<{ id: string }> }>(appendResult.stdout)
      const blockToDelete = appended!.results[0].id
      expect(blockToDelete).toBeTruthy()

      await waitForRateLimit()

      const result = await runCLI(['block', 'delete', blockToDelete])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; deleted: boolean }>(result.stdout)
      expect(data?.id).toBe(blockToDelete)
      expect(data?.deleted).toBe(true)

      await waitForRateLimit()
    }, 15000)
  })

  // ── search ────────────────────────────────────────────────────────────

  describe('search', () => {
    test('search finds pages in workspace', async () => {
      await waitForRateLimit(5000) // Notion search indexing lag

      const result = await runCLI(['search', 'e2e-run'])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<Array<{ id: string; object: string; title: string }>>(result.stdout)
      expect(data).not.toBeNull()
      expect(Array.isArray(data)).toBe(true)

      await waitForRateLimit()
    }, 15000)
  })

  // ── user ──────────────────────────────────────────────────────────────

  describe('user', () => {
    test('user list returns users array', async () => {
      const result = await runCLI(['user', 'list'])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<Array<{ id: string; name: string; type: string }>>(result.stdout)
      expect(data).not.toBeNull()
      expect(Array.isArray(data)).toBe(true)
      expect(data!.length).toBeGreaterThan(0)

      await waitForRateLimit()
    }, 15000)

    test('user me returns bot info', async () => {
      const result = await runCLI(['user', 'me'])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; name: string; type: string; workspace_name: string }>(result.stdout)
      expect(data).not.toBeNull()
      expect(data?.id).toBe(NOTIONBOT_BOT_ID)
      expect(data?.type).toBe('bot')
      expect(data?.workspace_name).toBe(NOTIONBOT_WORKSPACE_NAME)

      await waitForRateLimit()
    }, 15000)

    test('user get retrieves a specific user', async () => {
      const result = await runCLI(['user', 'get', NOTIONBOT_KNOWN_USER_ID])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; name: string; type: string }>(result.stdout)
      expect(data).not.toBeNull()
      expect(data?.id).toBe(NOTIONBOT_KNOWN_USER_ID)
      expect(data?.type).toBe('person')

      await waitForRateLimit()
    }, 15000)
  })

  // ── comment ───────────────────────────────────────────────────────────

  describe('comment', () => {
    let commentPageId = ''
    let createdCommentId = ''

    beforeAll(async () => {
      const testId = generateTestId()
      const result = await runCLI([
        'page', 'create',
        '--parent', containerId,
        '--title', `e2e-comments-${testId}`,
      ])
      const data = parseJSON<{ id: string }>(result.stdout)
      expect(data?.id).toBeTruthy()
      commentPageId = data!.id
      testPageIds.push(commentPageId)
      await waitForRateLimit()
    }, 15000)

    test('comment create creates a comment on a page', async () => {
      expect(commentPageId).toBeTruthy()

      const testId = generateTestId()
      const result = await runCLI([
        'comment', 'create', `e2e-comment-${testId}`,
        '--page', commentPageId,
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; text: string; author: { id: string } }>(result.stdout)
      expect(data).not.toBeNull()
      expect(data?.id).toBeTruthy()
      expect(data?.text).toBeTruthy()

      createdCommentId = data!.id
      await waitForRateLimit()
    }, 15000)

    test('comment list returns comments on a page', async () => {
      expect(commentPageId).toBeTruthy()

      const result = await runCLI(['comment', 'list', '--page', commentPageId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ results: Array<{ id: string; text: string }> }>(result.stdout)
      expect(data).not.toBeNull()
      expect(Array.isArray(data?.results)).toBe(true)
      expect(data!.results.length).toBeGreaterThan(0)

      await waitForRateLimit()
    }, 15000)

    test('comment get retrieves a specific comment', async () => {
      expect(createdCommentId).toBeTruthy()

      const result = await runCLI(['comment', 'get', createdCommentId])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{ id: string; text: string; author: { id: string } }>(result.stdout)
      expect(data).not.toBeNull()
      expect(data?.id).toBe(createdCommentId)
      expect(data?.text).toBeTruthy()

      await waitForRateLimit()
    }, 15000)
  })

  // ── batch ────────────────────────────────────────────────────────────

  describe('batch', () => {
    const batchPageIds: string[] = []

    afterAll(async () => {
      for (const pageId of batchPageIds) {
        try {
          await runCLI(['page', 'archive', pageId])
          await waitForRateLimit()
        } catch { /* best-effort */ }
      }
    }, 30000)

    test('batch with single page.create', async () => {
      await waitForRateLimit(2000)
      const testId = generateTestId()
      const operations = [
        {
          action: 'page.create',
          parent_id: containerId,
          title: `e2e-batch-single-${testId}`,
        },
      ]

      const result = await runCLI([
        'batch',
        JSON.stringify(operations),
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{
        results: Array<{ index: number; action: string; success: boolean; data?: { id: string } }>
        total: number
        succeeded: number
        failed: number
      }>(result.stdout)
      expect(data?.total).toBe(1)
      expect(data?.succeeded).toBe(1)
      expect(data?.failed).toBe(0)
      expect(data?.results).toHaveLength(1)
      expect(data?.results[0].index).toBe(0)
      expect(data?.results[0].action).toBe('page.create')
      expect(data?.results[0].success).toBe(true)
      expect(data?.results[0].data?.id).toBeTruthy()

      batchPageIds.push(data!.results[0].data!.id)
      await waitForRateLimit()
    }, 30000)

    test('batch with multiple operations', async () => {
      await waitForRateLimit(2000)
      const testId = generateTestId()

      // first create a page
      const createOps = [
        {
          action: 'page.create',
          parent_id: containerId,
          title: `e2e-batch-multi-${testId}`,
        },
      ]

      const createResult = await runCLI([
        'batch',
        JSON.stringify(createOps),
      ])
      expect(createResult.exitCode).toBe(0)

      const createData = parseJSON<{
        results: Array<{ index: number; action: string; success: boolean; data?: { id: string } }>
      }>(createResult.stdout)
      const createdPageId = createData!.results[0].data!.id
      batchPageIds.push(createdPageId)
      await waitForRateLimit()

      // then batch: create another page + archive the first
      const multiOps = [
        {
          action: 'page.create',
          parent_id: containerId,
          title: `e2e-batch-multi2-${testId}`,
        },
        {
          action: 'page.archive',
          page_id: createdPageId,
        },
      ]

      const result = await runCLI([
        'batch',
        JSON.stringify(multiOps),
      ])
      expect(result.exitCode).toBe(0)

      const data = parseJSON<{
        results: Array<{ index: number; action: string; success: boolean; data?: { id: string } }>
        total: number
        succeeded: number
        failed: number
      }>(result.stdout)
      expect(data?.total).toBe(2)
      expect(data?.succeeded).toBe(2)
      expect(data?.failed).toBe(0)
      expect(data?.results).toHaveLength(2)
      expect(data?.results[0].action).toBe('page.create')
      expect(data?.results[0].success).toBe(true)
      expect(data?.results[1].action).toBe('page.archive')
      expect(data?.results[1].success).toBe(true)

      if (data?.results[0].data?.id) {
        batchPageIds.push(data.results[0].data.id)
      }

      await waitForRateLimit()
    }, 30000)

    test('fail-fast on invalid operation', async () => {
      await waitForRateLimit(2000)
      const operations = [
        {
          action: 'page.archive',
          page_id: '00000000-0000-0000-0000-000000000000',
        },
      ]

      const result = await runCLI([
        'batch',
        JSON.stringify(operations),
      ])
      expect(result.exitCode).toBe(1)

      const data = parseJSON<{
        results: Array<{ index: number; action: string; success: boolean; error?: string }>
        total: number
        succeeded: number
        failed: number
      }>(result.stdout)
      expect(data?.results).toHaveLength(1)
      expect(data?.failed).toBe(1)
      expect(data?.succeeded).toBe(0)
      expect(data?.results[0].success).toBe(false)
      expect(data?.results[0].error).toBeTruthy()

      await waitForRateLimit()
    }, 30000)

    test('validation error on invalid action name', async () => {
      const operations = [
        {
          action: 'invalid.action',
          some_arg: 'value',
        },
      ]

      const result = await runCLI([
        'batch',
        JSON.stringify(operations),
      ])
      expect(result.exitCode).toBe(1)

      const data = parseJSON<{ error: string }>(result.stderr || result.stdout)
      expect(data?.error).toBeTruthy()

      await waitForRateLimit()
    }, 15000)

    test('--file input reads operations from file', async () => {
      await waitForRateLimit(2000)
      const testId = generateTestId()
      const operations = [
        {
          action: 'page.create',
          parent_id: containerId,
          title: `e2e-batch-file-${testId}`,
        },
      ]

      const tmpFile = join(tmpdir(), `e2e-notionbot-batch-${testId}.json`)
      writeFileSync(tmpFile, JSON.stringify(operations))

      try {
        const result = await runCLI([
          'batch',
          '--file',
          tmpFile,
          '_', // placeholder for required <operations> argument
        ])
        expect(result.exitCode).toBe(0)

        const data = parseJSON<{
          results: Array<{ index: number; action: string; success: boolean; data?: { id: string } }>
          total: number
          succeeded: number
          failed: number
        }>(result.stdout)
        expect(data?.total).toBe(1)
        expect(data?.succeeded).toBe(1)
        expect(data?.failed).toBe(0)
        expect(data?.results[0].success).toBe(true)

        if (data?.results[0].data?.id) {
          batchPageIds.push(data.results[0].data.id)
        }
      } finally {
        try { unlinkSync(tmpFile) } catch { /* best-effort */ }
      }

      await waitForRateLimit()
    }, 30000)
  })
})
