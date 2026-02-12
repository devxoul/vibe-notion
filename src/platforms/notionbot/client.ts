import { Client } from '@notionhq/client'
import type {
  AppendBlockChildrenResponse,
  BlockObjectRequest,
} from '@notionhq/client/build/src/api-endpoints'

const BLOCK_CHUNK_SIZE = 100

export class NotionClient {
  private sdk: Client

  constructor(token: string) {
    if (!token) {
      throw new Error(
        'NOTION_TOKEN is required. Create an integration at https://www.notion.so/profile/integrations'
      )
    }
    this.sdk = new Client({ auth: token, notionVersion: '2022-06-28' })
  }

  get pages() {
    return this.sdk.pages
  }

  get databases() {
    return this.sdk.databases
  }

  get blocks() {
    return this.sdk.blocks
  }

  get users() {
    return this.sdk.users
  }

  get search() {
    return this.sdk.search.bind(this.sdk)
  }

  request<T extends object>(args: {
    path: string
    method: 'get' | 'post' | 'patch' | 'delete'
    body?: Record<string, unknown>
    query?: Record<string, string>
  }): Promise<T> {
    return this.sdk.request(args)
  }

  get comments() {
    return this.sdk.comments
  }

  async appendBlockChildren(
    blockId: string,
    children: BlockObjectRequest[]
  ): Promise<AppendBlockChildrenResponse[]> {
    const results: AppendBlockChildrenResponse[] = []

    for (let i = 0; i < children.length; i += BLOCK_CHUNK_SIZE) {
      const chunk = children.slice(i, i + BLOCK_CHUNK_SIZE)
      const response = await this.sdk.blocks.children.append({
        block_id: blockId,
        children: chunk,
      })
      results.push(response)
    }

    return results
  }
}

export function getClient(): NotionClient {
  const token = process.env.NOTION_TOKEN
  if (!token) {
    throw new Error(
      'NOTION_TOKEN is required. Create an integration at https://www.notion.so/profile/integrations'
    )
  }
  return new NotionClient(token)
}
