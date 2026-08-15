import { describe, expect, mock, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { preprocessMarkdownImages } from './preprocess-images'

function createTempFile(name: string, content = 'fake-image-data'): string {
  const filePath = path.join(os.tmpdir(), `preprocess-img-test-${Date.now()}-${name}`)
  fs.writeFileSync(filePath, content)
  return filePath
}

describe('preprocessMarkdownImages', () => {
  test('replaces local image path with uploaded URL', async () => {
    // given
    const tmpFile = createTempFile('photo.png')
    const basePath = path.dirname(tmpFile)
    const fileName = path.basename(tmpFile)
    const markdown = `# Hello\n\n![alt text](./${fileName})\n\nSome text`
    const uploadFn = mock(async (_filePath: string) => 'https://uploaded.example.com/photo.png')

    try {
      // when
      const result = await preprocessMarkdownImages(markdown, uploadFn, basePath)

      // then
      expect(result).toBe(`# Hello\n\n![alt text](https://uploaded.example.com/photo.png)\n\nSome text`)
      expect(uploadFn).toHaveBeenCalledTimes(1)
      expect(uploadFn.mock.calls[0][0]).toBe(tmpFile)
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })

  test('leaves remote URLs untouched', async () => {
    // given
    const markdown = '![logo](https://example.com/logo.png)\n\n![other](http://cdn.test/img.jpg)'
    const uploadFn = mock(async (_filePath: string) => 'https://should-not-be-called.com')

    // when
    const result = await preprocessMarkdownImages(markdown, uploadFn, '/tmp')

    // then
    expect(result).toBe(markdown)
    expect(uploadFn).toHaveBeenCalledTimes(0)
  })

  test('deduplicates same file referenced multiple times', async () => {
    // given
    const tmpFile = createTempFile('dup.png')
    const basePath = path.dirname(tmpFile)
    const fileName = path.basename(tmpFile)
    const markdown = `![first](./${fileName})\n\n![second](./${fileName})`
    const uploadFn = mock(async (_filePath: string) => 'https://uploaded.example.com/dup.png')

    try {
      // when
      const result = await preprocessMarkdownImages(markdown, uploadFn, basePath)

      // then
      expect(result).toBe(
        '![first](https://uploaded.example.com/dup.png)\n\n![second](https://uploaded.example.com/dup.png)',
      )
      expect(uploadFn).toHaveBeenCalledTimes(1)
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })

  test('throws error for nonexistent local file', async () => {
    // given
    const markdown = '![missing](./nonexistent-image.png)'

    // when/then
    expect(preprocessMarkdownImages(markdown, async () => '', '/tmp')).rejects.toThrow('Image file not found')
  })

  test('returns markdown unchanged when no images present', async () => {
    // given
    const markdown = '# Title\n\nSome paragraph text\n\n- list item'
    const uploadFn = mock(async (_filePath: string) => 'https://should-not-be-called.com')

    // when
    const result = await preprocessMarkdownImages(markdown, uploadFn, '/tmp')

    // then
    expect(result).toBe(markdown)
    expect(uploadFn).toHaveBeenCalledTimes(0)
  })

  test('skips empty image references', async () => {
    // given
    const markdown = '![]()\n\nSome text'
    const uploadFn = mock(async (_filePath: string) => 'https://should-not-be-called.com')

    // when
    const result = await preprocessMarkdownImages(markdown, uploadFn, '/tmp')

    // then
    expect(result).toBe(markdown)
    expect(uploadFn).toHaveBeenCalledTimes(0)
  })

  test('handles multiple different local images', async () => {
    // given
    const tmpFile1 = createTempFile('a.png')
    const tmpFile2 = createTempFile('b.jpg')
    const basePath = path.dirname(tmpFile1)
    const fileName1 = path.basename(tmpFile1)
    const fileName2 = path.basename(tmpFile2)
    const markdown = `![img1](./${fileName1})\n\n![img2](./${fileName2})`
    const uploadFn = mock(async (filePath: string) => {
      return `https://uploaded.example.com/${path.basename(filePath)}`
    })

    try {
      // when
      const result = await preprocessMarkdownImages(markdown, uploadFn, basePath)

      // then
      expect(result).toBe(
        `![img1](https://uploaded.example.com/${fileName1})\n\n![img2](https://uploaded.example.com/${fileName2})`,
      )
      expect(uploadFn).toHaveBeenCalledTimes(2)
    } finally {
      fs.unlinkSync(tmpFile1)
      fs.unlinkSync(tmpFile2)
    }
  })

  test('handles mix of local and remote images', async () => {
    // given
    const tmpFile = createTempFile('local.png')
    const basePath = path.dirname(tmpFile)
    const fileName = path.basename(tmpFile)
    const markdown = `![local](./${fileName})\n\n![remote](https://example.com/remote.png)`
    const uploadFn = mock(async (_filePath: string) => 'https://uploaded.example.com/local.png')

    try {
      // when
      const result = await preprocessMarkdownImages(markdown, uploadFn, basePath)

      // then
      expect(result).toBe(
        '![local](https://uploaded.example.com/local.png)\n\n![remote](https://example.com/remote.png)',
      )
      expect(uploadFn).toHaveBeenCalledTimes(1)
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })

  test('resolves relative paths against basePath', async () => {
    // given
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preprocess-img-'))
    const subDir = path.join(tmpDir, 'images')
    fs.mkdirSync(subDir)
    const imgFile = path.join(subDir, 'photo.png')
    fs.writeFileSync(imgFile, 'fake-data')

    const markdown = '![photo](images/photo.png)'
    const uploadFn = mock(async (_filePath: string) => 'https://uploaded.example.com/photo.png')

    try {
      // when
      const result = await preprocessMarkdownImages(markdown, uploadFn, tmpDir)

      // then
      expect(result).toBe('![photo](https://uploaded.example.com/photo.png)')
      expect(uploadFn).toHaveBeenCalledTimes(1)
      expect(uploadFn.mock.calls[0][0]).toBe(imgFile)
    } finally {
      fs.unlinkSync(imgFile)
      fs.rmdirSync(subDir)
      fs.rmdirSync(tmpDir)
    }
  })

  test('error message includes the missing file path', async () => {
    // given
    const markdown = '![missing](./no-such-file.png)'

    // when/then
    try {
      await preprocessMarkdownImages(markdown, async () => '', '/tmp')
      expect(true).toBe(false) // should not reach here
    } catch (error: unknown) {
      expect((error as Error).message).toContain('/tmp/no-such-file.png')
    }
  })

  test('handles images with titles', async () => {
    // given
    const tmpFile = createTempFile('titled.png')
    const basePath = path.dirname(tmpFile)
    const fileName = path.basename(tmpFile)
    const markdown = `![alt](./${fileName} "My Title")`
    const uploadFn = mock(async (_filePath: string) => 'https://uploaded.example.com/titled.png')

    try {
      // when
      const result = await preprocessMarkdownImages(markdown, uploadFn, basePath)

      // then
      expect(result).toBe('![alt](https://uploaded.example.com/titled.png "My Title")')
      expect(uploadFn).toHaveBeenCalledTimes(1)
      expect(uploadFn.mock.calls[0][0]).toBe(tmpFile)
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })

  test('handles images with titles mixed with untitled', async () => {
    // given
    const tmpFile1 = createTempFile('a.png')
    const tmpFile2 = createTempFile('b.jpg')
    const basePath = path.dirname(tmpFile1)
    const fileName1 = path.basename(tmpFile1)
    const fileName2 = path.basename(tmpFile2)
    const markdown = `![with title](./${fileName1} "Title")\n\n![no title](./${fileName2})`
    const uploadFn = mock(async (filePath: string) => {
      return `https://uploaded.example.com/${path.basename(filePath)}`
    })

    try {
      // when
      const result = await preprocessMarkdownImages(markdown, uploadFn, basePath)

      // then
      expect(result).toContain(`![with title](https://uploaded.example.com/${fileName1} "Title")`)
      expect(result).toContain(`![no title](https://uploaded.example.com/${fileName2})`)
      expect(uploadFn).toHaveBeenCalledTimes(2)
    } finally {
      fs.unlinkSync(tmpFile1)
      fs.unlinkSync(tmpFile2)
    }
  })

  test('handles image paths with spaces', async () => {
    // given
    const tmpFile = createTempFile('my photo.png')
    const basePath = path.dirname(tmpFile)
    const fileName = path.basename(tmpFile)
    const markdown = `![alt](./${fileName})`
    const uploadFn = mock(async (_filePath: string) => 'https://uploaded.example.com/my-photo.png')

    try {
      // when
      const result = await preprocessMarkdownImages(markdown, uploadFn, basePath)

      // then
      expect(result).toBe('![alt](https://uploaded.example.com/my-photo.png)')
      expect(uploadFn).toHaveBeenCalledTimes(1)
      expect(uploadFn.mock.calls[0][0]).toBe(tmpFile)
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })

  test('leaves already-uploaded attachment references untouched', async () => {
    // given
    const markdown = '![alt](attachment:11111111-2222-3333-4444-555555555555:photo.png)'
    const uploadFn = mock(async (_filePath: string) => 'https://should-not-be-called.com')

    // when
    const result = await preprocessMarkdownImages(markdown, uploadFn, '/tmp')

    // then
    expect(result).toBe(markdown)
    expect(uploadFn).toHaveBeenCalledTimes(0)
  })

  test('wraps an uploaded reference containing spaces so the destination survives parsing', async () => {
    // given
    const tmpFile = createTempFile('spaced.png')
    const basePath = path.dirname(tmpFile)
    const fileName = path.basename(tmpFile)
    const markdown = `![alt](./${fileName})`
    const uploadFn = mock(async (_filePath: string) => 'attachment:1111:my photo.png')

    try {
      // when
      const result = await preprocessMarkdownImages(markdown, uploadFn, basePath)

      // then
      expect(result).toBe('![alt](<attachment:1111:my photo.png>)')
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })

  test('keeps a dollar sign in an uploaded file name verbatim', async () => {
    // given
    const tmpFile = createTempFile('dollar.png')
    const basePath = path.dirname(tmpFile)
    const fileName = path.basename(tmpFile)
    const markdown = `![alt](./${fileName})`
    const uploadFn = mock(async (_filePath: string) => 'attachment:1111:price$&total.png')

    try {
      // when
      const result = await preprocessMarkdownImages(markdown, uploadFn, basePath)

      // then
      expect(result).toBe('![alt](attachment:1111:price$&total.png)')
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })

  test('handles image paths with spaces and titles', async () => {
    // given
    const tmpFile = createTempFile('my photo.png')
    const basePath = path.dirname(tmpFile)
    const fileName = path.basename(tmpFile)
    const markdown = `![alt](./${fileName} "My Title")`
    const uploadFn = mock(async (_filePath: string) => 'https://uploaded.example.com/my-photo.png')

    try {
      // when
      const result = await preprocessMarkdownImages(markdown, uploadFn, basePath)

      // then
      expect(result).toBe('![alt](https://uploaded.example.com/my-photo.png "My Title")')
      expect(uploadFn).toHaveBeenCalledTimes(1)
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })
})
