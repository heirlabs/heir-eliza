#!/bin/bash
# Start ElizaOS from alpha-ton with custom characters

cd /home/ubuntu/alpha-ton

# Use bun to run the global elizaos CLI with local config
exec /home/ubuntu/.bun/bin/bun /home/ubuntu/.bun/install/global/node_modules/@elizaos/cli/dist/index.js start \
  -p 3002 \
  --character /home/ubuntu/altx-terminal/src/server/characters/complianceCharacter.json \
  --character /home/ubuntu/altx-terminal/src/server/characters/analystCharacter.json \
  "$@"
