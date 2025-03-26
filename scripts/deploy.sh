#!/bin/bash
# Simple script to commit and push changes for redeployment

echo "📦 Committing changes for deployment..."

# Add all changes
git add .

# Commit with timestamp
git commit -m "Deploy: update with WebSocket fixes - $(date)"

# Push to remote
echo "🚀 Pushing changes to trigger Render deployment..."
git push

echo "✅ Changes pushed! Render deployment should start automatically."
echo "⏱️  It may take a few minutes for changes to propagate."
echo "📊 You can check deployment status on your Render dashboard." 