# Contributing to Vibe Notion

Thank you for your interest in contributing to Vibe Notion!

## Development Setup

This project uses [Bun](https://bun.sh/) for development.

### 1. Install Dependencies

```bash
bun install
```

### 2. Link CLI Globally

To test the CLI locally, link it:

```bash
bun link
```

Now you can run `vibe-notion` directly from your terminal.

### 3. Run Tests

We use `bun test` for TDD:

```bash
bun test src/
```

### 4. Linting and Formatting

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
# Check for lint errors and formatting
bun run lint

# Automatically fix lint errors and format code
bun run format
```

### 5. Type Checking

```bash
bun run typecheck
```

### 6. Build

```bash
bun run build
```

The compiled files will be in the `dist/` directory. The `postbuild` script will automatically replace the Bun shebang with a Node.js shebang for npm compatibility.

## Project Structure

- `src/` — Source code
  - `platforms/notion/` — Unofficial private API CLI (`vibe-notion`)
    - `cli.ts` — CLI entry point
    - `client.ts` — Private API client
    - `commands/` — Command implementations
    - `credential-manager.ts` — Token storage
    - `token-extractor.ts` — Desktop app token extraction
    - `formatters.ts` — Output formatting
  - `platforms/notionbot/` — Official API CLI (`vibe-notionbot`)
    - `cli.ts` — CLI entry point
    - `client.ts` — Official API client (`@notionhq/client`)
    - `commands/` — Command implementations
    - `formatters.ts` — Output formatting
  - `shared/` — Code shared between platforms
    - `markdown/` — Markdown parsing utilities
    - `utils/` — Shared utility functions
- `skills/` — Agent skill definitions
  - `vibe-notion/` — Skill for the private API CLI
  - `vibe-notionbot/` — Skill for the official API CLI
- `scripts/` — Build and development scripts
- `.claude-plugin/` — Claude marketplace manifest files

## Guidelines

- Follow TDD: write tests before implementing features.
- Keep the CLI agent-friendly (JSON output by default).
- Ensure Node.js compatibility (no `bun:*` imports in `src/`).
- Use named exports only.
- No docstrings on internal functions.
