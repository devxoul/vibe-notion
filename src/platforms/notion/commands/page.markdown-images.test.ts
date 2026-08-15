import { describe, expect, mock, test } from 'bun:test'

const PAGE_ID = 'uuid-1'
const SPACE_ID = 'space-123'

// Lives in its own file because these cases need preprocessMarkdownImages to return an uploaded
// reference, and a module mock set by an earlier test in page.test.ts sticks to the loaded module.
function mockBoundaries(uploadedMarkdown: string): ReturnType<typeof mock> {
  const internalRequest = mock(async (_tokenV2: string, endpoint: string) => {
    if (endpoint === 'syncRecordValues') {
      return {
        recordMap: {
          block: {
            [PAGE_ID]: {
              value: {
                id: PAGE_ID,
                type: 'page',
                parent_id: 'parent-page',
                space_id: SPACE_ID,
                properties: { title: [['New Page']] },
              },
              role: 'editor',
            },
          },
        },
      }
    }
    if (endpoint === 'loadPageChunk') {
      return { recordMap: { block: { [PAGE_ID]: { value: { id: PAGE_ID, content: [] } } } } }
    }
    return {}
  })

  mock.module('../client', () => ({ internalRequest }))

  mock.module('./helpers', () => ({
    getCredentialsOrExit: mock(async () => ({ token_v2: 'test-token' })),
    generateId: mock(() => PAGE_ID),
    resolveSpaceId: mock(async () => SPACE_ID),
    resolveCollectionViewId: mock(async () => 'view-mock'),
    resolveAndSetActiveUserId: mock(async () => {}),
    resolveBacklinkUsers: mock(async () => ({})),
    resolveDefaultTeamId: mock(async () => undefined),
    ensureWorkspaceContext: mock(async () => ({ workspaceId: SPACE_ID, tokenV2: 'test-token' })),
    resolveWorkspaceFromTarget: mock(async () => ({ workspaceId: SPACE_ID, tokenV2: 'test-token' })),
    getAccountTokens: mock(() => [{ token_v2: 'test-token' }]),
  }))

  mock.module('@/shared/markdown/preprocess-images', () => ({
    preprocessMarkdownImages: mock(async () => uploadedMarkdown),
  }))

  mock.module('@/shared/markdown/read-input', () => ({
    readMarkdownInput: mock(() => '![Local](./images/cat.png)'),
  }))

  return internalRequest
}

function findImageOperations(internalRequest: ReturnType<typeof mock>): any[] {
  return (
    internalRequest.mock.calls
      .filter((call) => call[1] === 'saveTransactions')
      .map((call) => (call[2] as any)?.transactions?.[0]?.operations ?? [])
      .find((operations: any[]) => operations.some((operation) => operation.args?.type === 'image')) ?? []
  )
}

describe('page markdown image blocks', () => {
  test('page create persists the uploaded reference and claims the file id', async () => {
    // Given
    const internalRequest = mockBoundaries('![Local](attachment:file-123:cat.png)')
    const { handlePageCreate } = await import('./page')

    // When
    await handlePageCreate('test-token', {
      parent: 'parent-page',
      title: 'New Page',
      markdown: '![Local](./images/cat.png)',
      workspaceId: SPACE_ID,
    })

    // Then
    const operations = findImageOperations(internalRequest)
    expect(operations.find((operation) => operation.args?.type === 'image')?.args?.properties?.source).toEqual([
      ['attachment:file-123:cat.png'],
    ])
    expect(operations.find((operation) => operation.path?.[0] === 'file_ids')).toEqual(
      expect.objectContaining({
        pointer: { table: 'block', id: PAGE_ID, spaceId: SPACE_ID },
        command: 'listAfter',
        path: ['file_ids'],
        args: { id: 'file-123' },
      }),
    )
  })

  test('page update --replace-content persists the uploaded reference and claims the file id', async () => {
    // Given
    const internalRequest = mockBoundaries('![Local](attachment:file-456:cat.png)')
    const { handlePageUpdate } = await import('./page')

    // When
    await handlePageUpdate('test-token', {
      page_id: PAGE_ID,
      replaceContent: true,
      markdown: '![Local](./images/cat.png)',
      workspaceId: SPACE_ID,
    })

    // Then
    const operations = findImageOperations(internalRequest)
    expect(operations.find((operation) => operation.args?.type === 'image')?.args?.properties?.source).toEqual([
      ['attachment:file-456:cat.png'],
    ])
    expect(operations.find((operation) => operation.path?.[0] === 'file_ids')?.args).toEqual({ id: 'file-456' })
  })

  test('a remote markdown image is stored without claiming a file id', async () => {
    // Given
    const internalRequest = mockBoundaries('![Remote](https://example.com/cat.png)')
    const { handlePageCreate } = await import('./page')

    // When
    await handlePageCreate('test-token', {
      parent: 'parent-page',
      title: 'New Page',
      markdown: '![Local](./images/cat.png)',
      workspaceId: SPACE_ID,
    })

    // Then
    const operations = findImageOperations(internalRequest)
    expect(operations.find((operation) => operation.args?.type === 'image')?.args?.properties?.source).toEqual([
      ['https://example.com/cat.png'],
    ])
    expect(operations.find((operation) => operation.path?.[0] === 'file_ids')).toBeUndefined()
  })
})
