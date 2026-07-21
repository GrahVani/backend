#!/bin/sh
set -e

# Map ADMIN_DATABASE_URL -> DATABASE_URL if DATABASE_URL is not already set
if [ -z "$DATABASE_URL" ] && [ -n "$ADMIN_DATABASE_URL" ]; then
  export DATABASE_URL="$ADMIN_DATABASE_URL"
fi

# Start the application
exec node dist/main.js
