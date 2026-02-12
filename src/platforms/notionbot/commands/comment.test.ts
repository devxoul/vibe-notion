import { beforeEach, describe, expect, mock, test } from 'bun:test'

describe('CommentCommands', () => {
  beforeEach(() => {
    mock.restore()
  })

  test('comment list returns comments for page', async () => {
    const mockClient = {
      comments: {
        list: mock(() =>
          Promise.resolve({
            results: [
              {
                id: 'comment-1',
                created_time: '2024-01-01T00:00:00.000Z',
                last_edited_time: '2024-01-01T00:00:00.000Z',
                created_by: { id: 'user-1', object: 'user' },
                rich_text: [{ type: 'text', text: { content: 'Test comment' } }],
                discussion_id: 'discussion-1',
              },
            ],
            next_cursor: null,
            has_more: false,
          }),
        ),
      },
    }

    mock.module('../client', () => ({
      getClient: () => mockClient,
    }))

    const { commentCommand: cmd } = await import('./comment')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await cmd.parseAsync(['list', '--page', 'page-123'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog
    expect(output.length).toBeGreaterThan(0)
    const result = JSON.parse(output[0])
    expect(result.results).toBeDefined()
    expect(result.results.length).toBe(1)
  })

  test('comment list with pagination', async () => {
    const mockClient = {
      comments: {
        list: mock(() =>
          Promise.resolve({
            results: [],
            next_cursor: 'cursor-123',
            has_more: true,
          }),
        ),
      },
    }

    mock.module('../client', () => ({
      getClient: () => mockClient,
    }))

    const { commentCommand: cmd } = await import('./comment')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await cmd.parseAsync(['list', '--page', 'page-123', '--page-size', '10', '--start-cursor', 'cursor-456'], {
        from: 'user',
      })
    } catch {
      // Expected to exit
    }

    console.log = originalLog
    expect(mockClient.comments.list).toHaveBeenCalled()
    const callArgs = (mockClient.comments.list as any).mock.calls[0][0]
    expect(callArgs.page_size).toBe(10)
    expect(callArgs.start_cursor).toBe('cursor-456')
  })

  test('comment create on page', async () => {
    const mockClient = {
      comments: {
        create: mock(() =>
          Promise.resolve({
            id: 'comment-new',
            created_time: '2024-01-01T00:00:00.000Z',
            last_edited_time: '2024-01-01T00:00:00.000Z',
            created_by: { id: 'user-1', object: 'user' },
            rich_text: [{ type: 'text', text: { content: 'New comment' } }],
            discussion_id: 'discussion-new',
          }),
        ),
      },
    }

    mock.module('../client', () => ({
      getClient: () => mockClient,
    }))

    const { commentCommand: cmd } = await import('./comment')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await cmd.parseAsync(['create', '--page', 'page-123', 'Test comment text'], {
        from: 'user',
      })
    } catch {
      // Expected to exit
    }

    console.log = originalLog
    expect(mockClient.comments.create).toHaveBeenCalled()
    const callArgs = (mockClient.comments.create as any).mock.calls[0][0]
    expect(callArgs.parent.page_id).toBe('page-123')
    expect(callArgs.rich_text[0].text.content).toBe('Test comment text')
  })

  test('comment create reply to discussion', async () => {
    const mockClient = {
      comments: {
        create: mock(() =>
          Promise.resolve({
            id: 'comment-reply',
            created_time: '2024-01-01T00:00:00.000Z',
            last_edited_time: '2024-01-01T00:00:00.000Z',
            created_by: { id: 'user-1', object: 'user' },
            rich_text: [{ type: 'text', text: { content: 'Reply text' } }],
            discussion_id: 'discussion-1',
          }),
        ),
      },
    }

    mock.module('../client', () => ({
      getClient: () => mockClient,
    }))

    const { commentCommand: cmd } = await import('./comment')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await cmd.parseAsync(['create', '--discussion', 'discussion-1', 'Reply text'], {
        from: 'user',
      })
    } catch {
      // Expected to exit
    }

    console.log = originalLog
    expect(mockClient.comments.create).toHaveBeenCalled()
    const callArgs = (mockClient.comments.create as any).mock.calls[0][0]
    expect(callArgs.discussion_id).toBe('discussion-1')
    expect(callArgs.rich_text[0].text.content).toBe('Reply text')
  })

  test('comment get retrieves comment by ID', async () => {
    const mockClient = {
      comments: {
        retrieve: mock(() =>
          Promise.resolve({
            id: 'comment-1',
            created_time: '2024-01-01T00:00:00.000Z',
            last_edited_time: '2024-01-01T00:00:00.000Z',
            created_by: { id: 'user-1', object: 'user' },
            rich_text: [{ type: 'text', text: { content: 'Test comment' } }],
            discussion_id: 'discussion-1',
          }),
        ),
      },
    }

    mock.module('../client', () => ({
      getClient: () => mockClient,
    }))

    const { commentCommand: cmd } = await import('./comment')
    const output: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => output.push(msg)

    try {
      await cmd.parseAsync(['get', 'comment-1'], { from: 'user' })
    } catch {
      // Expected to exit
    }

    console.log = originalLog
    expect(mockClient.comments.retrieve).toHaveBeenCalled()
    const callArgs = (mockClient.comments.retrieve as any).mock.calls[0][0]
    expect(callArgs.comment_id).toBe('comment-1')
  })
})
