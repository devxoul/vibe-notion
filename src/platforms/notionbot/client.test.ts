import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { Client as NotionSDK } from '@notionhq/client'
import { getClient, NotionClient } from './client'

const mockBlocks = {
  retrieve: mock(() => Promise.resolve({})),
  update: mock(() => Promise.resolve({})),
  delete: mock(() => Promise.resolve({})),
  children: {
    append: mock(() => Promise.resolve({ results: [] })),
    list: mock(() => Promise.resolve({ results: [], has_more: false })),
  },
}

const mockPages = {
  create: mock(() => Promise.resolve({})),
  retrieve: mock(() => Promise.resolve({})),
  update: mock(() => Promise.resolve({})),
  move: mock(() => Promise.resolve({})),
  properties: { retrieve: mock(() => Promise.resolve({})) },
}

const mockDatabases = {
  retrieve: mock(() => Promise.resolve({})),
  create: mock(() => Promise.resolve({})),
  update: mock(() => Promise.resolve({})),
}

const mockUsers = {
  retrieve: mock(() => Promise.resolve({})),
  list: mock(() => Promise.resolve({ results: [] })),
  me: mock(() => Promise.resolve({ id: 'bot-1', type: 'bot', name: 'Test Bot' })),
}

const mockComments = {
  create: mock(() => Promise.resolve({})),
  list: mock(() => Promise.resolve({ results: [] })),
  retrieve: mock(() => Promise.resolve({})),
}

const mockSearch = mock(() => Promise.resolve({ results: [] }))

function createMockSDK() {
  return {
    blocks: mockBlocks,
    pages: mockPages,
    databases: mockDatabases,
    users: mockUsers,
    comments: mockComments,
    search: mockSearch,
  } as unknown as NotionSDK
}

function resetMocks() {
  for (const group of [mockBlocks, mockPages, mockDatabases, mockUsers, mockComments]) {
    for (const val of Object.values(group)) {
      if (typeof val === 'object' && val !== null) {
        for (const fn of Object.values(val)) {
          if (typeof (fn as any).mockReset === 'function') (fn as any).mockReset()
        }
      }
      if (typeof (val as any).mockReset === 'function') (val as any).mockReset()
    }
  }
  mockSearch.mockReset()
}

describe('NotionClient', () => {
  describe('constructor', () => {
    test('throws error when no token is provided', () => {
      // When/Then
      expect(() => new NotionClient('')).toThrow('NOTION_TOKEN')
      expect(() => new NotionClient('')).toThrow('notion.so/profile/integrations')
    })

    test('creates client successfully with valid token', () => {
      // When
      const client = new NotionClient('ntn_test123')

      // Then
      expect(client).toBeInstanceOf(NotionClient)
    })
  })

  describe('exposed SDK methods', () => {
    test('exposes pages, databases, blocks, users, search, comments', () => {
      // Given
      const client = new NotionClient('ntn_test123')

      // Then
      expect(client.pages).toBeDefined()
      expect(client.databases).toBeDefined()
      expect(client.blocks).toBeDefined()
      expect(client.users).toBeDefined()
      expect(client.search).toBeDefined()
      expect(client.comments).toBeDefined()
    })
  })

  describe('appendBlockChildren', () => {
    beforeEach(() => resetMocks())

    test('sends all blocks in single request when count <= 100', async () => {
      // Given
      const client = new NotionClient('ntn_test123')
      // @ts-expect-error - accessing private property for testing
      client.sdk = createMockSDK()

      const blocks = Array.from({ length: 50 }, () => ({
        paragraph: { rich_text: [{ text: { content: 'test' } }] },
      }))

      mockBlocks.children.append.mockResolvedValue({
        results: blocks,
      })

      // When
      await client.appendBlockChildren('block-1', blocks as any)

      // Then
      expect(mockBlocks.children.append).toHaveBeenCalledTimes(1)
      expect(mockBlocks.children.append).toHaveBeenCalledWith(
        expect.objectContaining({
          block_id: 'block-1',
          children: expect.arrayContaining([expect.any(Object)]),
        }),
      )
    })

    test('chunks blocks into multiple requests when count > 100', async () => {
      // Given
      const client = new NotionClient('ntn_test123')
      // @ts-expect-error - accessing private property for testing
      client.sdk = createMockSDK()

      const blocks = Array.from({ length: 250 }, () => ({
        paragraph: { rich_text: [{ text: { content: 'test' } }] },
      }))

      mockBlocks.children.append.mockResolvedValue({ results: [] })

      // When
      await client.appendBlockChildren('block-1', blocks as any)

      // Then: 250 blocks = 100 + 100 + 50 = 3 calls
      expect(mockBlocks.children.append).toHaveBeenCalledTimes(3)
    })

    test('chunks exactly 100 blocks per request', async () => {
      // Given
      const client = new NotionClient('ntn_test123')
      // @ts-expect-error - accessing private property for testing
      client.sdk = createMockSDK()

      const blocks = Array.from({ length: 200 }, (_, i) => ({
        paragraph: { rich_text: [{ text: { content: `block-${i}` } }] },
      }))

      mockBlocks.children.append.mockResolvedValue({ results: [] })

      // When
      await client.appendBlockChildren('block-1', blocks as any)

      // Then
      expect(mockBlocks.children.append).toHaveBeenCalledTimes(2)

      const firstCallChildren = mockBlocks.children.append.mock.calls[0][0].children
      const secondCallChildren = mockBlocks.children.append.mock.calls[1][0].children
      expect(firstCallChildren).toHaveLength(100)
      expect(secondCallChildren).toHaveLength(100)
    })
  })
})

describe('getClient', () => {
  test('throws error when NOTION_TOKEN env var is not set', () => {
    // Given
    const original = process.env.NOTION_TOKEN
    delete process.env.NOTION_TOKEN

    try {
      // When/Then
      expect(() => getClient()).toThrow('NOTION_TOKEN')
    } finally {
      // Restore
      if (original !== undefined) process.env.NOTION_TOKEN = original
    }
  })

  test('returns NotionClient when NOTION_TOKEN is set', () => {
    // Given
    const original = process.env.NOTION_TOKEN
    process.env.NOTION_TOKEN = 'ntn_test_env_token'

    try {
      // When
      const client = getClient()

      // Then
      expect(client).toBeInstanceOf(NotionClient)
    } finally {
      // Restore
      if (original !== undefined) {
        process.env.NOTION_TOKEN = original
      } else {
        delete process.env.NOTION_TOKEN
      }
    }
  })
})
