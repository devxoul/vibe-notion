import { execSync } from 'node:child_process'
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'
import { copyFileSync, existsSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)

type CookieRow = {
  name: string
  value?: string
  encrypted_value?: Uint8Array | Buffer
} | null

export interface ExtractedToken {
  token_v2: string
  user_id?: string
}

export class TokenExtractor {
  private platform: NodeJS.Platform
  private notionDir: string

  constructor(platform?: NodeJS.Platform, notionDir?: string) {
    this.platform = platform ?? process.platform
    this.notionDir = notionDir ?? this.getNotionDir()
  }

  getNotionDir(): string {
    switch (this.platform) {
      case 'darwin':
        return join(homedir(), 'Library', 'Application Support', 'Notion')
      case 'linux':
        return join(homedir(), '.config', 'Notion')
      case 'win32': {
        const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
        return join(appData, 'Notion')
      }
      default:
        throw new Error(`Unsupported platform: ${this.platform}`)
    }
  }

  async extract(): Promise<ExtractedToken | null> {
    if (!existsSync(this.notionDir)) {
      throw new Error(`Notion directory not found: ${this.notionDir}`)
    }

    return this.extractCookieFromSQLite()
  }

  tryDecryptCookie(encrypted: Buffer): string | null {
    const plaintext = encrypted.toString('utf8')
    if (plaintext.startsWith('v02%3A') || plaintext.startsWith('v02:')) {
      return plaintext
    }

    if (encrypted.length > 3 && encrypted.subarray(0, 3).toString() === 'v10') {
      return this.decryptV10Cookie(encrypted)
    }

    return null
  }

  decryptV10Cookie(encrypted: Buffer): string | null {
    try {
      const key = this.getDerivedKey()
      if (!key) {
        return null
      }

      const ciphertext = encrypted.subarray(3)
      const iv = Buffer.alloc(16, ' ')
      const decipher = createDecipheriv('aes-128-cbc', key, iv)
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
        'utf8'
      )
      return this.stripTrailingControlChars(decrypted)
    } catch {
      return null
    }
  }

  getDerivedKey(): Buffer | null {
    if (this.platform === 'linux') {
      return pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1')
    }

    if (this.platform === 'win32') {
      return null
    }

    if (this.platform !== 'darwin') {
      return null
    }

    try {
      let password: string
      try {
        password = execSync(
          'security find-generic-password -s "Notion Safe Storage" -w 2>/dev/null',
          {
            encoding: 'utf8',
          }
        ).trim()
      } catch {
        password = execSync(
          'security find-generic-password -ga "Notion" -s "Notion Safe Storage" -w 2>/dev/null',
          { encoding: 'utf8' }
        ).trim()
      }

      return pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1')
    } catch {
      return null
    }
  }

  private async extractCookieFromSQLite(): Promise<ExtractedToken | null> {
    const cookiePaths = [
      join(this.notionDir, 'Partitions', 'notion', 'Cookies'),
      join(this.notionDir, 'Cookies'),
      join(this.notionDir, 'Network', 'Cookies'),
    ]

    for (const dbPath of cookiePaths) {
      if (!existsSync(dbPath)) {
        continue
      }

      const extracted = this.readTokenFromDb(dbPath)
      if (extracted) {
        return extracted
      }
    }

    return null
  }

  private readTokenFromDb(dbPath: string): ExtractedToken | null {
    const tempDbPath = join(
      tmpdir(),
      `notion-cookies-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    )

    try {
      copyFileSync(dbPath, tempDbPath)
    } catch {
      return null
    }

    try {
      const tokenSql = `SELECT name, value, encrypted_value FROM cookies WHERE name = 'token_v2' AND host_key LIKE '%notion%' ORDER BY last_access_utc DESC LIMIT 1`
      const userSql = `SELECT name, value, encrypted_value FROM cookies WHERE name = 'notion_user_id' AND host_key LIKE '%notion%' ORDER BY last_access_utc DESC LIMIT 1`

      let tokenRow: CookieRow
      let userRow: CookieRow

      if (typeof globalThis.Bun !== 'undefined') {
        const { Database } = require('bun:sqlite')
        const db = new Database(tempDbPath, { readonly: true })
        tokenRow = db.query(tokenSql).get() as CookieRow
        userRow = db.query(userSql).get() as CookieRow
        db.close()
      } else {
        const Database = require('better-sqlite3')
        const db = new Database(tempDbPath, { readonly: true })
        tokenRow = db.prepare(tokenSql).get() as CookieRow
        userRow = db.prepare(userSql).get() as CookieRow
        db.close()
      }

      const token = this.resolveCookieValue(tokenRow)
      if (!token) {
        return null
      }

      const userId = this.resolveCookieValue(userRow)
      if (userId) {
        return { token_v2: token, user_id: userId }
      }

      return { token_v2: token }
    } catch {
      return null
    } finally {
      try {
        rmSync(tempDbPath, { force: true })
      } catch {}
    }
  }

  private resolveCookieValue(row: CookieRow): string | null {
    if (!row) {
      return null
    }

    if (typeof row.value === 'string' && row.value.length > 0) {
      return row.value
    }

    if (row.encrypted_value && row.encrypted_value.length > 0) {
      return this.tryDecryptCookie(Buffer.from(row.encrypted_value))
    }

    return null
  }

  private stripTrailingControlChars(value: string): string {
    let end = value.length
    while (end > 0 && value.charCodeAt(end - 1) < 32) {
      end -= 1
    }
    return value.slice(0, end)
  }
}
