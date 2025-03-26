# Deploying to Netlify with Render Backend

This document explains how to set up a split deployment with:
- Frontend hosted on Netlify
- Backend WebSocket server hosted on Render.com

## Prerequisites

- Netlify account
- Render.com account
- Your backend server already deployed on Render.com

## Setup Instructions

### 1. Backend (Render.com)

Your backend WebSocket server should already be deployed on Render.com at:
```
https://file-sharing-app-23eq.onrender.com
```

Ensure your Render deployment:
- Has the correct environment variables set up
- Is using the WebSocket server configuration
- Is accessible via both HTTPS and WSS protocols

### 2. Frontend (Netlify)

#### Initial Setup

1. Install the Netlify CLI if you haven't already:
   ```bash
   npm install -g netlify-cli
   ```

2. Log in to your Netlify account:
   ```bash
   netlify login
   ```

3. Initialize your Netlify site (only needed once):
   ```bash
   netlify init
   ```

#### Environment Variables

Ensure the following environment variables are set in your Netlify site settings:

- `NEXT_PUBLIC_SERVER_URL` = `https://file-sharing-app-23eq.onrender.com`

You can set these in the Netlify UI under Site settings → Build & deploy → Environment variables.

#### Deploying

Run the deployment script:
```bash
./scripts/deploy-netlify.sh
```

This script will:
1. Use the Netlify-specific Next.js configuration
2. Build the frontend for static deployment
3. Deploy the build to Netlify

## Troubleshooting

### WebSocket Connection Issues

If you're experiencing WebSocket connection problems:

1. Check your browser console for errors
2. Verify the WebSocket URL is using `wss://` (secure) for HTTPS sites
3. Confirm CORS is properly configured on your Render backend
4. Check Render logs for any connection errors

### Build Failures

If your Netlify build fails:

1. Check build logs in the Netlify dashboard
2. Verify all required environment variables are set
3. Ensure the build command is configured correctly to use the static export configuration

## Updating the Configuration

If your Render backend URL changes, update it in:

1. `.env.production` file
2. Netlify environment variables
3. The WebSocket URL fallback in `hooks/use-lan-discovery.ts` 