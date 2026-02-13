# Common Patterns for Agent Notion

This document outlines common workflows and patterns for interacting with Notion via the CLI.

## 1. Reading Page Content Recursively

To get the full content of a page, you need to retrieve the page object and then its child blocks. If those blocks have children (e.g., nested lists, columns), you may need to fetch those recursively.

```bash
# 1. Get page metadata
agent-notion page get <page_id> --workspace-id <workspace_id>

# 2. List direct children
agent-notion block children <page_id> --workspace-id <workspace_id>

# 3. For any block that has "has_children: true", fetch its children
agent-notion block children <block_id> --workspace-id <workspace_id>
```

## 2. Querying a Database and Processing Results

Querying a database returns a list of page objects. You can filter and sort these results.

```bash
# Find all "Active" projects sorted by "Deadline"
agent-notion database query <database_id> --workspace-id <workspace_id> \
  --filter '{"property": "Status", "status": {"equals": "Active"}}' \
  --sort '[{"property": "Deadline", "direction": "ascending"}]'
```

## 3. Creating a Page with Initial Content

Creating a page only sets the properties (like Title). To add content, you must append blocks to the newly created page.

```bash
# 1. Create the page and capture the ID
PAGE_ID=$(agent-notion page create --workspace-id <workspace_id> --parent <parent_id> --title "New Document" | jq -r '.id')

# 2. Append content blocks
agent-notion block append $PAGE_ID --workspace-id <workspace_id> --content '[
  {
    "type": "heading_1",
    "heading_1": { "rich_text": [{ "type": "text", "text": { "content": "Introduction" } }] }
  },
  {
    "type": "paragraph",
    "paragraph": { "rich_text": [{ "type": "text", "text": { "content": "This is a new page created via CLI." } }] }
  }
]'
```

## 4. Updating Multiple Properties

You can update multiple properties at once using the `--set` flag.

```bash
agent-notion page update <page_id> --workspace-id <workspace_id> \
  --set "Status=Done" \
  --set "Complete=true" \
  --set "Assignee=user_id"
```

## 5. Searching for Specific Content

Search is the best way to find objects when you don't have their IDs.

```bash
# Search for databases only
agent-notion search "Inventory" --workspace-id <workspace_id> --filter database

# Search for pages modified recently
agent-notion search "Meeting Notes" --workspace-id <workspace_id> --filter page --sort desc
```

## 6. Handling Pagination

Many list and query commands support pagination.

```bash
# Get the first 10 results
agent-notion database query <database_id> --workspace-id <workspace_id> --page-size 10

# Get the next page using the start-cursor from the previous response
agent-notion database query <database_id> --workspace-id <workspace_id> --start-cursor "previous_next_cursor"
```
