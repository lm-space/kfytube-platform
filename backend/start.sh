#!/bin/bash

# Port to run on
PORT=8787
URL="http://localhost:$PORT"
ADMIN_URL="$URL/admin"

echo "🛑 Stopping any existing processes on port $PORT..."
lsof -ti:$PORT | xargs kill -9 2>/dev/null

echo "🚀 Starting KfyTube local server..."
# Start wrangler in the background and save PID
# CD into the directory so wrangler can find wrangler.json
cd "$(dirname "$0")"
npx wrangler dev --port $PORT &
WRANGLER_PID=$!

# Function to handle script exit
cleanup() {
    echo ""
    echo "👋 Shutting down KfyTube server..."
    kill $WRANGLER_PID 2>/dev/null
    exit
}

# Trap Ctrl+C (SIGINT) to run cleanup
trap cleanup SIGINT

echo "⏳ Waiting for server to initialize..."
sleep 4

echo "🌐 Opening KeyTube in browser..."
open "$URL"
open "$ADMIN_URL"

echo "✅ Server is running. Press Ctrl+C to stop."
# Wait for the background process to finish (which it won't unless killed)
wait $WRANGLER_PID
