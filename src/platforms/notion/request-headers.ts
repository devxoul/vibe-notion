// Cloudflare challenges requests to www.notion.so/api/v3 that carry a non-browser
// User-Agent, so every private API request identifies itself as a browser.
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
