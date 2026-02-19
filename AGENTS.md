# AGENTS.md

## Project Overview

Notion API CLI for AI agents. Ships two CLIs:
- `vibe-notion` — unofficial private API (acts as user via `token_v2`)
- `vibe-notionbot` — official Integration API (acts as bot via `NOTION_TOKEN`)

Runtime: Bun for development, Node.js-compatible output for npm distribution.

## Commands

```bash
# Install dependencies
bun install

# Run all unit tests
bun test

# Run all e2e tests
bun test:e2e

# Type checking
bun run typecheck

# Lint (Biome)
bun run lint
bun run lint:fix

# Format
bun run format
```

Always use `bun` — never `node`, `npm`, `npx`, `yarn`, or `pnpm`. Bun loads `.env` automatically; do not use dotenv.

## TypeScript Execution Model

### Local Development

Bun runs TypeScript directly — no compilation step needed.

- `bin` entries in `package.json` point to `./src/platforms/*/cli.ts` files
- All CLI entry points use `#!/usr/bin/env bun` shebang
- Run any file: `bun src/platforms/notion/cli.ts`

### Production Build (Publish)

`bun run build` compiles to `dist/` for npm consumers who don't have Bun.

1. `tsc` compiles `src/` → `dist/src/` (JS + declarations + source maps)
2. `tsc-alias` resolves `@/*` path aliases in the compiled output
3. `scripts/postbuild.ts` replaces `#!/usr/bin/env bun` → `#!/usr/bin/env node` in CLI files
4. `module` and `main` in `package.json` point to `dist/cli.js`

npm consumers run compiled JS via Node.js. The `prepublishOnly` script runs the build, then `scripts/prepublish.ts` rewrites `bin` paths from `./src/*.ts` to `dist/src/*.js`. After publish, `postpublish` restores `package.json` via `git checkout`.

### Key Distinction

| | Local (dev) | Published (npm) |
|---|---|---|
| Runtime | Bun | Node.js |
| Entry files | `src/platforms/*/cli.ts` | `dist/src/platforms/*/cli.js` |
| Shebang | `#!/usr/bin/env bun` | `#!/usr/bin/env node` |
| Compilation | None (Bun runs TS) | `tsc` → `dist/` |

## Release

Use the **Release** GitHub Actions workflow (`workflow_dispatch`). Enter the version (e.g., `0.2.0`) — it typechecks, lints, tests, bumps version in `package.json`, commits, tags, publishes to npm, and creates a GitHub Release. Tags have no `v` prefix.
