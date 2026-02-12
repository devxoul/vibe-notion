export async function internalRequest(
  tokenV2: string,
  endpoint: string,
  body: Record<string, unknown> = {},
): Promise<unknown> {
  const response = await fetch(`https://www.notion.so/api/v3/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `token_v2=${tokenV2}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Notion internal API error: ${response.status}`)
  }

  return response.json()
}
