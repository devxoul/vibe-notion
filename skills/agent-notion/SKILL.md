---
name: agent-notion
description: Interact with Notion using the unofficial private API - pages, databases, blocks, search, users
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

# List child blocks
agent-notion block children <block_id> --workspace-id <workspace_id> --pretty
agent-notion block children <block_id> --workspace-id <workspace_id> --limit 50 --pretty

# Append child blocks
agent-notion block append <parent_id> --workspace-id <workspace_id> --content '[{"type":"text","properties":{"title":[["Hello world"]]}}]' --pretty

# Update a block
agent-notion block update <block_id> --workspace-id <workspace_id> --content '{"properties":{"title":[["Updated text"]]}}' --pretty

# Delete a block
agent-notion block delete <block_id> --workspace-id <workspace_id> --pretty
```

### Search Command

```bash
# Search across workspace (--workspace-id is required)
agent-notion search "query" --workspace-id <workspace_id> --pretty
agent-notion search "query" --workspace-id <workspace_id> --limit 10 --pretty
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
      "score": 76.58,
      "spaceId": "837c0fcf-90b3-817e-86a1-00031c61d83f"
    }
  ],
  "total": 1
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
  "has_more": false
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

## Limitations

- `auth extract` supports macOS and Linux. Windows DPAPI decryption is not yet supported.
- `token_v2` uses the unofficial internal API and may break if Notion changes it.
- Comment operations are not yet supported (Notion's private comment API is opaque).
- This is a private/unofficial API and is not supported by Notion.
