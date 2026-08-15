import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { FileInfo } from '../../shared/upload/types'
import { formatFileSize, getUploadUrl, uploadDeps, uploadFile, uploadToS3 } from './upload'

describe('upload', () => {
  let tempDir: string
  const originalDeps = {
    fetch: uploadDeps.fetch,
    generateId: uploadDeps.generateId,
    internalRequest: uploadDeps.internalRequest,
    readFileSync: uploadDeps.readFileSync,
    resolveFileInfo: uploadDeps.resolveFileInfo,
  }

  beforeEach(() => {
    mock.restore()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-notion-upload-'))
  })

  afterEach(() => {
    uploadDeps.fetch = originalDeps.fetch
    uploadDeps.generateId = originalDeps.generateId
    uploadDeps.internalRequest = originalDeps.internalRequest
    uploadDeps.readFileSync = originalDeps.readFileSync
    uploadDeps.resolveFileInfo = originalDeps.resolveFileInfo
    fs.rmSync(tempDir, { recursive: true, force: true })
    mock.restore()
  })

  test('getUploadUrl calls internalRequest and extracts fileId from url', async () => {
    const mockInternalRequest = mock(() =>
      Promise.resolve({
        url: 'https://secure.notion-static.com/11111111-2222-3333-4444-555555555555/sample.png',
        signedPutUrl: 'https://s3.put/url',
        signedGetUrl: 'https://s3.get/url',
      }),
    )
    uploadDeps.internalRequest = mockInternalRequest

    const record = { table: 'block', id: 'block-123', spaceId: 'space-456' }
    const result = await getUploadUrl('token-v2', 'sample.png', 'image/png', record)

    expect(mockInternalRequest).toHaveBeenCalledWith('token-v2', 'getUploadFileUrl', {
      bucket: 'secure',
      contentType: 'image/png',
      name: 'sample.png',
      record: { table: 'block', id: 'block-123', spaceId: 'space-456' },
    })
    expect(result).toEqual({
      fileId: '11111111-2222-3333-4444-555555555555',
      signedPutUrl: 'https://s3.put/url',
      source: 'https://secure.notion-static.com/11111111-2222-3333-4444-555555555555/sample.png',
      url: 'https://s3.get/url',
    })
  })

  test('getUploadUrl falls back to the permanent url when no signed read url is returned', async () => {
    uploadDeps.internalRequest = mock(() =>
      Promise.resolve({
        url: 'attachment:11111111-2222-3333-4444-555555555555:sample.png',
        signedPutUrl: 'https://s3.put/url',
      }),
    )

    const record = { table: 'block', id: 'block-123', spaceId: 'space-456' }
    const result = await getUploadUrl('token-v2', 'sample.png', 'image/png', record)

    expect(result.source).toBe('attachment:11111111-2222-3333-4444-555555555555:sample.png')
    expect(result.url).toBe('attachment:11111111-2222-3333-4444-555555555555:sample.png')
  })

  test('uploadToS3 uploads file bytes with content headers', async () => {
    const body = Buffer.from('hello')
    const mockFetch = mock(() => Promise.resolve({ ok: true }))
    uploadDeps.fetch = mockFetch as unknown as typeof fetch

    await uploadToS3('https://s3.put/url', body, 'text/plain')

    expect(mockFetch).toHaveBeenCalledWith('https://s3.put/url', {
      body,
      headers: {
        'Content-Length': '5',
        'Content-Type': 'text/plain',
      },
      method: 'PUT',
    })
  })

  test('uploadFile stores the permanent attachment reference as the block source', async () => {
    const filePath = path.join(tempDir, 'photo.png')
    const fileBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    fs.writeFileSync(filePath, fileBuffer)

    const fileInfo: FileInfo = {
      path: filePath,
      name: 'photo.png',
      size: fileBuffer.length,
      contentType: 'image/png',
      isImage: true,
    }
    const ids = ['new-block-id', 'request-id', 'transaction-id']
    const signedGetUrl =
      'https://file.notion.so/f/f/space-id/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/photo.png?expirationTimestamp=1786838400000&signature=abc'
    const mockInternalRequest = mock((_token: string, endpoint: string, _body?: unknown) => {
      if (endpoint === 'getUploadFileUrl') {
        return Promise.resolve({
          url: 'attachment:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:photo.png',
          signedPutUrl: 'https://s3.put/upload',
          signedGetUrl,
        })
      }
      return Promise.resolve({})
    })

    uploadDeps.resolveFileInfo = mock(() => fileInfo)
    uploadDeps.readFileSync = mock(() => fileBuffer) as unknown as typeof uploadDeps.readFileSync
    uploadDeps.generateId = mock(() => ids.shift() ?? 'fallback-id')
    uploadDeps.internalRequest = mockInternalRequest
    uploadDeps.fetch = mock(() => Promise.resolve({ ok: true })) as unknown as typeof fetch

    const result = await uploadFile('token-v2', 'parent-id', filePath, 'space-id')

    const saveCall = mockInternalRequest.mock.calls.find((call) => call[1] === 'saveTransactions')
    const operations = ((saveCall?.[2] as any)?.transactions?.[0]?.operations ?? []) as any[]
    const setOperation = operations.find((operation) => operation.command === 'set')

    // The signed read URL expires, so persisting it would leave a broken image behind.
    expect(setOperation?.args?.properties?.source).toEqual([
      ['attachment:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:photo.png'],
    ])
    expect(result.url).toBe(signedGetUrl)
  })

  test('uploadFile creates image block and appends file id', async () => {
    const filePath = path.join(tempDir, 'photo.png')
    const fileBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    fs.writeFileSync(filePath, fileBuffer)

    const fileInfo: FileInfo = {
      path: filePath,
      name: 'photo.png',
      size: fileBuffer.length,
      contentType: 'image/png',
      isImage: true,
    }
    const ids = ['new-block-id', 'request-id', 'transaction-id']
    const mockInternalRequest = mock((_token: string, endpoint: string, _body?: unknown) => {
      if (endpoint === 'getUploadFileUrl') {
        return Promise.resolve({
          url: 'https://secure.notion-static.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/photo.png',
          signedPutUrl: 'https://s3.put/upload',
          signedGetUrl: 'https://s3.get/download',
        })
      }
      if (endpoint === 'saveTransactions') {
        return Promise.resolve({})
      }
      return Promise.reject(new Error(`Unexpected endpoint: ${endpoint}`))
    })
    const mockFetch = mock(() => Promise.resolve({ ok: true }))

    uploadDeps.resolveFileInfo = mock(() => fileInfo)
    uploadDeps.readFileSync = mock(() => fileBuffer) as unknown as typeof uploadDeps.readFileSync
    uploadDeps.generateId = mock(() => ids.shift() ?? 'fallback-id')
    uploadDeps.internalRequest = mockInternalRequest
    uploadDeps.fetch = mockFetch as unknown as typeof fetch

    const result = await uploadFile('token-v2', 'parent-id', filePath, 'space-id')

    expect(result).toEqual({
      id: 'new-block-id',
      type: 'image',
      url: 'https://s3.get/download',
    })

    const saveCall = mockInternalRequest.mock.calls.find((call) => call[1] === 'saveTransactions')
    expect(saveCall).toBeDefined()

    const payload = (saveCall?.[2] ?? {}) as {
      requestId: string
      transactions: Array<{ id: string; spaceId: string; operations: any[] }>
    }
    expect(payload.requestId).toBe('request-id')
    expect(payload.transactions[0]?.id).toBe('transaction-id')
    expect(payload.transactions[0]?.spaceId).toBe('space-id')

    const operations = payload.transactions[0]?.operations ?? []
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: 'set',
          pointer: { table: 'block', id: 'new-block-id', spaceId: 'space-id' },
          args: expect.objectContaining({
            type: 'image',
            id: 'new-block-id',
            parent_id: 'parent-id',
            parent_table: 'block',
            alive: true,
            space_id: 'space-id',
            properties: {
              source: [['https://secure.notion-static.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/photo.png']],
              title: [['photo.png']],
            },
          }),
        }),
        expect.objectContaining({
          command: 'listAfter',
          pointer: { table: 'block', id: 'parent-id', spaceId: 'space-id' },
          path: ['content'],
          args: { id: 'new-block-id' },
        }),
        expect.objectContaining({
          command: 'listAfter',
          pointer: { table: 'block', id: 'new-block-id', spaceId: 'space-id' },
          path: ['file_ids'],
          args: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        }),
      ]),
    )
  })

  test('uploadFile creates file block for non-image file', async () => {
    const filePath = path.join(tempDir, 'report.pdf')
    const fileBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46])
    fs.writeFileSync(filePath, fileBuffer)

    const fileInfo: FileInfo = {
      path: filePath,
      name: 'report.pdf',
      size: fileBuffer.length,
      contentType: 'application/pdf',
      isImage: false,
    }
    const ids = ['new-block-id', 'request-id', 'transaction-id']
    const mockInternalRequest = mock((_token: string, endpoint: string, _body?: unknown) => {
      if (endpoint === 'getUploadFileUrl') {
        return Promise.resolve({
          url: 'https://secure.notion-static.com/ffffffff-1111-2222-3333-444444444444/report.pdf',
          signedPutUrl: 'https://s3.put/upload',
          signedGetUrl: 'https://s3.get/download',
        })
      }
      return Promise.resolve({})
    })

    uploadDeps.resolveFileInfo = mock(() => fileInfo)
    uploadDeps.readFileSync = mock(() => fileBuffer) as unknown as typeof uploadDeps.readFileSync
    uploadDeps.generateId = mock(() => ids.shift() ?? 'fallback-id')
    uploadDeps.internalRequest = mockInternalRequest
    uploadDeps.fetch = mock(() => Promise.resolve({ ok: true })) as unknown as typeof fetch

    const result = await uploadFile('token-v2', 'parent-id', filePath, 'space-id')

    expect(result.type).toBe('file')

    const saveCall = mockInternalRequest.mock.calls.find((call) => call[1] === 'saveTransactions')
    const operations = ((saveCall?.[2] as any)?.transactions?.[0]?.operations ?? []) as any[]
    const setOperation = operations.find((operation) => operation.command === 'set')
    expect(setOperation?.args?.type).toBe('file')
  })

  test('uploadFile throws when file path does not exist', async () => {
    const missingPath = path.join(tempDir, 'missing-file.png')
    const mockInternalRequest = mock(() => Promise.resolve({}))

    uploadDeps.internalRequest = mockInternalRequest

    await expect(uploadFile('token-v2', 'parent-id', missingPath, 'space-id')).rejects.toThrow(
      /ENOENT|no such file or directory/i,
    )
    expect(mockInternalRequest).not.toHaveBeenCalled()
  })

  test('formatFileSize formats bytes, KB, and MB', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(1572864)).toBe('1.5 MB')
  })
})
