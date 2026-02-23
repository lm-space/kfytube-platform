#!/bin/bash
cd "$(dirname "$0")"

# Stop any existing processes on 8787 or 5173
echo "🛑 Stopping existing processes..."
lsof -ti:8787 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null

echo "🚀 Starting KfyTube Monorepo..."
npm start
