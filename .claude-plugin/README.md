# Vibe Notion - Claude Code Plugin

Give your AI agent the power to read and write Notion pages, databases, and more. Ships two CLIs:

- **`vibe-notion`** — Unofficial private API (act as yourself via `token_v2`)
- **`vibe-notionbot`** — Official Integration API (act as a bot via `NOTION_TOKEN`)

## Installation

```bash
# Install the CLI globally
npm install -g vibe-notion

# Add the skill to your agent
npx skills add devxoul/vibe-notion
```

## What it does

Enables AI agents to interact with Notion workspaces through a CLI interface:

- **Manage Pages**: Create, retrieve, update, and archive pages.
- **Query Databases**: List databases and query them with filters and sorts.
- **Work with Blocks**: Read, append, update, and delete content blocks.
- **Search Workspace**: Search across pages and databases.
- **Manage Comments**: List and create comments on pages or discussions.
- **User Information**: List workspace users and get user info.

## Key Features

### Agent-Friendly Output

All commands output JSON by default, making it easy for AI agents to parse and use. Use the `--pretty` flag for human-readable formatted JSON.

### Full API Coverage

Both CLIs support all major Notion resource groups:
- `page` — Single page operations
- `database` — Schema management and querying
- `block` — Content manipulation
- `user` — User discovery
- `search` — Workspace search
- `comment` — Collaboration and threads

## Quick Start

### `vibe-notion` (Private API — act as yourself)

Requires `token_v2` extracted from the Notion desktop app. No API keys or OAuth needed.

```bash
# 1. Extract token_v2 from Notion desktop app
vibe-notion auth extract

# 2. List your workspaces
vibe-notion workspace list --pretty

# 3. Search for something
vibe-notion search "Roadmap" --workspace-id <workspace-id> --pretty

# 4. Get page content
vibe-notion page get <page-id> --workspace-id <workspace-id> --pretty
```

> **Note**: `--workspace-id` is required for all `vibe-notion` commands that operate within a workspace. Use `vibe-notion workspace list` to find yours.

### `vibe-notionbot` (Official API — act as a bot)

Requires `NOTION_TOKEN` environment variable with an Integration token from the [Notion Developer Portal](https://www.notion.so/my-integrations).

```bash
# 1. Set your Notion Integration Token
export NOTION_TOKEN=secret_xxx

# 2. Check auth status
vibe-notionbot auth status --pretty

# 3. Search for something
vibe-notionbot search "Roadmap" --filter page --pretty

# 4. Get page details
vibe-notionbot page get <page-id> --pretty
```

## Example Usage

### Databases

```bash
# vibe-notion (private API)
vibe-notion database list --workspace-id <workspace-id> --pretty
vibe-notion database query <collection-id> --workspace-id <workspace-id> --limit 10 --pretty

# vibe-notionbot (official API)
vibe-notionbot database list --pretty
vibe-notionbot database query <database-id> --filter '{"property": "Status", "select": {"equals": "In Progress"}}' --pretty
```

### Blocks

```bash
# vibe-notion (private API) — uses internal block format
vibe-notion block append <page-id> --workspace-id <workspace-id> --markdown '# Hello\n\nThis is **bold** text.'

# vibe-notionbot (official API) — uses official API block format
vibe-notionbot block append <page-id> --markdown '# Hello\n\nThis is **bold** text.'
```

### Comments

```bash
# vibe-notion (private API)
vibe-notion comment list --page <page-id> --workspace-id <workspace-id> --pretty
vibe-notion comment create "This looks great!" --page <page-id> --workspace-id <workspace-id> --pretty

# vibe-notionbot (official API)
vibe-notionbot comment list --page <page-id> --pretty
vibe-notionbot comment create "This looks great!" --page <page-id> --pretty
```

## Requirements

- Node.js 18+ or Bun runtime

### For `vibe-notion` (private API):
- Notion desktop app installed and logged in (for `token_v2` extraction)

### For `vibe-notionbot` (official API):
- A Notion Integration Token from the [Notion Developer Portal](https://www.notion.so/my-integrations)
- `NOTION_TOKEN` environment variable set

## More Information

- [GitHub Repository](https://github.com/devxoul/vibe-notion)
- [vibe-notion Skill Documentation](https://github.com/devxoul/vibe-notion/blob/main/skills/vibe-notion/SKILL.md)
- [vibe-notionbot Skill Documentation](https://github.com/devxoul/vibe-notion/blob/main/skills/vibe-notionbot/SKILL.md)
