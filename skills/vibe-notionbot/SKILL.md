---
name: vibe-notionbot
description: Interact with Notion workspaces using official API - manage pages, databases, blocks, users, and comments
version: 1.11.2
allowed-tools: Bash(vibe-notionbot:*)
metadata:
  openclaw:
    requires:
      bins:
        - vibe-notionbot
    install:
      - kind: node
        package: vibe-notion
        bins: [vibe-notionbot]
---

# Vibe Notionbot

A TypeScript CLI tool that enables AI agents and humans to interact with Notion workspaces through the official Notion API. Supports pages, databases, blocks, users, comments, and search.


## Which CLI to Use

This package ships two CLIs. Pick the right one based on your situation:

| | `vibe-notion` | `vibe-notionbot` (this CLI) |
|---|---|---|
| API | Unofficial private API | Official Notion API |
| Auth | `token_v2` auto-extracted from Notion desktop app | `NOTION_TOKEN` env var (Integration token) |
| Identity | Acts as the user | Acts as a bot |
| Setup | Zero — credentials extracted automatically | Manual — create Integration at notion.so/my-integrations |
| Database rows | `add-row`, `update-row` | Create via `page create --database` |
| View management | `view-get`, `view-update`, `view-list`, `view-add`, `view-delete` | Not supported |
| Workspace listing | Supported | Not supported |
| Stability | Private API — may break on Notion changes | Official versioned API — stable |

**Decision flow:**

1. If the Notion desktop app is installed → use `vibe-notion`
2. If `NOTION_TOKEN` is set but no desktop app → use `vibe-notionbot` (this CLI)
3. If both are available → prefer `vibe-notion` (broader capabilities, zero setup)
4. If neither → ask the user to set up one of the two

## Important: CLI Only

**Never call the Notion API directly.** Always use the `vibe-notionbot` CLI commands described in this skill. Do not make raw HTTP requests to the Notion API or use `@notionhq/client` directly. Direct API calls risk exposing credentials and may trigger Notion's abuse detection, getting the user's account blocked.

If a feature you need is not supported by `vibe-notionbot`, let the user know and offer to file a feature request at [devxoul/vibe-notion](https://github.com/devxoul/vibe-notion/issues) on their behalf. Before submitting, strip out any real user data — IDs, names, emails, tokens, page content, or anything else that could identify the user or their workspace. Use generic placeholders instead and keep the issue focused on describing the missing capability.

## Important: Never Write Scripts

**Never write scripts (Python, TypeScript, Bash, etc.) to automate Notion operations.** The `batch` command already handles bulk operations of any size. Writing a script to loop through API calls is always wrong — use `batch` with `--file` instead.

This applies even when:
- You need to create 100+ rows or pages
- You need cross-references between newly created items (use multi-pass batch — see [Bulk Operations Strategy](#bulk-operations-strategy))
- The operation feels "too big" for a single command

If you catch yourself thinking "I should write a script for this," stop and use `batch`.

## Quick Start

```bash
# Check authentication status
vibe-notionbot auth status

# Search for a page or database
vibe-notionbot search "Project Roadmap"

# List all databases
vibe-notionbot database list

# Create a new page
vibe-notionbot page create --parent <parent_id> --title "My New Page"
```

## Authentication

### Integration Token (Official API)

Set the `NOTION_TOKEN` environment variable with your integration token from the [Notion Developer Portal](https://www.notion.so/my-integrations).

```bash
export NOTION_TOKEN=secret_xxx
vibe-notionbot auth status
```

The integration token provides access to the official Notion API (`@notionhq/client`).

## Commands

### Page Commands

```bash
# Retrieve a page
vibe-notionbot page get <page_id>

# Create a new page under a parent page or database
vibe-notionbot page create --parent <parent_id> --title "New Page Title"
vibe-notionbot page create --parent <database_id> --title "New Database Item" --database

# Create a page with markdown content
vibe-notionbot page create --parent <parent_id> --title "My Doc" --markdown '# Hello\n\nThis is **bold** text.'

# Create a page with markdown from a file
vibe-notionbot page create --parent <parent_id> --title "My Doc" --markdown-file ./content.md

# Create a page with markdown containing local images (auto-uploaded to Notion)
vibe-notionbot page create --parent <parent_id> --title "My Doc" --markdown-file ./doc-with-images.md

# Update page properties
vibe-notionbot page update <page_id> --set "Status=In Progress" --set "Priority=High"

# Replace all content on a page with new markdown
vibe-notionbot page update <page_id> --replace-content --markdown '# New Content'
vibe-notionbot page update <page_id> --replace-content --markdown-file ./updated.md

# Archive (delete) a page
vibe-notionbot page archive <page_id>

# Retrieve a specific page property
vibe-notionbot page property <page_id> <property_id>
```

### Database Commands

```bash
# Retrieve a database schema
vibe-notionbot database get <database_id>

# Query a database with optional filters and sorts
vibe-notionbot database query <database_id> --filter '{"property": "Status", "select": {"equals": "In Progress"}}'
vibe-notionbot database query <database_id> --sort '[{"property": "Created time", "direction": "descending"}]'
vibe-notionbot database query <database_id> --page-size 10 --start-cursor <cursor>

# Create a database under a parent page
vibe-notionbot database create --parent <page_id> --title "My Database" --properties '{"Name": {"title": {}}}'

# Update a database schema or title
vibe-notionbot database update <database_id> --title "Updated Title"
vibe-notionbot database update <database_id> --properties '{"Status": {"select": {"options": [{"name": "Active"}, {"name": "Archived"}]}}}'
vibe-notionbot database update <database_id> --title "Updated Title" --properties '{"Status": {"select": {}}}'

# Delete a property from a database
vibe-notionbot database delete-property <database_id> --property "Status"

# List all databases accessible by the integration
vibe-notionbot database list
vibe-notionbot database list --page-size 10 --start-cursor <cursor>
```

### Block Commands

```bash
# Retrieve a block
vibe-notionbot block get <block_id>

# List direct children of a block (paginated)
vibe-notionbot block children <block_id>
vibe-notionbot block children <block_id> --page-size 50 --start-cursor <cursor>

# Append child blocks to a parent
vibe-notionbot block append <parent_id> --content '[{"type": "paragraph", "paragraph": {"rich_text": [{"type": "text", "text": {"content": "Hello World"}}]}}]'

# Append markdown content as blocks
vibe-notionbot block append <parent_id> --markdown '# Hello\n\nThis is **bold** text.'

# Append markdown from a file
vibe-notionbot block append <parent_id> --markdown-file ./content.md

# Append markdown with local images (auto-uploaded to Notion)
vibe-notionbot block append <parent_id> --markdown-file ./doc-with-images.md

# Append nested markdown (indented lists become nested children blocks)
vibe-notionbot block append <parent_id> --markdown '- Parent item\n  - Child item\n    - Grandchild item'

# Append blocks after a specific block (positional insertion)
vibe-notionbot block append <parent_id> --after <block_id> --markdown '# Inserted after specific block'
vibe-notionbot block append <parent_id> --after <block_id> --content '[{"type": "paragraph", "paragraph": {"rich_text": [{"type": "text", "text": {"content": "Inserted after"}}]}}]'

# Append blocks before a specific block
vibe-notionbot block append <parent_id> --before <block_id> --markdown '# Inserted before specific block'

# Update a block's content
vibe-notionbot block update <block_id> --content '{"paragraph": {"rich_text": [{"type": "text", "text": {"content": "Updated content"}}]}}'

# Delete (archive) a block
vibe-notionbot block delete <block_id>

# Upload a file as a block (image or file block)
vibe-notionbot block upload <parent_id> --file ./image.png --pretty
vibe-notionbot block upload <parent_id> --file ./document.pdf --pretty
vibe-notionbot block upload <parent_id> --file ./image.png --after <block_id> --pretty
vibe-notionbot block upload <parent_id> --file ./image.png --before <block_id> --pretty
```

### User Commands

```bash
# List all users in the workspace
vibe-notionbot user list
vibe-notionbot user list --page-size 10 --start-cursor <cursor>

# Get info for a specific user
vibe-notionbot user get <user_id>

# Get info for the current bot/integration
vibe-notionbot user me
```

### Search Commands

```bash
# Search across the entire workspace
vibe-notionbot search "query text"

# Filter search by object type
vibe-notionbot search "Project" --filter page
vibe-notionbot search "Tasks" --filter database

# Sort search results
vibe-notionbot search "Meeting" --sort desc

# Paginate search results
vibe-notionbot search "Notes" --page-size 10 --start-cursor <cursor>
```

### Comment Commands

```bash
# List comments on a page
vibe-notionbot comment list --page <page_id>
vibe-notionbot comment list --page <page_id> --page-size 10 --start-cursor <cursor>

# List inline comments on a specific block
vibe-notionbot comment list --block <block_id>

# Create a comment on a page
vibe-notionbot comment create "This is a comment" --page <page_id>

# Reply to a comment thread (discussion)
vibe-notionbot comment create "Replying to thread" --discussion <discussion_id>

# Retrieve a specific comment
vibe-notionbot comment get <comment_id>
```

## Batch Operations

Run multiple write operations in a single CLI call. Use this instead of calling the CLI repeatedly when you need to create, update, or delete multiple things at once. Saves tokens and reduces round-trips.

```bash
# Inline JSON (no --workspace-id needed, uses NOTION_TOKEN)
vibe-notionbot batch '<operations_json>'

# From file (for large payloads)
vibe-notionbot batch --file ./operations.json '[]'
```

**Supported actions** (11 total):

| Action | Description |
|--------|-------------|
| `page.create` | Create a page |
| `page.update` | Update page properties |
| `page.archive` | Archive a page |
| `block.append` | Append blocks to a parent |
| `block.update` | Update a block |
| `block.delete` | Delete a block |
| `comment.create` | Create a comment |
| `database.create` | Create a database |
| `database.update` | Update database title or schema |
| `database.delete-property` | Delete a database property |
| `block.upload` | Upload a file as an image or file block |

**Operation format**: Each operation is an object with `action` plus the same fields you'd pass to the individual command handler. Example with mixed actions:

```json
[
  {"action": "page.create", "parent": "<parent_id>", "title": "Meeting Notes"},
  {"action": "block.append", "parent_id": "<page_id>", "markdown": "# Agenda\n\n- Item 1\n- Item 2"},
  {"action": "comment.create", "content": "Page created via batch", "page": "<page_id>"}
]
```

**Output format**:

```json
{
  "results": [
    {"index": 0, "action": "page.create", "success": true, "data": {"id": "page-uuid", "...": "..."}},
    {"index": 1, "action": "block.append", "success": true, "data": {"...": "..."}},
    {"index": 2, "action": "comment.create", "success": true, "data": {"id": "comment-uuid", "...": "..."}}
  ],
  "total": 3,
  "succeeded": 3,
  "failed": 0
}
```

**Fail-fast behavior**: Operations run sequentially. If any operation fails, execution stops immediately. The output will contain results for all completed operations plus the failed one. The process exits with code 1 on failure, 0 on success.

```json
{
  "results": [
    {"index": 0, "action": "page.create", "success": true, "data": {"...": "..."}},
    {"index": 1, "action": "block.append", "success": false, "error": "Block not found"}
  ],
  "total": 3,
  "succeeded": 1,
  "failed": 1
}
```

### Bulk Operations Strategy

For large operations (tens or hundreds of items), use `--file` to avoid shell argument limits and keep things manageable.

**Step 1**: Write the operations JSON to a file, then run batch with `--file`:

```bash
# Write operations to a file (using your Write tool), then:
vibe-notionbot batch --file ./operations.json '[]'
```

**Multi-pass pattern** — when new items need to reference each other (e.g., a page property linking to another newly created page):

1. **Pass 1 — Create all items** (without cross-references): Write a batch JSON file with all create operations, omitting properties that point to other new items. Run it. Collect the returned IDs from the output.
2. **Pass 2 — Set cross-references**: Write a second batch JSON file with update operations that set the referencing properties using the IDs from Pass 1. Run it.

```
Pass 1: Create items A, B, C (no cross-refs) → get IDs for A, B, C
Pass 2: Update A.related=B, C.parent_ref=A (using real IDs from Pass 1)
```

This is the same result as a script, but without writing any code. Just two batch calls.

### Rate Limits

Notion enforces rate limits on its API. Batch operations run sequentially, so a large batch (30+ operations) can trigger **429 Too Many Requests** errors. To avoid this:

 **Split large batches into chunks of ~25-30 operations** per batch call
 If a batch fails mid-way with a 429, re-run with only the remaining (unprocessed) operations
 The `batch` output shows which operations succeeded before the failure — use the `index` field to determine where to resume

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
vibe-notionbot search "Project" --pretty
```

## Error Handling

Common errors from the Notion API:
- `object_not_found`: The ID is incorrect or the integration doesn't have access.
- `unauthorized`: The `NOTION_TOKEN` is invalid.
- `rate_limited`: Too many requests.

## Troubleshooting

### `vibe-notionbot: command not found`

The `vibe-notion` package is not installed. Run it directly using a package runner. Ask the user which one to use:

```bash
npx -y -p vibe-notion vibe-notionbot ...
bunx -p vibe-notion vibe-notionbot ...
pnpm dlx --package vibe-notion vibe-notionbot ...
```

If you already know the user's preferred package runner, use it directly instead of asking.

## Limitations

- Supports Notion API version 2025-09-03.
- Does not support OAuth (token only).
- File uploads are supported via `block upload`.
- Page property updates are limited to simple key=value pairs via `--set`.
