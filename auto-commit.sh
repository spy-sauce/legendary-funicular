#!/bin/bash
# Mycelium Framework — stream-tagged commit script
# Usage: ./auto-commit.sh "DOMAIN" "message"
# Example: ./auto-commit.sh "ADAPTER" "ClaudeCodeAgent + PetriDishCoordinator"

STREAM="MF"
DOMAIN=$1
MESSAGE=$2

if [ -z "$DOMAIN" ] || [ -z "$MESSAGE" ]; then
  echo "Usage: ./auto-commit.sh DOMAIN message"
  echo "Example: ./auto-commit.sh ADAPTER 'ClaudeCodeAgent cellular execution'"
  exit 1
fi

git add .
git commit -m "$STREAM/$DOMAIN: $MESSAGE"
git push

echo ""
echo "✓ Committed: $STREAM/$DOMAIN: $MESSAGE"
