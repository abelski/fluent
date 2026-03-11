#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== Stopping old server ==="
pkill -f "uvicorn main:app" 2>/dev/null || true
sleep 1

echo "=== Building frontend ==="
cd "$ROOT/frontend"
npm run build

echo "=== Starting api ==="
cd "$ROOT/api"
source .venv/bin/activate
exec uvicorn main:app --reload --port 8000
