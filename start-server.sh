#!/bin/bash
cd "$(dirname "$0")"
echo "Starting dweb-server..."
setsid node tools/dweb-server.cjs &>/dev/null < /dev/null &
sleep 2
echo "✓ dweb-server running at:"
echo "  http://127.0.0.1:49737  (localhost)"
echo "  http://172.28.195.75:49737  (network)"
