import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const mockPageRetrieve = mock(() => Promise.resolve({}))
const mockPageCreate = mock(() => Promise.resolve({}))
const mockPageUpdate = mock(() => Promise.resolve({}))
const mockPagePropertyRetrieve = mock(() => Promise.resolve({}))
const mockAppendBlockChildren = mock(() => Promise.resolve([{ results: [] }] as any))
const mockBlockChildrenList = mock(() => Promise.resolve({ results: [], has_more: false, next_cursor: null }))
const mockBlockDelete = mock(() => Promise.resolve({}))
const mockUploadFile = mock(() =>
  Promise.resolve({
    id: 'uploaded-block-1',
    type: 'image' as const,
    url: 'https://www.notion.so/file-uploads/upload-123',
  }),
)
const mockUploadFileOnly = mock(() =>
  Promise.resolve({
    fileUploadId: 'upload-123',
    url: 'https://www.notion.so/file-uploads/upload-123',
    contentType: 'image/png',
  }),
)
const mockPreprocessMarkdownImages = mock(
  (markdown: string, _uploadFn: (filePath: string) => Promise<string>, _basePath: string) => Promise.resolve(markdown),
)

const mockRequest = mock(() => Promise.resolve({}))

mock.module('../client', () => ({
  getClient: () => ({
    pages: {
      retrieve: mockPageRetrieve,
      create: mockPageCreate,
      update: mockPageUpdate,
      properties: { retrieve: mockPagePropertyRetrieve },
    },
    blocks: {
      children: { list: mockBlockChildrenList },
      delete: mockBlockDelete,
    },
    appendBlockChildren: mockAppendBlockChildren,
    request: mockRequest,
  }),
}))

mock.module('@/platforms/notionbot/upload', () => ({
  uploadFile: mockUploadFile,
  uploadFileOnly: mockUploadFileOnly,
}))

mock.module('@/shared/markdown/preprocess-images', () => ({
  preprocessMarkdownImages: mockPreprocessMarkdownImages,
}))

const { pageCommand } = await import('./page')

describe('page commands', () => {
  let consoleOutput: string[]
  let consoleErrors: string[]
  let originalLog: typeof console.log
  let originalError: typeof console.error
  let originalExit: typeof process.exit

  beforeEach(() => {
    consoleOutput = []
    consoleErrors = []
    originalLog = console.log
    originalError = console.error
    originalExit = process.exit

    console.log = (...args: any[]) => consoleOutput.push(args.join(' '))
    console.error = (...args: any[]) => consoleErrors.push(args.join(' '))
    process.exit = mock(() => {
      throw new Error('process.exit called')
    }) as any

    mockPageRetrieve.mockReset()
    mockPageCreate.mockReset()
    mockPageUpdate.mockReset()
    mockPagePropertyRetrieve.mockReset()
    mockAppendBlockChildren.mockReset()
    mockBlockChildrenList.mockReset()
    mockBlockDelete.mockReset()
    mockRequest.mockReset()
    mockRequest.mockResolvedValue({
      id: 'page-123',
      object: 'page',
      url: 'https://notion.so/page-123',
      archived: false,
      last_edited_time: '2024-01-01T00:00:00.000Z',
      parent: { type: 'page_id', page_id: 'parent-1' },
      properties: {},
    })
    mockUploadFile.mockReset()
    mockUploadFile.mockImplementation(() =>
      Promise.resolve({
        id: 'uploaded-block-1',
        type: 'image' as const,
        url: 'https://www.notion.so/file-uploads/upload-123',
      }),
    )
    mockUploadFileOnly.mockReset()
    mockUploadFileOnly.mockImplementation(() =>
      Promise.resolve({
        fileUploadId: 'upload-123',
        url: 'https://www.notion.so/file-uploads/upload-123',
        contentType: 'image/png',
      }),
    )
    mockPreprocessMarkdownImages.mockReset()
    mockPreprocessMarkdownImages.mockImplementation(
      (markdown: string, _uploadFn: (filePath: string) => Promise<string>, _basePath: string) =>
        Promise.resolve(markdown),
    )
  })

  afterEach(() => {
    console.log = originalLog
    console.error = originalError
    process.exit = originalExit
  })

  describe('page get', () => {
    test('retrieves a page by id', async () => {
      // Given
      mockPageRetrieve.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {
          Name: { id: 'title', type: 'title', title: [{ plain_text: 'Test Page' }] },
        },
      })

      // When
      await pageCommand.parseAsync(['get', 'page-123'], { from: 'user' })

      // Then
      expect(mockPageRetrieve).toHaveBeenCalledWith({ page_id: 'page-123' })
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('page-123')
      expect(output.title).toBe('Test Page')
      expect(output.url).toBe('https://notion.so/page-123')
      expect(output.properties.Name).toBe('Test Page')
    })

    test('handles not found error with sharing hint', async () => {
      // Given
      const error = new Error('Could not find page')
      ;(error as any).code = 'object_not_found'
      mockPageRetrieve.mockRejectedValue(error)

      // When
      try {
        await pageCommand.parseAsync(['get', 'not-found-id'], { from: 'user' })
      } catch {
        // handleError calls process.exit which our mock throws
      }

      // Then
      const allOutput = [...consoleOutput, ...consoleErrors].join('\n')
      expect(allOutput).toContain('Could not find page')
    })
  })

  describe('page create', () => {
    test('creates a page under a page parent with title', async () => {
      // Given
      mockPageCreate.mockResolvedValue({
        id: 'new-page-456',
        object: 'page',
        url: 'https://notion.so/new-page-456',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-123' },
        properties: {
          title: { id: 'title', type: 'title', title: [{ plain_text: 'My Page' }] },
        },
      })

      // When
      await pageCommand.parseAsync(['create', '--parent', 'parent-123', '--title', 'My Page'], {
        from: 'user',
      })

      // Then
      expect(mockPageCreate).toHaveBeenCalledWith({
        parent: { page_id: 'parent-123' },
        properties: {
          title: { title: [{ text: { content: 'My Page' } }] },
        },
      })
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('new-page-456')
      expect(output.title).toBe('My Page')
    })

    test('creates a page under a database parent when --database flag used', async () => {
      // Given
      mockPageCreate.mockResolvedValue({
        id: 'new-page-789',
        object: 'page',
        url: 'https://notion.so/new-page-789',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'database_id', database_id: 'db-123' },
        properties: {
          Name: { id: 'title', type: 'title', title: [{ plain_text: 'DB Entry' }] },
        },
      })

      // When
      await pageCommand.parseAsync(['create', '--parent', 'db-123', '--title', 'DB Entry', '--database'], {
        from: 'user',
      })

      // Then
      expect(mockPageCreate).toHaveBeenCalledWith({
        parent: { database_id: 'db-123' },
        properties: {
          title: { title: [{ text: { content: 'DB Entry' } }] },
        },
      })
    })

    test('creates a page with markdown content appended', async () => {
      // Given
      mockPageCreate.mockResolvedValue({
        id: 'new-page-md',
        object: 'page',
        url: 'https://notion.so/new-page-md',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-123' },
        properties: {
          title: { id: 'title', type: 'title', title: [{ plain_text: 'Page with Markdown' }] },
        },
      })
      mockAppendBlockChildren.mockResolvedValue([{ results: [] }] as any)

      // When
      await pageCommand.parseAsync(
        ['create', '--parent', 'parent-123', '--title', 'Page with Markdown', '--markdown', '# Hello\n\nWorld'],
        { from: 'user' },
      )

      // Then
      expect(mockPageCreate).toHaveBeenCalledWith({
        parent: { page_id: 'parent-123' },
        properties: {
          title: { title: [{ text: { content: 'Page with Markdown' } }] },
        },
      })
      expect(mockPreprocessMarkdownImages).toHaveBeenCalledWith('# Hello\n\nWorld', expect.any(Function), process.cwd())
      expect(mockUploadFile).not.toHaveBeenCalled()
      expect(mockAppendBlockChildren).toHaveBeenCalled()
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('new-page-md')
      expect(output.title).toBe('Page with Markdown')
    })

    test('create markdown preprocessing can upload local images', async () => {
      // Given
      mockPageCreate.mockResolvedValue({
        id: 'new-page-md',
        object: 'page',
        url: 'https://notion.so/new-page-md',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-123' },
        properties: {
          title: { id: 'title', type: 'title', title: [{ plain_text: 'Page with Markdown' }] },
        },
      })
      mockPreprocessMarkdownImages.mockImplementation(
        async (markdown: string, uploadFn: (filePath: string) => Promise<string>, _basePath: string) => {
          const uploadedUrl = await uploadFn('/tmp/local-image.png')
          return markdown.replace('/tmp/local-image.png', uploadedUrl)
        },
      )

      // When
      await pageCommand.parseAsync(
        [
          'create',
          '--parent',
          'parent-123',
          '--title',
          'Page with Markdown',
          '--markdown',
          '![local](/tmp/local-image.png)',
        ],
        { from: 'user' },
      )

      // Then
      expect(mockPreprocessMarkdownImages).toHaveBeenCalledWith(
        '![local](/tmp/local-image.png)',
        expect.any(Function),
        process.cwd(),
      )
      expect(mockUploadFileOnly).toHaveBeenCalledWith(expect.anything(), '/tmp/local-image.png')
    })
  })

  describe('page update', () => {
    test('updates page properties with --set key=value pairs', async () => {
      // Given
      mockRequest.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {},
      })
      mockPageRetrieve.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {
          Status: { id: 'status-id', type: 'status', status: { name: 'In Progress' } },
        },
      })

      // When
      await pageCommand.parseAsync(['update', 'page-123', '--set', 'Status=Done'], {
        from: 'user',
      })

      // Then
      expect(mockRequest).toHaveBeenCalledWith({
        path: 'pages/page-123',
        method: 'patch',
        body: {
          properties: {
            Status: {
              status: { name: 'Done' },
            },
          },
        },
      })
      expect(mockRequest).toHaveBeenCalledTimes(1)
      expect(mockPageRetrieve).toHaveBeenCalledTimes(1)
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('page-123')
    })

    test('handles multiple --set flags', async () => {
      // Given
      mockRequest.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {},
      })
      mockPageRetrieve.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {
          Status: { id: 'status-id', type: 'status', status: { name: 'In Progress' } },
          Priority: { id: 'priority-id', type: 'select', select: { name: 'Low' } },
        },
      })

      // When
      // Property IDs remain stable when names change, so ID-based updates must preserve the ID in the PATCH payload.
      await pageCommand.parseAsync(['update', 'page-123', '--set', 'status-id=Done', '--set', 'Priority=High'], {
        from: 'user',
      })

      // Then
      expect(mockRequest).toHaveBeenCalledWith({
        path: 'pages/page-123',
        method: 'patch',
        body: {
          properties: {
            'status-id': {
              status: { name: 'Done' },
            },
            Priority: {
              select: { name: 'High' },
            },
          },
        },
      })
      expect(mockRequest).toHaveBeenCalledTimes(1)
      expect(mockPageRetrieve).toHaveBeenCalledTimes(1)
    })

    test('serializes primitive property values using the page schema', async () => {
      // Given
      mockPageRetrieve.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {
          Estimate: { id: 'estimate-id', type: 'number', number: 1 },
          Done: { id: 'done-id', type: 'checkbox', checkbox: false },
          Due: { id: 'due-id', type: 'date', date: null },
          DueTime: { id: 'due-time-id', type: 'date', date: null },
        },
      })

      // When
      await pageCommand.parseAsync(
        [
          'update',
          'page-123',
          '--set',
          'Estimate=3',
          '--set',
          'Done=false',
          '--set',
          'Due=2026-08-24',
          '--set',
          'DueTime=2026-08-24T14:30:00+09:00',
        ],
        { from: 'user' },
      )

      // Then
      expect(mockRequest).toHaveBeenCalledWith({
        path: 'pages/page-123',
        method: 'patch',
        body: {
          properties: {
            Estimate: { number: 3 },
            Done: { checkbox: false },
            Due: { date: { start: '2026-08-24' } },
            DueTime: { date: { start: '2026-08-24T14:30:00+09:00' } },
          },
        },
      })
      expect(mockRequest).toHaveBeenCalledTimes(1)
    })

    test('serializes text, list, link, people, and relation properties', async () => {
      // Given
      mockPageRetrieve.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {
          Title: { id: 'title-id', type: 'title', title: [] },
          Description: { id: 'description-id', type: 'rich_text', rich_text: [] },
          Tags: { id: 'tags-id', type: 'multi_select', multi_select: [] },
          JsonTags: { id: 'json-tags-id', type: 'multi_select', multi_select: [] },
          Website: { id: 'website-id', type: 'url', url: null },
          Email: { id: 'email-id', type: 'email', email: null },
          Phone: { id: 'phone-id', type: 'phone_number', phone_number: null },
          Owners: { id: 'owners-id', type: 'people', people: [] },
          Related: { id: 'related-id', type: 'relation', relation: [] },
        },
      })

      // When
      await pageCommand.parseAsync(
        [
          'update',
          'page-123',
          '--set',
          'Title=Release notes',
          '--set',
          'Description=Ready',
          '--set',
          'Tags=alpha,beta',
          '--set',
          'JsonTags=["alpha","beta"]',
          '--set',
          'Website=https://example.com',
          '--set',
          'Email=owner@example.com',
          '--set',
          'Phone=+821012345678',
          '--set',
          'Owners=user-1,user-2',
          '--set',
          'Related=page-1,page-2',
        ],
        { from: 'user' },
      )

      // Then
      expect(mockRequest).toHaveBeenCalledWith({
        path: 'pages/page-123',
        method: 'patch',
        body: {
          properties: {
            Title: { title: [{ type: 'text', text: { content: 'Release notes' } }] },
            Description: { rich_text: [{ type: 'text', text: { content: 'Ready' } }] },
            Tags: { multi_select: [{ name: 'alpha' }, { name: 'beta' }] },
            JsonTags: { multi_select: [{ name: 'alpha' }, { name: 'beta' }] },
            Website: { url: 'https://example.com' },
            Email: { email: 'owner@example.com' },
            Phone: { phone_number: '+821012345678' },
            Owners: { people: [{ id: 'user-1' }, { id: 'user-2' }] },
            Related: { relation: [{ id: 'page-1' }, { id: 'page-2' }] },
          },
        },
      })
      expect(mockRequest).toHaveBeenCalledTimes(1)
    })

    test('clears nullable properties with empty values', async () => {
      // Given
      mockPageRetrieve.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {
          Status: { id: 'status-id', type: 'status', status: { name: 'Done' } },
          Estimate: { id: 'estimate-id', type: 'number', number: 3 },
          Due: { id: 'due-id', type: 'date', date: { start: '2026-08-24' } },
        },
      })

      // When
      await pageCommand.parseAsync(['update', 'page-123', '--set', 'Status=', '--set', 'Estimate= ', '--set', 'Due='], {
        from: 'user',
      })

      // Then
      expect(mockRequest).toHaveBeenCalledWith({
        path: 'pages/page-123',
        method: 'patch',
        body: {
          properties: {
            Status: { status: null },
            Estimate: { number: null },
            Due: { date: null },
          },
        },
      })
      expect(mockRequest).toHaveBeenCalledTimes(1)
    })

    test('rejects invalid property updates before sending a patch', async () => {
      // Given
      const cases = [
        {
          properties: { Estimate: { id: 'estimate-id', type: 'number', number: 1 } },
          update: 'Estimate=0x10',
          error: 'Invalid number value',
        },
        {
          properties: { Done: { id: 'done-id', type: 'checkbox', checkbox: false } },
          update: 'Done=maybe',
          error: 'Invalid checkbox value',
        },
        {
          properties: { Due: { id: 'due-id', type: 'date', date: null } },
          update: 'Due=not-a-date',
          error: 'Invalid date value',
        },
        {
          properties: { Due: { id: 'due-id', type: 'date', date: null } },
          update: 'Due=2026-02-30',
          error: 'Invalid date value',
        },
        {
          properties: { Tags: { id: 'tags-id', type: 'multi_select', multi_select: [] } },
          update: 'Tags=["broken"',
          error: 'Invalid list value',
        },
        {
          properties: { Tags: { id: 'tags-id', type: 'multi_select', multi_select: [] } },
          update: 'Tags=[1]',
          error: 'Expected a list of strings',
        },
        {
          properties: { Formula: { id: 'formula-id', type: 'formula', formula: { string: 'x' } } },
          update: 'Formula=x',
          error: 'cannot be updated with --set',
        },
        {
          properties: { Status: { id: 'status-id', type: 'status', status: { name: 'Done' } } },
          update: 'DoesNotExist=x',
          error: 'was not found on the page',
        },
        {
          properties: undefined,
          update: 'Anything=x',
          error: 'Could not read page properties',
        },
      ]

      for (const testCase of cases) {
        mockPageRetrieve.mockReset()
        mockPageRetrieve.mockResolvedValue({ properties: testCase.properties })
        mockRequest.mockReset()
        const outputStart = consoleOutput.length
        const errorStart = consoleErrors.length

        // When
        try {
          await pageCommand.parseAsync(['update', 'page-123', '--set', testCase.update], { from: 'user' })
        } catch {}

        // Then
        expect(mockRequest).not.toHaveBeenCalled()
        expect([...consoleOutput.slice(outputStart), ...consoleErrors.slice(errorStart)].join('\n')).toContain(
          testCase.error,
        )
      }
    })

    test('does not send a partial patch when one property update is invalid', async () => {
      // Given
      mockPageRetrieve.mockResolvedValue({
        properties: {
          Estimate: { id: 'estimate-id', type: 'number', number: 1 },
          Done: { id: 'done-id', type: 'checkbox', checkbox: false },
        },
      })
      mockRequest.mockReset()

      // When
      try {
        await pageCommand.parseAsync(['update', 'page-123', '--set', 'Estimate=3', '--set', 'Done=maybe'], {
          from: 'user',
        })
      } catch {}

      // Then
      expect(mockRequest).not.toHaveBeenCalled()
      expect([...consoleOutput, ...consoleErrors].join('\n')).toContain('Invalid checkbox value')
    })

    test('replace-content deletes old blocks and appends new markdown', async () => {
      // Given
      mockBlockChildrenList.mockResolvedValue({
        results: [{ id: 'old-block-1' }, { id: 'old-block-2' }],
        has_more: false,
        next_cursor: null,
      } as any)
      mockBlockDelete.mockResolvedValue({})
      mockAppendBlockChildren.mockResolvedValue([{ results: [] }] as any)
      mockPageRetrieve.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {
          Name: { id: 'title', type: 'title', title: [{ plain_text: 'Test Page' }] },
        },
      })

      // When
      await pageCommand.parseAsync(['update', 'page-123', '--replace-content', '--markdown', '# New Content'], {
        from: 'user',
      })

      // Then
      expect(mockBlockChildrenList).toHaveBeenCalled()
      expect(mockBlockDelete).toHaveBeenCalledTimes(2)
      expect(mockBlockDelete).toHaveBeenCalledWith({ block_id: 'old-block-1' })
      expect(mockBlockDelete).toHaveBeenCalledWith({ block_id: 'old-block-2' })
      expect(mockPreprocessMarkdownImages).toHaveBeenCalledWith('# New Content', expect.any(Function), process.cwd())
      expect(mockUploadFile).not.toHaveBeenCalled()
      expect(mockAppendBlockChildren).toHaveBeenCalled()
      const output = JSON.parse(consoleOutput[0])
      expect(output.id).toBe('page-123')
    })

    test('replace-content preprocessing can upload local images', async () => {
      // Given
      mockBlockChildrenList.mockResolvedValue({
        results: [],
        has_more: false,
        next_cursor: null,
      } as any)
      mockPageRetrieve.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: false,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {
          Name: { id: 'title', type: 'title', title: [{ plain_text: 'Test Page' }] },
        },
      })
      mockPreprocessMarkdownImages.mockImplementation(
        async (markdown: string, uploadFn: (filePath: string) => Promise<string>, _basePath: string) => {
          const uploadedUrl = await uploadFn('/tmp/local-image.png')
          return markdown.replace('/tmp/local-image.png', uploadedUrl)
        },
      )

      // When
      await pageCommand.parseAsync(
        ['update', 'page-123', '--replace-content', '--markdown', '![local](/tmp/local-image.png)'],
        {
          from: 'user',
        },
      )

      // Then
      expect(mockPreprocessMarkdownImages).toHaveBeenCalledWith(
        '![local](/tmp/local-image.png)',
        expect.any(Function),
        process.cwd(),
      )
      expect(mockUploadFileOnly).toHaveBeenCalledWith(expect.anything(), '/tmp/local-image.png')
    })

    test('replace-content without --markdown errors', async () => {
      // When
      try {
        await pageCommand.parseAsync(['update', 'page-123', '--replace-content'], { from: 'user' })
      } catch {}

      // Then
      const allOutput = [...consoleOutput, ...consoleErrors].join('\n')
      expect(allOutput).toContain('--replace-content requires --markdown or --markdown-file')
    })

    test('append failure after delete shows clear error', async () => {
      // Given
      mockBlockChildrenList.mockResolvedValue({
        results: [{ id: 'old-block-1' }],
        has_more: false,
        next_cursor: null,
      } as any)
      mockBlockDelete.mockResolvedValue({})
      mockAppendBlockChildren.mockRejectedValue(new Error('API rate limit'))

      // When
      try {
        await pageCommand.parseAsync(['update', 'page-123', '--replace-content', '--markdown', '# New Content'], {
          from: 'user',
        })
      } catch {}

      // Then
      const allOutput = [...consoleOutput, ...consoleErrors].join('\n')
      expect(allOutput).toContain('Page content cleared but new content failed to append')
    })
  })

  describe('page archive', () => {
    test('archives a page by setting archived=true', async () => {
      // Given
      mockPageUpdate.mockResolvedValue({
        id: 'page-123',
        object: 'page',
        url: 'https://notion.so/page-123',
        archived: true,
        last_edited_time: '2024-01-01T00:00:00.000Z',
        parent: { type: 'page_id', page_id: 'parent-1' },
        properties: {},
      })

      // When
      await pageCommand.parseAsync(['archive', 'page-123'], { from: 'user' })

      // Then
      expect(mockPageUpdate).toHaveBeenCalledWith({
        page_id: 'page-123',
        archived: true,
      })
      const output = JSON.parse(consoleOutput[0])
      expect(output.archived).toBe(true)
    })
  })

  describe('page property', () => {
    test('retrieves a specific page property', async () => {
      // Given
      mockPagePropertyRetrieve.mockResolvedValue({
        object: 'property_item',
        type: 'title',
        title: { plain_text: 'Hello' },
      })

      // When
      await pageCommand.parseAsync(['property', 'page-123', 'title-prop-id'], { from: 'user' })

      // Then
      expect(mockPagePropertyRetrieve).toHaveBeenCalledWith({
        page_id: 'page-123',
        property_id: 'title-prop-id',
      })
      const output = JSON.parse(consoleOutput[0])
      expect(output.type).toBe('title')
    })
  })
})
