
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## Project Structure

- Single-platform CLI for Notion API
- Auth via NOTION_TOKEN environment variable
- Runtime code must be Node.js-compatible (no bun:* imports except in tests)
- Biome for linting and formatting
- Commander.js for CLI framework

## Testing

Use `bun test` to run tests.

```ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Building

- `bun run build` compiles TypeScript with tsc
- `postbuild` script replaces bun shebang with node shebang for npm compatibility
