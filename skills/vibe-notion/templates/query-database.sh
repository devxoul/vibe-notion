#!/bin/bash
# Query a database and list the titles of the results

if [ -z "$1" ]; then
  echo "Usage: $0 <database_id>"
  exit 1
fi

DATABASE_ID=$1

# Query the database
# Note: This assumes results have a 'properties.Name.title' field which is common
vibe-notion database query "$DATABASE_ID" --pretty
