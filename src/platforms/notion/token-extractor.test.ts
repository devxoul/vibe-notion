import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { createCipheriv, pbkdf2Sync } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TokenExtractor } from './token-extractor'

function createCookiesDb(dbPath: string, rows: Array<Record<string, unknown>>): void {
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE cookies (
      name TEXT,
      value TEXT,
      encrypted_value BLOB,
      host_key TEXT,
      last_access_utc INTEGER
    );
  `)

  const insert = db.query(
    'INSERT INTO cookies (name, value, encrypted_value, host_key, last_access_utc) VALUES (?, ?, ?, ?, ?)',
  )

  for (const row of rows) {
    insert.run(
      row.name as string,
      (row.value as string | null) ?? '',
      (row.encrypted_value as Uint8Array | null) ?? new Uint8Array(),
      row.host_key as string,
      row.last_access_utc as number,
    )
  }

  db.close()
}

describe('TokenExtractor', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  test('getNotionDir returns expected path for darwin', () => {
    const extractor = new TokenExtractor('darwin')
    expect(extractor.getNotionDir()).toContain('Library/Application Support/Notion')
  })

  test('getNotionDir returns expected path for linux', () => {
    const extractor = new TokenExtractor('linux')
    expect(extractor.getNotionDir()).toContain('.config/Notion')
  })

  test('getNotionDir returns expected path for win32', () => {
    const original = process.env.APPDATA
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming'

    try {
      const extractor = new TokenExtractor('win32')
      expect(extractor.getNotionDir()).toBe('C:\\Users\\test\\AppData\\Roaming/Notion')
    } finally {
      if (original === undefined) {
        delete process.env.APPDATA
      } else {
        process.env.APPDATA = original
      }
    }
  })

  test('tryDecryptCookie decrypts v10 data with derived key', () => {
    class TestTokenExtractor extends TokenExtractor {
      override getDerivedKey(): Buffer {
        return Buffer.from('1234567890abcdef')
      }
    }

    const extractor = new TestTokenExtractor('darwin', '/tmp/notion-test')
    const key = Buffer.from('1234567890abcdef')
    const iv = Buffer.alloc(16, ' ')
    const plaintext = 'v02%3Atoken-value'
    const cipher = createCipheriv('aes-128-cbc', key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const encrypted = Buffer.concat([Buffer.from('v10'), ciphertext])

    expect(extractor.tryDecryptCookie(encrypted)).toBe(plaintext)
  })

  test('extract throws when notion directory is missing', async () => {
    const missingDir = join(tmpdir(), `notion-missing-${Date.now()}`)
    const extractor = new TokenExtractor('darwin', missingDir)

    await expect(extractor.extract()).rejects.toThrow('Notion directory not found')
  })

  test('extract returns token and user_id from cookies sqlite', async () => {
    const notionDir = mkdtempSync(join(tmpdir(), 'notion-test-'))
    tempDirs.push(notionDir)

    const partitionDir = join(notionDir, 'Partitions', 'notion')
    mkdirSync(partitionDir, { recursive: true })
    const dbPath = join(partitionDir, 'Cookies')

    createCookiesDb(dbPath, [
      {
        name: 'token_v2',
        value: 'v02%3Atest-token',
        encrypted_value: new Uint8Array(),
        host_key: '.notion.so',
        last_access_utc: 2,
      },
      {
        name: 'notion_user_id',
        value: 'user-123',
        encrypted_value: new Uint8Array(),
        host_key: '.notion.so',
        last_access_utc: 1,
      },
    ])

    const extractor = new TokenExtractor('darwin', notionDir)
    const extracted = await extractor.extract()

    expect(extracted).toEqual({ token_v2: 'v02%3Atest-token', user_id: 'user-123' })
  })

  test('extract returns null when cookies database has no token', async () => {
    const notionDir = mkdtempSync(join(tmpdir(), 'notion-empty-'))
    tempDirs.push(notionDir)

    const partitionDir = join(notionDir, 'Partitions', 'notion')
    mkdirSync(partitionDir, { recursive: true })
    const dbPath = join(partitionDir, 'Cookies')

    createCookiesDb(dbPath, [
      {
        name: 'other_cookie',
        value: 'value',
        encrypted_value: new Uint8Array(),
        host_key: '.notion.so',
        last_access_utc: 1,
      },
    ])

    const extractor = new TokenExtractor('darwin', notionDir)
    const extracted = await extractor.extract()

    expect(extracted).toBeNull()
  })

  test('extract uses fallback Cookies path when partition db does not exist', async () => {
    const notionDir = mkdtempSync(join(tmpdir(), 'notion-fallback-'))
    tempDirs.push(notionDir)

    const dbPath = join(notionDir, 'Cookies')
    createCookiesDb(dbPath, [
      {
        name: 'token_v2',
        value: 'v02%3Afallback-token',
        encrypted_value: new Uint8Array(),
        host_key: '.notion.so',
        last_access_utc: 1,
      },
    ])

    const extractor = new TokenExtractor('darwin', notionDir)
    const extracted = await extractor.extract()

    expect(extracted).toEqual({ token_v2: 'v02%3Afallback-token' })
  })

  test('getDerivedKey returns linux default key', () => {
    const extractor = new TokenExtractor('linux', '/tmp/notion-test')
    const key = extractor.getDerivedKey()
    const expected = pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1')
    expect(key).toEqual(expected)
  })
})
