---
name: agent-notion
description: Interact with Notion workspaces - manage pages, databases, blocks, users, and comments
allowed-tools: Bash(agent-notion:*)
---

# Agent Notion

A TypeScript CLI tool that enables AI agents and humans to interact with Notion workspaces through a simple command interface. Supports pages, databases, blocks, users, comments, and search.

## Quick Start

```bash
# Check authentication status
agent-notion auth status

# Search for a page or database
agent-notion search "Project Roadmap"

# List all databases
agent-notion database list

# Create a new page
agent-notion page create --parent <parent_id> --title "My New Page"
```

## Authentication

### Integration Token (Official API)

Set the `NOTION_TOKEN` environment variable with your integration token.

```bash
export NOTION_TOKEN=secret_xxx
agent-notion auth status
```

### Token Extraction (Desktop App)

Extract `token_v2` from the Notion desktop app automatically. No API keys or OAuth needed.

```bash
# Extract token_v2 from Notion desktop app
agent-notion auth extract

# Check auth status (shows both integration and token_v2)
agent-notion auth status

# Remove stored token_v2
agent-notion auth logout
```

On macOS, your system may prompt for Keychain access — this is normal and required to decrypt the cookie.

The extracted `token_v2` is stored at `~/.config/agent-notion/credentials.json` with `0600` permissions.

> **Note**: `token_v2` uses Notion's internal API (`/api/v3/`), which is separate from the official public API. The official `@notionhq/client` commands (page, database, block, etc.) require an integration token.

## Commands

### Page Commands

```bash
# Retrieve a page
agent-notion page get <page_id>

# Create a new page under a parent page or database
agent-notion page create --parent <parent_id> --title "New Page Title"
agent-notion page create --parent <database_id> --title "New Database Item" --database

# Update page properties
agent-notion page update <page_id> --set "Status=In Progress" --set "Priority=High"

# Archive (delete) a page
agent-notion page archive <page_id>

# Retrieve a specific page property
agent-notion page property <page_id> <property_id>
```

### Database Commands

```bash
# Retrieve a database schema
agent-notion database get <database_id>

# Query a database with optional filters and sorts
agent-notion database query <database_id> --filter '{"property": "Status", "select": {"equals": "In Progress"}}'
agent-notion database query <database_id> --sort '[{"property": "Created time", "direction": "descending"}]'

# Create a database under a parent page
agent-notion database create --parent <page_id> --title "My Database" --properties '{"Name": {"title": {}}}'

# Update a database schema or title
agent-notion database update <database_id> --title "Updated Title"

# List all databases accessible by the integration
agent-notion database list
```

### Block Commands

```bash
# Retrieve a block
agent-notion block get <block_id>

# List direct children of a block (paginated)
agent-notion block children <block_id>
agent-notion block children <block_id> --page-size 50

# Append child blocks to a parent
agent-notion block append <parent_id> --content '[{"type": "paragraph", "paragraph": {"rich_text": [{"type": "text", "text": {"content": "Hello World"}}]}}]'

# Update a block's content
agent-notion block update <block_id> --content '{"paragraph": {"rich_text": [{"type": "text", "text": {"content": "Updated content"}}]}}'

# Delete (trash) a block
agent-notion block delete <block_id>
```

### User Commands

```bash
# List all users in the workspace
agent-notion user list

# Get info for a specific user
agent-notion user get <user_id>

# Get info for the current bot/integration
agent-notion user me
```

### Search Commands

```bash
# Search across the entire workspace
agent-notion search "query text"

# Filter search by object type
agent-notion search "Project" --filter page
agent-notion search "Tasks" --filter database

# Sort search results
agent-notion search "Meeting" --sort desc
```

### Comment Commands

```bash
# List comments on a page
agent-notion comment list --page <page_id>

# Create a comment on a page
agent-notion comment create "This is a comment" --page <page_id>

# Reply to a comment thread (discussion)
agent-notion comment create "Replying to thread" --discussion <discussion_id>

# Retrieve a specific comment
agent-notion comment get <comment_id>
```

## Output Format

### JSON (Default)

All commands output JSON by default for AI consumption:

```json
{
  "id": "...",
  "object": "page",
  "properties": { ... }
}
```

### Pretty (Human-Readable)

Use `--pretty` flag for formatted output:

```bash
agent-notion search "Project" --pretty
```

## Common Patterns

See `references/common-patterns.md` for typical AI agent workflows.

## Templates

See `templates/` directory for runnable examples:
- `read-page.sh` - Read page content recursively
- `query-database.sh` - Query database and process results
- `create-page.sh` - Create page with content
- `workspace-overview.sh` - Get workspace summary

## Error Handling

Common errors from the Notion API:
- `object_not_found`: The ID is incorrect or the integration doesn't have access.
- `unauthorized`: The `NOTION_TOKEN` is invalid.
- `rate_limited`: Too many requests.

## Limitations

- Supports Notion API version 2022-06-28.
- Does not support OAuth (token only).
- Does not support file uploads in v1.
- Page property updates are limited to simple key=value pairs unless using raw JSON.
- `auth extract` supports macOS and Linux. Windows DPAPI decryption is not yet supported.
- `token_v2` uses the unofficial internal API and may break if Notion changes it.
