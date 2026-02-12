---
name: agent-notionbot
description: Interact with Notion workspaces using official API - manage pages, databases, blocks, users, and comments
allowed-tools: Bash(agent-notionbot:*)
---

# Agent Notionbot

A TypeScript CLI tool that enables AI agents and humans to interact with Notion workspaces through the official Notion API. Supports pages, databases, blocks, users, comments, and search.

## Quick Start

```bash
# Check authentication status
agent-notionbot auth status

# Search for a page or database
agent-notionbot search "Project Roadmap"

# List all databases
agent-notionbot database list

# Create a new page
agent-notionbot page create --parent <parent_id> --title "My New Page"
```

## Authentication

### Integration Token (Official API)

Set the `NOTION_TOKEN` environment variable with your integration token from the [Notion Developer Portal](https://www.notion.so/my-integrations).

```bash
export NOTION_TOKEN=secret_xxx
agent-notionbot auth status
```

The integration token provides access to the official Notion API (`@notionhq/client`).

## Commands

### Page Commands

```bash
# Retrieve a page
agent-notionbot page get <page_id>

# Create a new page under a parent page or database
agent-notionbot page create --parent <parent_id> --title "New Page Title"
agent-notionbot page create --parent <database_id> --title "New Database Item" --database

# Update page properties
agent-notionbot page update <page_id> --set "Status=In Progress" --set "Priority=High"

# Archive (delete) a page
agent-notionbot page archive <page_id>

# Retrieve a specific page property
agent-notionbot page property <page_id> <property_id>
```

### Database Commands

```bash
# Retrieve a database schema
agent-notionbot database get <database_id>

# Query a database with optional filters and sorts
agent-notionbot database query <database_id> --filter '{"property": "Status", "select": {"equals": "In Progress"}}'
agent-notionbot database query <database_id> --sort '[{"property": "Created time", "direction": "descending"}]'
agent-notionbot database query <database_id> --page-size 10 --start-cursor <cursor>

# Create a database under a parent page
agent-notionbot database create --parent <page_id> --title "My Database" --properties '{"Name": {"title": {}}}'

# Update a database schema or title
agent-notionbot database update <database_id> --title "Updated Title"

# List all databases accessible by the integration
agent-notionbot database list
agent-notionbot database list --page-size 10 --start-cursor <cursor>
```

### Block Commands

```bash
# Retrieve a block
agent-notionbot block get <block_id>

# List direct children of a block (paginated)
agent-notionbot block children <block_id>
agent-notionbot block children <block_id> --page-size 50 --start-cursor <cursor>

# Append child blocks to a parent
agent-notionbot block append <parent_id> --content '[{"type": "paragraph", "paragraph": {"rich_text": [{"type": "text", "text": {"content": "Hello World"}}]}}]'

# Update a block's content
agent-notionbot block update <block_id> --content '{"paragraph": {"rich_text": [{"type": "text", "text": {"content": "Updated content"}}]}}'

# Delete (trash) a block
agent-notionbot block delete <block_id>
```

### User Commands

```bash
# List all users in the workspace
agent-notionbot user list
agent-notionbot user list --page-size 10 --start-cursor <cursor>

# Get info for a specific user
agent-notionbot user get <user_id>

# Get info for the current bot/integration
agent-notionbot user me
```

### Search Commands

```bash
# Search across the entire workspace
agent-notionbot search "query text"

# Filter search by object type
agent-notionbot search "Project" --filter page
agent-notionbot search "Tasks" --filter database

# Sort search results
agent-notionbot search "Meeting" --sort desc

# Paginate search results
agent-notionbot search "Notes" --page-size 10 --start-cursor <cursor>
```

### Comment Commands

```bash
# List comments on a page
agent-notionbot comment list --page <page_id>
agent-notionbot comment list --page <page_id> --page-size 10 --start-cursor <cursor>

# Create a comment on a page
agent-notionbot comment create "This is a comment" --page <page_id>

# Reply to a comment thread (discussion)
agent-notionbot comment create "Replying to thread" --discussion <discussion_id>

# Retrieve a specific comment
agent-notionbot comment get <comment_id>
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
agent-notionbot search "Project" --pretty
```

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
