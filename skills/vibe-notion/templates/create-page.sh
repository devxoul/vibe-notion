#!/bin/bash
# Create a page and append a heading and paragraph

if [ -z "$2" ]; then
  echo "Usage: $0 <parent_id> <title>"
  exit 1
fi

PARENT_ID=$1
TITLE=$2

echo "Creating page: $TITLE"
# Create page and extract ID
# Note: Requires 'jq' to be installed for ID extraction
RESPONSE=$(vibe-notion page create --parent "$PARENT_ID" --title "$TITLE")
PAGE_ID=$(echo $RESPONSE | jq -r '.id')

if [ "$PAGE_ID" == "null" ] || [ -z "$PAGE_ID" ]; then
  echo "Failed to create page"
  echo $RESPONSE
  exit 1
fi

echo "Page created with ID: $PAGE_ID"

# Append content
echo "Appending content blocks..."
vibe-notion block append "$PAGE_ID" --content '[
  {
    "type": "heading_2",
    "heading_2": {
      "rich_text": [{ "type": "text", "text": { "content": "Welcome to your new page" } }]
    }
  },
  {
    "type": "paragraph",
    "paragraph": {
      "rich_text": [{ "type": "text", "text": { "content": "This page was created automatically using the Vibe Notion CLI." } }]
    }
  }
]' --pretty
