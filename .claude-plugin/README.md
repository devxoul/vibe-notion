# Vibe Notion - Claude Code Plugin

Notion workspace interaction skill for AI agents and Claude Code. Manage pages, databases, blocks, search, and comments through a simple CLI interface.

## Installation

```bash
# Add the marketplace
claude plugin marketplace add devxoul/vibe-notion

# Install the plugin
claude plugin install vibe-notion
```

Or within Claude Code:

```
/plugin marketplace add devxoul/vibe-notion
/plugin install vibe-notion
```

## What it does

Enables AI agents to interact with Notion workspaces through a CLI interface:

- **Manage Pages**: Create, retrieve, update, and archive pages.
- **Query Databases**: List databases and query them with filters and sorts.
- **Work with Blocks**: Read, append, update, and delete content blocks.
- **Search Workspace**: Search across pages and databases with filters.
- **Manage Comments**: List and create comments on pages or discussions.
- **User Information**: List workspace users and get integration bot info.

## Key Features

### Agent-Friendly Output

All commands output JSON by default, making it easy for AI agents to parse and use. Use the `--pretty` flag for human-readable formatted JSON.

### Full API Coverage

Supports all major Notion API resource groups:
- `page` — Single page operations
- `database` — Schema management and querying
- `block` — Content manipulation
- `user` — Workspace user discovery
- `search` — Global workspace search
- `comment` — Collaboration and threads

## Requirements

- A Notion Integration Token (Internal Integration Secret)
- `NOTION_TOKEN` environment variable set
- Node.js 18+ or Bun runtime

## Quick Start

```bash
# 1. Check authentication status
vibe-notion auth status

# 2. Search for a page
vibe-notion search "Project Roadmap" --filter page

# 3. Get page content (blocks)
vibe-notion block children <page-id>

# 4. Create a new page in a database
vibe-notion page create --parent <database-id> --title "New Task" --database
```

## Example Usage

### Databases

```bash
# List all databases
vibe-notion database list

# Query a database with a filter
vibe-notion database query <database-id> --filter '{"property": "Status", "select": {"equals": "In Progress"}}'
```

### Blocks

```bash
# Append a paragraph to a page
vibe-notion block append <page-id> --content '[{"type": "paragraph", "paragraph": {"rich_text": [{"type": "text", "text": {"content": "Hello Notion!"}}]}}]'
```

### Comments

```bash
# List comments on a page
vibe-notion comment list --page <page-id>

# Add a comment
vibe-notion comment create --page <page-id> "This looks great!"
```

## More Information

- [GitHub Repository](https://github.com/devxoul/vibe-notion)
- [Skill Documentation](https://github.com/devxoul/vibe-notion/blob/main/skills/vibe-notion/SKILL.md)
