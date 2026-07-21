#!/bin/sh

# Map ADMIN_DATABASE_URL -> DATABASE_URL if DATABASE_URL is not already set
if [ -z "$DATABASE_URL" ] && [ -n "$ADMIN_DATABASE_URL" ]; then
  export DATABASE_URL="$ADMIN_DATABASE_URL"
fi

# Try to start and capture errors
node dist/main.js 2>&1 || {
  echo "=== NODE CRASHED ==="
  echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"
  echo "ADMIN_DATABASE_URL set: $([ -n "$ADMIN_DATABASE_URL" ] && echo YES || echo NO)"
  echo "=== Keeping container alive for log retrieval ==="
  sleep 3600
}
