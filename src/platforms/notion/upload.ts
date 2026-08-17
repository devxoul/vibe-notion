import fs from 'node:fs'

import { isImageType, resolveFileInfo } from '@/shared/upload/detect-type'

import { internalRequest } from './client'
import { generateId } from './commands/helpers'

type UploadFileUrlResponse = {
  url: string
  signedGetUrl?: string
  signedPutUrl: string
}

type SaveOperation = {
  pointer: {
    table: 'block'
    id: string
    spaceId: string
  }
  command: 'set' | 'listAfter' | 'listBefore'
  path: string[]
  args: Record<string, unknown>
}

type SaveTransactionsRequest = {
  requestId: string
  transactions: Array<{
    id: string
    spaceId: string
    operations: SaveOperation[]
  }>
}

type UploadedBlock = {
  id: string
  type: 'image' | 'file'
  url: string
}

export const uploadDeps = {
  fetch: globalThis.fetch,
  generateId,
  internalRequest,
  readFileSync: fs.readFileSync,
  resolveFileInfo,
}

export async function getUploadUrl(
  tokenV2: string,
  fileName: string,
  contentType: string,
  record: { table: string; id: string; spaceId: string },
): Promise<{ source: string; url: string; signedPutUrl: string; fileId: string }> {
  const response = (await uploadDeps.internalRequest(tokenV2, 'getUploadFileUrl', {
    bucket: 'secure',
    contentType,
    name: fileName,
    record,
  })) as UploadFileUrlResponse

  const source = response.url
  const fileId = extractFileId(source)

  return {
    source,
    url: response.signedGetUrl ?? source,
    signedPutUrl: response.signedPutUrl,
    fileId,
  }
}

export async function uploadToS3(signedPutUrl: string, fileBuffer: Buffer, contentType: string): Promise<void> {
  const response = await uploadDeps.fetch(signedPutUrl, {
    method: 'PUT',
    body: fileBuffer,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(fileBuffer.length),
    },
  })

  if (!response.ok) {
    throw new Error('Failed to upload file')
  }
}

export async function uploadFileOnly(
  tokenV2: string,
  filePath: string,
  parentId: string,
  spaceId: string,
): Promise<{ source: string; url: string; fileId: string; contentType: string; name: string }> {
  const fileInfo = uploadDeps.resolveFileInfo(filePath)
  const record = { table: 'block', id: parentId, spaceId }
  const uploadInfo = await getUploadUrl(tokenV2, fileInfo.name, fileInfo.contentType, record)
  const fileBuffer = uploadDeps.readFileSync(fileInfo.path)
  await uploadToS3(uploadInfo.signedPutUrl, fileBuffer, fileInfo.contentType)

  return {
    source: uploadInfo.source,
    url: uploadInfo.url,
    fileId: uploadInfo.fileId,
    contentType: fileInfo.contentType,
    name: fileInfo.name,
  }
}
export async function uploadFile(
  tokenV2: string,
  parentId: string,
  filePath: string,
  spaceId: string,
  afterId?: string,
  beforeId?: string,
): Promise<UploadedBlock> {
  const upload = await uploadFileOnly(tokenV2, filePath, parentId, spaceId)

  const blockId = uploadDeps.generateId()
  const blockType: UploadedBlock['type'] = isImageType(upload.contentType) ? 'image' : 'file'
  const operations: SaveOperation[] = [
    {
      pointer: { table: 'block', id: blockId, spaceId },
      command: 'set',
      path: [],
      args: {
        type: blockType,
        id: blockId,
        version: 1,
        parent_id: parentId,
        parent_table: 'block',
        alive: true,
        properties: {
          source: [[upload.source]],
          title: [[upload.name]],
        },
        space_id: spaceId,
      },
    },
    {
      pointer: { table: 'block', id: parentId, spaceId },
      command: beforeId ? 'listBefore' : 'listAfter',
      path: ['content'],
      args: beforeId ? { id: blockId, before: beforeId } : afterId ? { id: blockId, after: afterId } : { id: blockId },
    },
    {
      pointer: { table: 'block', id: blockId, spaceId },
      command: 'listAfter',
      path: ['file_ids'],
      args: { id: upload.fileId },
    },
  ]

  const payload: SaveTransactionsRequest = {
    requestId: uploadDeps.generateId(),
    transactions: [{ id: uploadDeps.generateId(), spaceId, operations }],
  }
  await uploadDeps.internalRequest(tokenV2, 'saveTransactions', payload)

  return {
    id: blockId,
    type: blockType,
    url: upload.url,
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extractFileId(url: string): string {
  // New format: attachment:{fileId}:{filename}
  if (url.startsWith('attachment:')) {
    const fileId = url.split(':')[1]
    if (!fileId) {
      throw new Error('Failed to extract file ID from attachment URL')
    }
    return fileId
  }

  // Legacy format: https://.../{fileId}/{filename}
  const pathname = new URL(url).pathname
  const [firstPathSegment] = pathname.split('/').filter(Boolean)
  if (!firstPathSegment) {
    throw new Error('Failed to extract file ID from upload URL')
  }
  return firstPathSegment
}
