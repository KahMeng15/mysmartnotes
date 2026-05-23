#!/bin/bash

# MySmartNotes Local Development Script
# This starts both the API and the Worker in parallel.

# 1. Ensure logs directory exists
mkdir -p logs

# 2. Start the Background Worker in the background
echo "Starting Background Worker..."
python3 -m app.worker_main > logs/worker_stdout.log 2>&1 &
WORKER_PID=$!

# 3. Start the API Server
echo "Starting API Server on http://localhost:8000..."
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Cleanup on exit
trap "kill $WORKER_PID; exit" SIGINT SIGTERM
