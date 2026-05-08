import { execSync } from 'node:child_process'
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { openSqlite } from '@/platforms/notion/sqlite'
import type { ExtractedToken } from '@/platforms/notion/token-extractor'

interface BrowserConfig {
  name: string
  darwin: string
  linux: string
  win32: string
}

interface KeychainVariant {
  service: string
  account: string
}

type CookieRow = {
  name: string
  value?: string
  encrypted_value?: Uint8Array | Buffer
  last_access_utc?: number
}

type ExtractedBrowserTokenCandidate = {
  extracted: ExtractedToken
  lastAccessUtc: number
}

const BROWSERS: BrowserConfig[] = [
  {
    name: 'Chrome',
    darwin: join('Google', 'Chrome'),
    linux: 'google-chrome',
    win32: join('Google', 'Chrome', 'User Data'),
  },
  {
    name: 'Chrome Canary',
    darwin: join('Google', 'Chrome Canary'),
    linux: 'google-chrome-unstable',
    win32: join('Google', 'Chrome SxS', 'User Data'),
  },
  {
    name: 'Edge',
    darwin: 'Microsoft Edge',
    linux: 'microsoft-edge',
    win32: join('Microsoft', 'Edge', 'User Data'),
  },
  {
    name: 'Arc',
    darwin: join('Arc', 'User Data'),
    linux: '',
    win32: join('Arc', 'User Data'),
  },
  {
    name: 'Brave',
    darwin: join('BraveSoftware', 'Brave-Browser'),
    linux: join('BraveSoftware', 'Brave-Browser'),
    win32: join('BraveSoftware', 'Brave-Browser', 'User Data'),
  },
  {
    name: 'Vivaldi',
    darwin: 'Vivaldi',
    linux: 'vivaldi',
    win32: join('Vivaldi', 'User Data'),
  },
  {
    name: 'Chromium',
    darwin: 'Chromium',
    linux: 'chromium',
    win32: join('Chromium', 'User Data'),
  },
]

const NOTION_HOST_KEYS = ['.www.notion.so', '.notion.so', 'www.notion.so', 'notion.so']
const NOTION_COOKIE_NAMES = ['token_v2', 'notion_user_id', 'notion_users']

const KEYCHAIN_VARIANTS: KeychainVariant[] = [
  { service: 'Chrome Safe Storage', account: 'Chrome' },
  { service: 'Chrome Canary Safe Storage', account: 'Chrome Canary' },
  { service: 'Microsoft Edge Safe Storage', account: 'Microsoft Edge' },
  { service: 'Arc Safe Storage', account: 'Arc' },
  { service: 'Brave Safe Storage', account: 'Brave' },
  { service: 'Vivaldi Safe Storage', account: 'Vivaldi' },
  { service: 'Chromium Safe Storage', account: 'Chromium' },
]

const LINUX_KEYRING_APP_NAMES = [
  'Chrome',
  'chrome',
  'google-chrome',
  'Chrome Canary',
  'chrome canary',
  'google-chrome-unstable',
  'Microsoft Edge',
  'microsoft-edge',
  'Brave',
  'brave',
  'Brave Browser',
  'Vivaldi',
  'vivaldi',
  'Chromium',
  'chromium',
]

const TOKEN_REGEX = /v\d+(%3A|:)[A-Za-z0-9_.%-]+/
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/

function extractValueFromDecrypted(decrypted: string): string {
  const tokenMatch = decrypted.match(TOKEN_REGEX)
  if (tokenMatch) return tokenMatch[0]

  const uuidMatch = decrypted.match(UUID_REGEX)
  if (uuidMatch) return uuidMatch[0]

  return decrypted
}

export class BrowserTokenExtractor {
  private platform: NodeJS.Platform
  private debug: boolean
  private cachedKey: Buffer | null = null
  private extractionErrors: string[] = []

  constructor(platform?: NodeJS.Platform, options?: { debug?: boolean }) {
    this.platform = platform ?? process.platform
    this.debug = options?.debug ?? false
  }

  getErrors(): string[] {
    return [...this.extractionErrors]
  }

  async extract(): Promise<ExtractedToken | null> {
    const [firstCandidate] = await this.extractAll()

    if (!firstCandidate && this.debug) {
      console.error('[debug] No Notion cookies found in any browser profile')
    }

    return firstCandidate ?? null
  }

  async extractAll(): Promise<ExtractedToken[]> {
    const cookiePaths = this.getBrowserCookiePaths()
    const candidatesByToken = new Map<string, ExtractedBrowserTokenCandidate>()

    for (const cookiePath of cookiePaths) {
      if (!existsSync(cookiePath)) continue

      if (this.debug) {
        console.error(`[debug] Browser cookie path: ${cookiePath}`)
      }

      const extractedCandidates = this.copyAndExtract(cookiePath)
      for (const extracted of extractedCandidates) {
        const existing = candidatesByToken.get(extracted.extracted.token_v2)
        if (!existing || extracted.lastAccessUtc > existing.lastAccessUtc) {
          candidatesByToken.set(extracted.extracted.token_v2, extracted)
        }

        if (this.debug) {
          console.error(`[debug] Found Notion token in: ${cookiePath}`)
        }
      }
    }

    const candidates = [...candidatesByToken.values()]
    candidates.sort((left, right) => right.lastAccessUtc - left.lastAccessUtc)

    return candidates.map((candidate) => candidate.extracted)
  }

  getBrowserCookiePaths(): string[] {
    const paths: string[] = []

    for (const browser of BROWSERS) {
      const browserBase = this.getBrowserBasePath(browser)
      if (!browserBase) continue

      const profileDirs = this.discoverProfileDirs(browserBase)
      for (const profileDir of profileDirs) {
        paths.push(join(profileDir, 'Network', 'Cookies'))
        paths.push(join(profileDir, 'Cookies'))
      }
    }

    return paths
  }

  getBrowserBasePath(browser: BrowserConfig): string | null {
    let relative: string

    switch (this.platform) {
      case 'darwin':
        relative = browser.darwin
        if (!relative) return null
        return join(homedir(), 'Library', 'Application Support', relative)
      case 'linux':
        relative = browser.linux
        if (!relative) return null
        return join(homedir(), '.config', relative)
      case 'win32':
        relative = browser.win32
        if (!relative) return null
        return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), relative)
      default:
        return null
    }
  }

  private discoverProfileDirs(browserBase: string): string[] {
    const dirs = new Set<string>([join(browserBase, 'Default')])

    if (!existsSync(browserBase)) return [...dirs]

    const localStateProfiles = this.readProfilesFromLocalState(browserBase)
    for (const profileName of localStateProfiles) {
      dirs.add(join(browserBase, profileName))
    }

    try {
      const entries = readdirSync(browserBase, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (!this.isProfileDirectory(browserBase, entry.name)) continue
        dirs.add(join(browserBase, entry.name))
      }
    } catch (error) {
      this.extractionErrors.push(`discoverProfileDirs: ${(error as Error).message}`)
    }

    return [...dirs]
  }

  private copyAndExtract(dbPath: string): ExtractedBrowserTokenCandidate[] {
    const tempPath = join(tmpdir(), `notion-browser-cookies-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)

    try {
      copyFileSync(dbPath, tempPath)
    } catch {
      this.extractionErrors.push(`copyAndExtract: failed to copy ${dbPath}`)
      return []
    }

    try {
      return this.readTokenFromDb(tempPath, dbPath)
    } finally {
      try {
        rmSync(tempPath, { force: true })
      } catch (error) {
        this.extractionErrors.push(`copyAndExtract: failed to remove temp db ${tempPath}: ${(error as Error).message}`)
      }
    }
  }

  private readTokenFromDb(dbPath: string, originalPath: string): ExtractedBrowserTokenCandidate[] {
    try {
      const placeholders = NOTION_HOST_KEYS.map(() => '?').join(', ')
      const sql = `
        SELECT name, value, encrypted_value, last_access_utc
        FROM cookies
        WHERE host_key IN (${placeholders})
        AND name IN (${NOTION_COOKIE_NAMES.map(() => '?').join(', ')})
        ORDER BY last_access_utc DESC
      `
      const params = [...NOTION_HOST_KEYS, ...NOTION_COOKIE_NAMES]

      const db = openSqlite(dbPath)
      let rows: CookieRow[]
      try {
        rows = db.all(sql, ...params) as CookieRow[]
      } finally {
        db.close()
      }

      rows.sort((a, b) => (b.last_access_utc ?? 0) - (a.last_access_utc ?? 0))

      return this.buildCandidatesFromRows(rows, originalPath)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('SQLite is required')) {
        throw error
      }
      this.extractionErrors.push(`readTokenFromDb: ${(error as Error).message}`)
      return []
    }
  }

  private buildCandidatesFromRows(rows: CookieRow[], originalPath: string): ExtractedBrowserTokenCandidate[] {
    const normalizedRows = rows
    const candidates: Array<ExtractedBrowserTokenCandidate & { tokenIndex: number }> = []
    const candidateIndexByTokenIndex = new Map<number, number>()

    const resolveRowValue = (row: CookieRow | undefined): string | null => {
      if (!row) return null

      if (row.encrypted_value && row.encrypted_value.length > 0) {
        const encryptedValue = Buffer.from(row.encrypted_value)
        if (this.isEncryptedValue(encryptedValue)) {
          return this.decryptCookie(encryptedValue, originalPath)
        }

        return encryptedValue.toString('utf8')
      }

      return row.value ?? null
    }

    normalizedRows.forEach((row, index) => {
      if (row.name !== 'token_v2') {
        return
      }

      const rawToken = resolveRowValue(row)
      if (!rawToken) {
        return
      }

      const candidateIndex = candidates.length
      candidates.push({
        extracted: {
          token_v2: extractValueFromDecrypted(rawToken),
        },
        lastAccessUtc: row.last_access_utc ?? 0,
        tokenIndex: index,
      })
      candidateIndexByTokenIndex.set(index, candidateIndex)
    })

    const tokenAnchors = normalizedRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.name === 'token_v2')

    const chooseCandidateIndex = (rowIndex: number, rowLastAccessUtc: number): number | null => {
      let newerTokenAnchorIndex = -1
      for (let tokenAnchorIndex = 0; tokenAnchorIndex < tokenAnchors.length; tokenAnchorIndex++) {
        if (tokenAnchors[tokenAnchorIndex].index < rowIndex) {
          newerTokenAnchorIndex = tokenAnchorIndex
        }
      }
      const olderTokenAnchorIndex = tokenAnchors.findIndex((tokenAnchor) => tokenAnchor.index > rowIndex)

      if (newerTokenAnchorIndex === -1 && olderTokenAnchorIndex === -1) {
        return null
      }

      const newerTokenAnchor = newerTokenAnchorIndex === -1 ? null : tokenAnchors[newerTokenAnchorIndex]
      const olderTokenAnchor = olderTokenAnchorIndex === -1 ? null : tokenAnchors[olderTokenAnchorIndex]
      const newerCandidateIndex = newerTokenAnchor
        ? (candidateIndexByTokenIndex.get(newerTokenAnchor.index) ?? null)
        : null
      const olderCandidateIndex = olderTokenAnchor
        ? (candidateIndexByTokenIndex.get(olderTokenAnchor.index) ?? null)
        : null
      const newerDistance = newerTokenAnchor
        ? Math.abs((newerTokenAnchor.row.last_access_utc ?? 0) - rowLastAccessUtc)
        : Number.POSITIVE_INFINITY
      const olderDistance = olderTokenAnchor
        ? Math.abs((olderTokenAnchor.row.last_access_utc ?? 0) - rowLastAccessUtc)
        : Number.POSITIVE_INFINITY

      if (newerCandidateIndex === null && olderCandidateIndex === null) {
        return null
      }

      if (newerTokenAnchorIndex === -1) {
        return olderCandidateIndex
      }

      if (olderTokenAnchorIndex === -1) {
        return newerCandidateIndex
      }

      if (newerCandidateIndex === null) {
        return olderDistance < newerDistance ? olderCandidateIndex : null
      }

      if (olderCandidateIndex === null) {
        return newerDistance < olderDistance ? newerCandidateIndex : null
      }

      return newerDistance <= olderDistance ? newerCandidateIndex : olderCandidateIndex
    }

    normalizedRows.forEach((row, rowIndex) => {
      if (row.name === 'token_v2') {
        return
      }

      const candidateIndex = chooseCandidateIndex(rowIndex, row.last_access_utc ?? 0)
      if (candidateIndex === null) {
        return
      }

      const candidate = candidates[candidateIndex]
      if (row.name === 'notion_user_id' && !candidate.extracted.user_id) {
        const rawUserId = resolveRowValue(row)
        const userId = rawUserId ? extractValueFromDecrypted(rawUserId) : undefined
        if (userId) {
          candidate.extracted.user_id = userId
        }
      }

      if (row.name === 'notion_users' && !candidate.extracted.user_ids) {
        const userIds = this.parseUserIds(resolveRowValue(row) ?? undefined)
        if (userIds.length > 0) {
          candidate.extracted.user_ids = userIds
        }
      }
    })

    return candidates.map(({ tokenIndex: _tokenIndex, ...candidate }) => candidate)
  }

  private parseUserIds(raw: string | undefined): string[] {
    if (!raw) return []

    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        return parsed
      }
    } catch {
      const match = raw.match(/\[.*\]/)
      if (match) {
        try {
          const parsed = JSON.parse(match[0]) as unknown
          if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
            return parsed
          }
        } catch {
          return []
        }
      }
    }

    return []
  }

  private readProfilesFromLocalState(browserBase: string): string[] {
    const localStatePath = join(browserBase, 'Local State')
    if (!existsSync(localStatePath)) return []

    try {
      const raw = JSON.parse(readFileSync(localStatePath, 'utf8')) as {
        profile?: { info_cache?: Record<string, unknown> }
      }

      return Object.keys(raw.profile?.info_cache ?? {})
    } catch (error) {
      this.extractionErrors.push(`readProfilesFromLocalState: ${(error as Error).message}`)
      return []
    }
  }

  private isProfileDirectory(browserBase: string, entryName: string): boolean {
    if (/^(Default|Profile \d+|Guest Profile|System Profile)$/i.test(entryName)) {
      return true
    }

    const profilePath = join(browserBase, entryName)
    return existsSync(join(profilePath, 'Network', 'Cookies')) || existsSync(join(profilePath, 'Cookies'))
  }

  isEncryptedValue(value: Buffer): boolean {
    if (!value || value.length < 4) return false
    const prefix = value.subarray(0, 3).toString('utf8')
    return prefix === 'v10' || prefix === 'v11'
  }

  private decryptCookie(encryptedValue: Buffer, dbPath: string): string | null {
    if (this.platform === 'win32') {
      return this.decryptWindowsCookie(encryptedValue, dbPath)
    } else if (this.platform === 'darwin') {
      return this.decryptMacCookie(encryptedValue)
    } else if (this.platform === 'linux') {
      return this.decryptLinuxCookie(encryptedValue)
    }

    return null
  }

  decryptMacCookie(encryptedData: Buffer): string | null {
    if (this.cachedKey) {
      const decrypted = this.decryptAESCBC(encryptedData, this.cachedKey)
      if (decrypted) return decrypted
    }

    for (const variant of KEYCHAIN_VARIANTS) {
      const password = this.execKeychainCommand(variant.service, variant.account)
      if (!password) continue

      const key = pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1')
      const decrypted = this.decryptAESCBC(encryptedData, key)
      if (decrypted) {
        this.cachedKey = key
        return decrypted
      }
    }

    this.extractionErrors.push('decryptMacCookie: no keychain variant succeeded')
    return null
  }

  private execKeychainCommand(service: string, account: string): string | null {
    try {
      const safeService = service.replace(/"/g, '\\"')
      const safeAccount = account.replace(/"/g, '\\"')
      return execSync(`security find-generic-password -s "${safeService}" -a "${safeAccount}" -w 2>/dev/null`, {
        encoding: 'utf8',
      }).trim()
    } catch {
      return null
    }
  }

  decryptLinuxCookie(encryptedData: Buffer): string | null {
    const prefix = encryptedData.subarray(0, 3).toString('utf8')

    if (prefix === 'v11') {
      for (const appName of LINUX_KEYRING_APP_NAMES) {
        const keyringPassword = this.lookupLinuxKeyringPassword(appName)
        if (!keyringPassword) continue

        const key = pbkdf2Sync(keyringPassword, 'saltysalt', 1, 16, 'sha1')
        const decrypted = this.decryptAESCBC(encryptedData, key)
        if (decrypted) return decrypted
      }
    }

    const key = pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1')
    return this.decryptAESCBC(encryptedData, key)
  }

  lookupLinuxKeyringPassword(appName: string): string | null {
    try {
      return execSync(`secret-tool lookup xdg:schema chrome_libsecret_os_crypt_password_v2 application '${appName}'`, {
        timeout: 5000,
        encoding: 'utf8',
      }).trim()
    } catch {
      return null
    }
  }

  decryptWindowsCookie(encryptedData: Buffer, dbPath: string): string | null {
    try {
      const localStatePath = this.findLocalStateForCookiePath(dbPath)
      if (!localStatePath || !existsSync(localStatePath)) return null

      const localState = JSON.parse(readFileSync(localStatePath, 'utf8')) as {
        os_crypt?: { encrypted_key?: string }
      }
      const encryptedKeyB64 = localState?.os_crypt?.encrypted_key
      if (!encryptedKeyB64) return null

      const encryptedKey = Buffer.from(encryptedKeyB64, 'base64')
      if (encryptedKey.subarray(0, 5).toString() !== 'DPAPI') return null

      const masterKey = this.decryptDPAPI(encryptedKey.subarray(5))
      if (!masterKey) return null

      return this.decryptAESGCM(encryptedData, masterKey)
    } catch {
      this.extractionErrors.push('decryptWindowsCookie: failed')
      return null
    }
  }

  private findLocalStateForCookiePath(cookiePath: string): string | null {
    const parts = cookiePath.split(/[/\\]/)
    for (let levels = 2; levels <= 4; levels++) {
      if (parts.length < levels) break
      const base = parts.slice(0, parts.length - levels).join('/')
      const candidate = join(base, 'Local State')
      if (existsSync(candidate)) return candidate
    }
    return null
  }

  private decryptDPAPI(encryptedBlob: Buffer): Buffer | null {
    try {
      const b64 = encryptedBlob.toString('base64')
      const script = [
        'Add-Type -AssemblyName System.Security',
        `$d=[System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String("${b64}"),$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)`,
        '[Convert]::ToBase64String($d)',
      ].join(';')

      const encodedCommand = Buffer.from(script, 'utf16le').toString('base64')
      const result = execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encodedCommand}`, {
        encoding: 'utf8',
        timeout: 10000,
      }).trim()

      return Buffer.from(result, 'base64')
    } catch {
      this.extractionErrors.push('decryptDPAPI: PowerShell decryption failed')
      return null
    }
  }

  decryptAESCBC(encryptedData: Buffer, key: Buffer): string | null {
    try {
      const ciphertext = encryptedData.subarray(3)
      const iv = Buffer.alloc(16, 0x20)

      const decipher = createDecipheriv('aes-128-cbc', key, iv)
      decipher.setAutoPadding(true)

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])

      // Chromium v130+ prepends a 32-byte integrity hash before the actual cookie value
      if (decrypted.length > 32) {
        const hasNonPrintablePrefix = decrypted.subarray(0, 32).some((b) => b < 0x20 || b > 0x7e)
        if (hasNonPrintablePrefix) {
          return decrypted.subarray(32).toString('utf8')
        }
      }

      return decrypted.toString('utf8')
    } catch {
      return null
    }
  }

  private decryptAESGCM(encryptedData: Buffer, key: Buffer): string | null {
    try {
      // Format: v10 (3 bytes) + IV (12 bytes) + ciphertext + auth tag (16 bytes)
      if (encryptedData.length < 3 + 12 + 16) return null

      const iv = encryptedData.subarray(3, 15)
      const authTag = encryptedData.subarray(-16)
      const ciphertext = encryptedData.subarray(15, -16)

      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(authTag)

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
      return decrypted.toString('utf8')
    } catch {
      return null
    }
  }
}
