#!/bin/bash
# Script to deploy frontend to Netlify

# Check if Netlify CLI is installed
if ! command -v netlify &> /dev/null
then
    echo "Netlify CLI not found. Installing..."
    npm install -g netlify-cli
fi

echo "📦 Preparing for Netlify deployment..."

# Copy Netlify-specific Next.js config
cp next.config.netlify.mjs next.config.mjs

echo "📦 Building frontend for Netlify deployment..."
NEXT_PUBLIC_SERVER_URL="https://file-sharing-app-23eq.onrender.com" npm run build:frontend

echo "🚀 Deploying to Netlify..."
netlify deploy --prod

echo "✅ Deployment completed!"
echo "Remember that your backend is hosted at: https://file-sharing-app-23eq.onrender.com"
echo "Make sure your frontend is correctly configured to use this backend URL."

# Restore original Next.js config if needed
if [ -f next.config.mjs.bak ]; then
  mv next.config.mjs.bak next.config.mjs
  echo "Restored original Next.js config."
fi 