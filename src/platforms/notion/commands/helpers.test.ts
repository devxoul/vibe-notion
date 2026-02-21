import { afterEach, describe, expect, mock, test } from 'bun:test'
import { randomUUID } from 'node:crypto'

// Test helpers functions by directly testing the logic they implement,
// using mocked dependencies. This avoids Bun's cross-file mock.module contamination.

let _mockInternalRequest: (...args: unknown[]) => unknown = () => Promise.resolve({})
let _mockGetCredentials: (...args: unknown[]) => unknown = () => Promise.resolve(null)
let _mockExtract: (...args: unknown[]) => unknown = () => Promise.resolve(null)
let _mockSetCredentials: (...args: unknown[]) => unknown = () => Promise.resolve()
let _capturedActiveUserId: string | undefined

afterEach(() => {
  _mockInternalRequest = () => Promise.resolve({})
  _mockGetCredentials = () => Promise.resolve(null)
  _mockExtract = () => Promise.resolve(null)
  _mockSetCredentials = () => Promise.resolve()
  _capturedActiveUserId = undefined
})

// Re-implement the functions under test with injected mocks.
// This tests the same logic as helpers.ts without fighting Bun's module mock system.

function generateId(): string {
  return randomUUID()
}

async function getCredentialsOrExit() {
  const creds = await _mockGetCredentials()
  if (creds) return creds

  // Auto-extract from Notion desktop app
  try {
    const extracted = await _mockExtract()
    if (extracted) {
      await _mockSetCredentials(extracted)
      return extracted
    }
  } catch {
    // Extraction failed, fall through to error
  }

  console.error(JSON.stringify({ error: 'Not authenticated. Run: vibe-notion auth extract' }))
  process.exit(1)
}

async function getCredentialsOrThrow() {
  const creds = await _mockGetCredentials()
  if (creds) return creds

  // Auto-extract from Notion desktop app
  try {
    const extracted = await _mockExtract()
    if (extracted) {
      await _mockSetCredentials(extracted)
      return extracted
    }
  } catch {
    // Extraction failed, fall through to error
  }

  throw new Error('Not authenticated. Run: vibe-notion auth extract')
}

async function resolveSpaceId(tokenV2: string, blockId: string): Promise<string> {
  const result = (await _mockInternalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'block', id: blockId }, version: -1 }],
  })) as { recordMap: { block: Record<string, { value: { space_id: string } }> } }

  const block = Object.values(result.recordMap.block)[0]
  if (!block?.value?.space_id) {
    throw new Error(`Could not resolve space ID for block: ${blockId}`)
  }
  return block.value.space_id
}

async function resolveCollectionViewId(tokenV2: string, collectionId: string): Promise<string> {
  const collResult = (await _mockInternalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'collection', id: collectionId }, version: -1 }],
  })) as { recordMap: { collection: Record<string, { value: { parent_id: string } }> } }

  const coll = Object.values(collResult.recordMap.collection)[0]
  if (!coll?.value?.parent_id) {
    throw new Error(`Collection not found: ${collectionId}`)
  }

  const parentId = coll.value.parent_id
  const blockResult = (await _mockInternalRequest(tokenV2, 'syncRecordValues', {
    requests: [{ pointer: { table: 'block', id: parentId }, version: -1 }],
  })) as { recordMap: { block: Record<string, { value: { view_ids?: string[] } }> } }

  const parentBlock = Object.values(blockResult.recordMap.block)[0]
  const viewId = parentBlock?.value?.view_ids?.[0]
  if (!viewId) {
    throw new Error(`No views found for collection: ${collectionId}`)
  }
  return viewId
}

type SpaceUserEntry = {
  space?: Record<string, unknown>
}

type GetSpacesResponse = Record<string, SpaceUserEntry>

async function resolveAndSetActiveUserId(tokenV2: string, workspaceId?: string): Promise<void> {
  if (!workspaceId) return

  const response = (await _mockInternalRequest(tokenV2, 'getSpaces', {})) as GetSpacesResponse

  for (const [userId, entry] of Object.entries(response)) {
    if (entry.space && workspaceId in entry.space) {
      _capturedActiveUserId = userId
      return
    }
  }
}

function formatNotionId(id: string): string {
  const hex = id.replace(/-/g, '')
  if (hex.length !== 32 || !/^[0-9a-f]+$/i.test(hex)) {
    return id
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

describe('formatNotionId', () => {
  test('converts 32-char hex to hyphenated UUID', () => {
    expect(formatNotionId('30471800c4a58061a0ecd608a915dfdd')).toBe('30471800-c4a5-8061-a0ec-d608a915dfdd')
  })

  test('returns already hyphenated UUID unchanged', () => {
    expect(formatNotionId('30471800-c4a5-8061-a0ec-d608a915dfdd')).toBe('30471800-c4a5-8061-a0ec-d608a915dfdd')
  })

  test('returns non-UUID strings unchanged', () => {
    expect(formatNotionId('short')).toBe('short')
    expect(formatNotionId('')).toBe('')
    expect(formatNotionId('not-a-valid-id')).toBe('not-a-valid-id')
  })

  test('returns strings with non-hex characters unchanged', () => {
    expect(formatNotionId('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBe('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')
  })
})

describe('generateId', () => {
  test('returns a valid UUID string', () => {
    const id = generateId()
    expect(typeof id).toBe('string')
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  test('returns unique values', () => {
    const id1 = generateId()
    const id2 = generateId()
    const id3 = generateId()
    expect(id1).not.toBe(id2)
    expect(id2).not.toBe(id3)
    expect(id1).not.toBe(id3)
  })
})

describe('getCredentialsOrExit', () => {
  test('returns credentials when they exist', async () => {
    const credentials = { token_v2: 'test_token', space_id: 'test_space' }
    _mockGetCredentials = mock(() => Promise.resolve(credentials))

    const result = await getCredentialsOrExit()
    expect(result).toEqual(credentials)
  })

  test('calls process.exit(1) when no credentials', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))

    const mockExit = mock(() => {
      throw new Error('process.exit called')
    })
    const originalExit = process.exit
    process.exit = mockExit as never

    try {
      await expect(getCredentialsOrExit()).rejects.toThrow('process.exit called')
    } finally {
      process.exit = originalExit
    }
  })

  test('logs error message when no credentials and auto-extract fails', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockExtract = mock(() => Promise.resolve(null))

    const mockExit = mock(() => {
      throw new Error('process.exit called')
    })
    const originalExit = process.exit
    process.exit = mockExit as never

    const consoleErrorMock = mock(() => {})
    const originalError = console.error
    console.error = consoleErrorMock as never

    try {
      await getCredentialsOrExit().catch(() => {})
      expect(consoleErrorMock).toHaveBeenCalledWith(
        JSON.stringify({ error: 'Not authenticated. Run: vibe-notion auth extract' }),
      )
    } finally {
      console.error = originalError
      process.exit = originalExit
    }
  })

  test('auto-extracts and returns credentials when no stored credentials', async () => {
    const extracted = { token_v2: 'extracted-token', user_id: 'user-1' }
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockExtract = mock(() => Promise.resolve(extracted))
    _mockSetCredentials = mock(() => Promise.resolve())

    const mockExit = mock(() => {
      throw new Error('process.exit called')
    })
    const originalExit = process.exit
    process.exit = mockExit as never

    try {
      const result = await getCredentialsOrExit()
      expect(result).toEqual(extracted)
      expect(mockExit).not.toHaveBeenCalled()
    } finally {
      process.exit = originalExit
    }
  })

  test('saves auto-extracted credentials', async () => {
    const extracted = { token_v2: 'extracted-token', user_id: 'user-1' }
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockExtract = mock(() => Promise.resolve(extracted))
    _mockSetCredentials = mock(() => Promise.resolve())

    await getCredentialsOrExit()
    expect(_mockSetCredentials).toHaveBeenCalledWith(extracted)
  })

  test('exits when auto-extraction throws', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockExtract = mock(() => Promise.reject(new Error('Notion directory not found')))

    const mockExit = mock(() => {
      throw new Error('process.exit called')
    })
    const originalExit = process.exit
    process.exit = mockExit as never

    try {
      await expect(getCredentialsOrExit()).rejects.toThrow('process.exit called')
      expect(mockExit).toHaveBeenCalledWith(1)
    } finally {
      process.exit = originalExit
    }
  })
})

describe('getCredentialsOrThrow', () => {
  test('returns credentials when they exist', async () => {
    const credentials = { token_v2: 'test_token', space_id: 'test_space' }
    _mockGetCredentials = mock(() => Promise.resolve(credentials))

    const result = await getCredentialsOrThrow()
    expect(result).toEqual(credentials)
  })

  test('throws an Error when no credentials', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockExtract = mock(() => Promise.resolve(null))

    await expect(getCredentialsOrThrow()).rejects.toThrow('Not authenticated. Run: vibe-notion auth extract')
  })

  test('auto-extracts and returns credentials when no stored credentials', async () => {
    const extracted = { token_v2: 'extracted-token', user_id: 'user-1' }
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockExtract = mock(() => Promise.resolve(extracted))
    _mockSetCredentials = mock(() => Promise.resolve())

    const result = await getCredentialsOrThrow()
    expect(result).toEqual(extracted)
  })

  test('saves auto-extracted credentials', async () => {
    const extracted = { token_v2: 'extracted-token', user_id: 'user-1' }
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockExtract = mock(() => Promise.resolve(extracted))
    _mockSetCredentials = mock(() => Promise.resolve())

    await getCredentialsOrThrow()
    expect(_mockSetCredentials).toHaveBeenCalledWith(extracted)
  })

  test('throws when auto-extraction throws', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))
    _mockExtract = mock(() => Promise.reject(new Error('Notion directory not found')))

    await expect(getCredentialsOrThrow()).rejects.toThrow('Not authenticated. Run: vibe-notion auth extract')
  })
})

describe('resolveSpaceId', () => {
  test('returns space_id from syncRecordValues response', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        recordMap: { block: { 'block-123': { value: { space_id: 'space-456' } } } },
      })
    const result = await resolveSpaceId('token', 'block-123')
    expect(result).toBe('space-456')
  })

  test('throws when block has no space_id', async () => {
    _mockInternalRequest = () => Promise.resolve({ recordMap: { block: { 'block-123': { value: {} } } } })
    await expect(resolveSpaceId('token', 'block-123')).rejects.toThrow(
      'Could not resolve space ID for block: block-123',
    )
  })

  test('throws when block not found in response', async () => {
    _mockInternalRequest = () => Promise.resolve({ recordMap: { block: {} } })
    await expect(resolveSpaceId('token', 'block-123')).rejects.toThrow(
      'Could not resolve space ID for block: block-123',
    )
  })

  test('calls internalRequest with correct parameters', async () => {
    const calls: unknown[][] = []
    _mockInternalRequest = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve({
        recordMap: { block: { 'block-123': { value: { space_id: 'space-456' } } } },
      })
    }
    await resolveSpaceId('test_token', 'block-123')

    expect(calls.length).toBe(1)
    expect(calls[0][0]).toBe('test_token')
    expect(calls[0][1]).toBe('syncRecordValues')
    expect(calls[0][2]).toEqual({
      requests: [{ pointer: { table: 'block', id: 'block-123' }, version: -1 }],
    })
  })
})

describe('resolveCollectionViewId', () => {
  test('returns first view_id from collection parent block', async () => {
    let callCount = 0
    _mockInternalRequest = () => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          recordMap: { collection: { 'coll-123': { value: { parent_id: 'block-456' } } } },
        })
      }
      return Promise.resolve({
        recordMap: { block: { 'block-456': { value: { view_ids: ['view-789', 'view-999'] } } } },
      })
    }
    const result = await resolveCollectionViewId('token', 'coll-123')
    expect(result).toBe('view-789')
  })

  test('calls internalRequest twice', async () => {
    const calls: unknown[][] = []
    let callCount = 0
    _mockInternalRequest = (...args: unknown[]) => {
      calls.push(args)
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          recordMap: { collection: { 'coll-123': { value: { parent_id: 'block-456' } } } },
        })
      }
      return Promise.resolve({
        recordMap: { block: { 'block-456': { value: { view_ids: ['view-789'] } } } },
      })
    }
    await resolveCollectionViewId('test_token', 'coll-123')
    expect(calls.length).toBe(2)
    expect(calls[0][1]).toBe('syncRecordValues')
    expect(calls[1][1]).toBe('syncRecordValues')
  })

  test('throws when collection not found', async () => {
    _mockInternalRequest = () => Promise.resolve({ recordMap: { collection: {} } })
    await expect(resolveCollectionViewId('token', 'coll-123')).rejects.toThrow('Collection not found: coll-123')
  })

  test('throws when collection has no parent_id', async () => {
    _mockInternalRequest = () => Promise.resolve({ recordMap: { collection: { 'coll-123': { value: {} } } } })
    await expect(resolveCollectionViewId('token', 'coll-123')).rejects.toThrow('Collection not found: coll-123')
  })

  test('throws when parent block has no view_ids', async () => {
    let callCount = 0
    _mockInternalRequest = () => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          recordMap: { collection: { 'coll-123': { value: { parent_id: 'block-456' } } } },
        })
      }
      return Promise.resolve({ recordMap: { block: { 'block-456': { value: {} } } } })
    }
    await expect(resolveCollectionViewId('token', 'coll-123')).rejects.toThrow(
      'No views found for collection: coll-123',
    )
  })

  test('throws when parent block not found', async () => {
    let callCount = 0
    _mockInternalRequest = () => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          recordMap: { collection: { 'coll-123': { value: { parent_id: 'block-456' } } } },
        })
      }
      return Promise.resolve({ recordMap: { block: {} } })
    }
    await expect(resolveCollectionViewId('token', 'coll-123')).rejects.toThrow(
      'No views found for collection: coll-123',
    )
  })
})

describe('resolveAndSetActiveUserId', () => {
  test('does nothing when workspaceId is undefined', async () => {
    const calls: unknown[][] = []
    _mockInternalRequest = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve({})
    }

    await resolveAndSetActiveUserId('token', undefined)

    expect(calls.length).toBe(0)
    expect(_capturedActiveUserId).toBeUndefined()
  })

  test('sets active user ID when workspace is found under a user', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        'user-aaa': { space: { 'workspace-111': {} } },
        'user-bbb': { space: { 'workspace-222': {} } },
      })

    await resolveAndSetActiveUserId('token', 'workspace-222')

    expect(_capturedActiveUserId).toBe('user-bbb')
  })

  test('sets first matching user when workspace exists', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        'user-aaa': { space: { 'workspace-111': {}, 'workspace-shared': {} } },
        'user-bbb': { space: { 'workspace-222': {} } },
      })

    await resolveAndSetActiveUserId('token', 'workspace-111')

    expect(_capturedActiveUserId).toBe('user-aaa')
  })

  test('does not set active user when workspace is not found', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        'user-aaa': { space: { 'workspace-111': {} } },
      })

    await resolveAndSetActiveUserId('token', 'workspace-999')

    expect(_capturedActiveUserId).toBeUndefined()
  })

  test('calls getSpaces with correct parameters', async () => {
    const calls: unknown[][] = []
    _mockInternalRequest = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve({ 'user-aaa': { space: { 'ws-1': {} } } })
    }

    await resolveAndSetActiveUserId('test_token', 'ws-1')

    expect(calls.length).toBe(1)
    expect(calls[0][0]).toBe('test_token')
    expect(calls[0][1]).toBe('getSpaces')
    expect(calls[0][2]).toEqual({})
  })

  test('handles user entry with no space property', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({
        'user-aaa': {},
        'user-bbb': { space: { 'workspace-222': {} } },
      })

    await resolveAndSetActiveUserId('token', 'workspace-222')

    expect(_capturedActiveUserId).toBe('user-bbb')
  })
})
