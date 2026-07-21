#!/bin/sh
set -e

# Map LEARNING_DATABASE_URL -> DATABASE_URL if DATABASE_URL is not already set
if [ -z "$DATABASE_URL" ] && [ -n "$LEARNING_DATABASE_URL" ]; then
  export DATABASE_URL="$LEARNING_DATABASE_URL"
fi

# Prevent git from hanging waiting for credentials
export GIT_TERMINAL_PROMPT=0

# Clone curriculum repo (non-fatal if it fails)
if [ -n "$GITHUB_TOKEN" ] && [ ! -d "/app/curriculum/.git" ]; then
  git clone "https://${GITHUB_TOKEN}@github.com/GrahVani/curriculum.git" /app/curriculum 2>/dev/null || true
fi

# Start the application
exec node dist/main.js
