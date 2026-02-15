import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CredentialManager } from './credential-manager'

describe('CredentialManager', () => {
  let configDir: string
  let manager: CredentialManager

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'vibe-notion-credentials-'))
    manager = new CredentialManager(configDir)
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
  })

  test('load returns empty config when file does not exist', async () => {
    const config = await manager.load()
    expect(config).toEqual({ credentials: null })
  })

  test('save and load round-trip credentials', async () => {
    const config = {
      credentials: {
        token_v2: 'v02%3Atoken',
        user_id: 'user-123',
      },
    }

    await manager.save(config)
    const loaded = await manager.load()

    expect(loaded).toEqual(config)
  })

  test('save creates file with 0600 permissions', async () => {
    await manager.save({ credentials: { token_v2: 'v02%3Atoken' } })

    const credentialsPath = join(configDir, 'credentials.json')
    expect(existsSync(credentialsPath)).toBe(true)

    const stats = await Bun.file(credentialsPath).stat()
    const mode = stats?.mode ?? 0
    expect(mode & 0o777).toBe(0o600)
  })

  test('getCredentials returns null when no credentials are stored', async () => {
    const creds = await manager.getCredentials()
    expect(creds).toBeNull()
  })

  test('setCredentials stores and getCredentials returns values', async () => {
    await manager.setCredentials({ token_v2: 'v02%3Atoken', user_id: 'user-777' })
    const creds = await manager.getCredentials()

    expect(creds).toEqual({ token_v2: 'v02%3Atoken', user_id: 'user-777' })
  })

  test('remove deletes credential file', async () => {
    const credentialsPath = join(configDir, 'credentials.json')
    await manager.setCredentials({ token_v2: 'v02%3Atoken' })
    expect(existsSync(credentialsPath)).toBe(true)

    await manager.remove()

    expect(existsSync(credentialsPath)).toBe(false)
  })
})
