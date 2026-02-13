---
name: agent-notion
description: Interact with Notion using the unofficial private API - pages, databases, blocks, search, users, comments
allowed-tools: Bash(agent-notion:*)
---

# Agent Notion

A TypeScript CLI tool that enables AI agents and humans to interact with Notion workspaces through the unofficial private API. Supports full CRUD operations on pages, databases, blocks, search, and user management.

> **Note**: This skill uses Notion's internal/private API (`/api/v3/`), which is separate from the official public API. For official API access, use `agent-notionbot`.

## Quick Start

```bash
# 1. Extract token_v2 from Notion desktop app
agent-notion auth extract

# 2. Find your workspace ID
agent-notion workspace list --pretty

# 3. Search for a page
agent-notion search "Roadmap" --workspace-id <workspace-id> --pretty

# 4. Get page content
agent-notion page get <page-id> --workspace-id <workspace-id> --pretty

# 5. Query a database
agent-notion database query <collection-id> --workspace-id <workspace-id> --pretty
```

> **Important**: `--workspace-id` is required for ALL commands that operate within a specific workspace. Use `agent-notion workspace list` to find your workspace ID.

## Authentication

### Token Extraction (Desktop App)

Extract `token_v2` from the Notion desktop app automatically. No API keys or OAuth needed.

```bash
# Extract token_v2 from Notion desktop app
agent-notion auth extract

# Check auth status (shows extracted token_v2)
agent-notion auth status

# Remove stored token_v2
agent-notion auth logout
```

On macOS, your system may prompt for Keychain access — this is normal and required to decrypt the cookie.

The extracted `token_v2` is stored at `~/.config/agent-notion/credentials.json` with `0600` permissions.

## Commands

### Auth Commands

```bash
agent-notion auth extract    # Extract token_v2 from Notion desktop app
agent-notion auth status     # Check authentication status
agent-notion auth logout     # Remove stored token_v2
```

### Page Commands

```bash
# List pages in a space (top-level only)
agent-notion page list --workspace-id <workspace_id> --pretty
agent-notion page list --workspace-id <workspace_id> --depth 2 --pretty

# Get a page and all its content blocks
agent-notion page get <page_id> --workspace-id <workspace_id> --pretty
agent-notion page get <page_id> --workspace-id <workspace_id> --limit 50
agent-notion page get <page_id> --workspace-id <workspace_id> --backlinks --pretty

# Create a new page under a parent
agent-notion page create --workspace-id <workspace_id> --parent <parent_id> --title "My Page" --pretty

# Update page title or icon
agent-notion page update <page_id> --workspace-id <workspace_id> --title "New Title" --pretty
agent-notion page update <page_id> --workspace-id <workspace_id> --icon "🚀" --pretty

# Archive a page
agent-notion page archive <page_id> --workspace-id <workspace_id> --pretty
```

### Database Commands

```bash
# Get database schema
agent-notion database get <collection_id> --workspace-id <workspace_id> --pretty

# Query a database (auto-resolves default view)
agent-notion database query <collection_id> --workspace-id <workspace_id> --pretty
agent-notion database query <collection_id> --workspace-id <workspace_id> --limit 10 --pretty
agent-notion database query <collection_id> --workspace-id <workspace_id> --view-id <view_id> --pretty
agent-notion database query <collection_id> --workspace-id <workspace_id> --search-query "keyword" --pretty
agent-notion database query <collection_id> --workspace-id <workspace_id> --timezone "America/New_York" --pretty

# List all databases in workspace
agent-notion database list --workspace-id <workspace_id> --pretty

# Create a database
agent-notion database create --workspace-id <workspace_id> --parent <page_id> --title "Tasks" --pretty
agent-notion database create --workspace-id <workspace_id> --parent <page_id> --title "Tasks" --properties '{"status":{"name":"Status","type":"select"}}' --pretty

# Update database title or schema
agent-notion database update <collection_id> --workspace-id <workspace_id> --title "New Name" --pretty
```

### Block Commands

```bash
# Get a specific block
agent-notion block get <block_id> --workspace-id <workspace_id> --pretty
agent-notion block get <block_id> --workspace-id <workspace_id> --backlinks --pretty

# List child blocks
agent-notion block children <block_id> --workspace-id <workspace_id> --pretty
agent-notion block children <block_id> --workspace-id <workspace_id> --limit 50 --pretty
agent-notion block children <block_id> --workspace-id <workspace_id> --start-cursor '<next_cursor_json>' --pretty

# Append child blocks
agent-notion block append <parent_id> --workspace-id <workspace_id> --content '[{"type":"text","properties":{"title":[["Hello world"]]}}]' --pretty

# Update a block
agent-notion block update <block_id> --workspace-id <workspace_id> --content '{"properties":{"title":[["Updated text"]]}}' --pretty

# Delete a block
agent-notion block delete <block_id> --workspace-id <workspace_id> --pretty
```

### Comment Commands

```bash
# List comments on a page
agent-notion comment list --page <page_id> --workspace-id <workspace_id> --pretty

# Create a comment on a page (starts a new discussion)
agent-notion comment create "This is a comment" --page <page_id> --workspace-id <workspace_id> --pretty

# Reply to an existing discussion thread
agent-notion comment create "Replying to thread" --discussion <discussion_id> --workspace-id <workspace_id> --pretty

# Get a specific comment by ID
agent-notion comment get <comment_id> --workspace-id <workspace_id> --pretty
```

### Search Command

```bash
# Search across workspace (--workspace-id is required)
agent-notion search "query" --workspace-id <workspace_id> --pretty
agent-notion search "query" --workspace-id <workspace_id> --limit 10 --pretty
agent-notion search "query" --workspace-id <workspace_id> --start-cursor <offset> --pretty
```

### User Commands

```bash
# Get current user info
agent-notion user me --pretty

# Get a specific user
agent-notion user get <user_id> --workspace-id <workspace_id> --pretty
```

## Output Format

### JSON (Default)

All commands output JSON by default for AI consumption:

```bash
# Search results
agent-notion search "Roadmap" --workspace-id <workspace_id>
```
```json
{
  "results": [
    {
      "id": "305c0fcf-90b3-807a-bc1a-dc7cc18e0022",
      "title": "Getting Started",
      "score": 76.58
    }
  ],
  "has_more": true,
  "next_cursor": "20",
  "total": 100
}
```

```bash
# Database query — properties use human-readable field names from the collection schema
agent-notion database query <collection_id> --workspace-id <workspace_id>
```
```json
{
  "results": [
    {
      "id": "row-uuid",
      "properties": {
        "Name": "Acme Corp",
        "Status": "Active",
        "Type": "Enterprise"
      }
    }
  ],
  "has_more": false,
  "next_cursor": null
}
```

```bash
# Page get — returns page metadata with content blocks
agent-notion page get <page_id> --workspace-id <workspace_id>
```
```json
{
  "id": "page-uuid",
  "title": "My Page",
  "blocks": [
    { "id": "block-1", "type": "text", "text": "Hello world" },
    { "id": "block-2", "type": "to_do", "text": "Task item" }
  ]
}
```

```bash
# With --backlinks: includes pages that link to this page/block
agent-notion page get <page_id> --workspace-id <workspace_id> --backlinks
agent-notion block get <block_id> --workspace-id <workspace_id> --backlinks
```
```json
{
  "id": "page-uuid",
  "title": "My Page",
  "blocks": [...],
  "backlinks": [
    { "id": "linking-page-uuid", "title": "Page That Links Here" }
  ]
}
```

```bash
# Block get — collection_view blocks include collection_id and view_ids
agent-notion block get <block_id> --workspace-id <workspace_id>
```
```json
{
  "id": "block-uuid",
  "type": "collection_view",
  "text": "",
  "parent_id": "parent-uuid",
  "collection_id": "collection-uuid",
  "view_ids": ["view-uuid"]
}
```

### Pretty (Human-Readable)

Use `--pretty` flag for formatted output on any command:

```bash
agent-notion search "Roadmap" --workspace-id <workspace_id> --pretty
```

## When to Use `--backlinks`

Backlinks reveal which pages/databases **link to** a given page. This is critical for efficient navigation.

**Use `--backlinks` when:**
- **Tracing relations**: A search result looks like a select option, enum value, or relation target (e.g., a plan name or category). Backlinks instantly reveal all rows/pages that reference it via relation properties — no need to hunt for the parent database.
- **Finding references**: You found a page and want to know what other pages mention or link to it.
- **Reverse lookups**: Instead of querying every database to find rows pointing to a page, use backlinks on the target page to get them directly.

**Example — finding who uses a specific plan:**
```bash
# BAD: 15 API calls — search, open empty pages, trace parents, find database, query
agent-notion search "Enterprise Plan" ...
agent-notion page get <plan-page-id> ...  # empty
agent-notion block get <plan-page-id> ...  # find parent
# ... many more calls to discover the database

# GOOD: 2-3 API calls — search, then backlinks on the target
agent-notion search "Enterprise Plan" ...
agent-notion page get <plan-page-id> --backlinks --pretty
# → backlinks immediately show all people/rows linked to this plan
```

## Pagination

Commands that return lists support pagination via `has_more`, `next_cursor` fields:

- **`block children`**: Cursor-based. Pass `next_cursor` value from previous response as `--start-cursor`.
- **`search`**: Offset-based. Pass `next_cursor` value (a number) as `--start-cursor`.
- **`database query`**: Use `--limit` to control page size. `has_more` indicates more results exist, but the private API does not support cursor-based pagination — increase `--limit` to fetch more rows.

## Limitations

- `auth extract` supports macOS and Linux. Windows DPAPI decryption is not yet supported.
- `token_v2` uses the unofficial internal API and may break if Notion changes it.
- This is a private/unofficial API and is not supported by Notion.
