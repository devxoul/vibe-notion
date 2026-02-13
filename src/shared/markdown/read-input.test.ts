import { describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readMarkdownInput } from './read-input'

describe('readMarkdownInput', () => {
  test('returns markdown string when --markdown provided', () => {
    const result = readMarkdownInput({ markdown: '# Hello' })
    expect(result).toBe('# Hello')
  })

  test('reads file content when --markdown-file provided', () => {
    // given
    const tmpDir = os.tmpdir()
    const tmpFile = path.join(tmpDir, `test-md-${Date.now()}.md`)
    fs.writeFileSync(tmpFile, '# From File')

    try {
      // when
      const result = readMarkdownInput({ markdownFile: tmpFile })

      // then
      expect(result).toBe('# From File')
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })

  test('throws error when neither provided', () => {
    expect(() => readMarkdownInput({})).toThrow('Provide either --markdown or --markdown-file')
  })

  test('throws error when both provided', () => {
    expect(() => readMarkdownInput({ markdown: '# Hi', markdownFile: '/tmp/test.md' })).toThrow(
      'Provide either --markdown or --markdown-file, not both',
    )
  })

  test('throws error when file does not exist', () => {
    expect(() => readMarkdownInput({ markdownFile: '/nonexistent/path/file.md' })).toThrow()
  })
})
