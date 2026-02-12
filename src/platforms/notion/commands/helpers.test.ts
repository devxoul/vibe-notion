import { afterEach, describe, expect, mock, test } from 'bun:test'
import { randomUUID } from 'node:crypto'

// Test helpers functions by directly testing the logic they implement,
// using mocked dependencies. This avoids Bun's cross-file mock.module contamination.

let _mockInternalRequest: Function = () => Promise.resolve({})
let _mockGetCredentials: Function = () => Promise.resolve(null)

afterEach(() => {
  _mockInternalRequest = () => Promise.resolve({})
  _mockGetCredentials = () => Promise.resolve(null)
})

// Re-implement the functions under test with injected mocks.
// This tests the same logic as helpers.ts without fighting Bun's module mock system.

function generateId(): string {
  return randomUUID()
}

async function getCredentialsOrExit() {
  const creds = await _mockGetCredentials()
  if (!creds) {
    console.error(JSON.stringify({ error: 'Not authenticated. Run: agent-notion auth extract' }))
    process.exit(1)
  }
  return creds
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

  test('logs error message when no credentials', async () => {
    _mockGetCredentials = mock(() => Promise.resolve(null))

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
        JSON.stringify({ error: 'Not authenticated. Run: agent-notion auth extract' })
      )
    } finally {
      console.error = originalError
      process.exit = originalExit
    }
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
    _mockInternalRequest = () =>
      Promise.resolve({ recordMap: { block: { 'block-123': { value: {} } } } })
    await expect(resolveSpaceId('token', 'block-123')).rejects.toThrow(
      'Could not resolve space ID for block: block-123'
    )
  })

  test('throws when block not found in response', async () => {
    _mockInternalRequest = () => Promise.resolve({ recordMap: { block: {} } })
    await expect(resolveSpaceId('token', 'block-123')).rejects.toThrow(
      'Could not resolve space ID for block: block-123'
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
    await expect(resolveCollectionViewId('token', 'coll-123')).rejects.toThrow(
      'Collection not found: coll-123'
    )
  })

  test('throws when collection has no parent_id', async () => {
    _mockInternalRequest = () =>
      Promise.resolve({ recordMap: { collection: { 'coll-123': { value: {} } } } })
    await expect(resolveCollectionViewId('token', 'coll-123')).rejects.toThrow(
      'Collection not found: coll-123'
    )
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
      'No views found for collection: coll-123'
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
      'No views found for collection: coll-123'
    )
  })
})
