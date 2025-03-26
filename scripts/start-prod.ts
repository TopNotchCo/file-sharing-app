#!/usr/bin/env node

import path from 'path';
import { getLocalIpAddress } from '../lib/network-utils';

// Get the local IP address
const localIp = getLocalIpAddress();
console.log(`\n🌐 Server IP: ${localIp}\n`);

// Determine port from environment variable
const port = process.env.PORT || '3005';

// Set environment variables
process.env.HOST_IP = localIp;
process.env.PORT = port;
process.env.BIND_ALL = 'true';

// For production on Render, we need to use the assigned port
// and the external URL should already have proper https:// protocol
const renderExternalUrl = process.env.RENDER_EXTERNAL_URL;

// Make these available to the Next.js app as well
process.env.NEXT_PUBLIC_HOST_IP = localIp;
process.env.NEXT_PUBLIC_LAN_SERVER_PORT = port;

// In production, the WebSocket should use the same protocol (ws/wss) as the site
if (renderExternalUrl) {
  console.log(`Detected Render external URL: ${renderExternalUrl}`);
  process.env.NEXT_PUBLIC_SERVER_URL = renderExternalUrl;
} else {
  process.env.NEXT_PUBLIC_SERVER_URL = `http://${localIp}:${port}`;
}

// Start the LAN server directly rather than spawning a child process
const serverPath = path.join(__dirname, '../server/lan-server.js');

console.log('🚀 Starting LAN server in production mode...');
console.log(`Server path: ${serverPath}`);
console.log(`Listening on port: ${port}`);

try {
  // Dynamic import of the server to avoid circular dependencies
  import(serverPath).catch(err => {
    console.error('Failed to start LAN server:', err);
    process.exit(1);
  });
  
  console.log(`
==============================================
🚀 LAN SERVER STARTED IN PRODUCTION MODE
==============================================

Server Information:
- Port: ${port}
- External URL: ${process.env.NEXT_PUBLIC_SERVER_URL}
- WebSocket URL: ${process.env.NEXT_PUBLIC_SERVER_URL.replace('http', 'ws')}

Environment Variables:
- HOST_IP=${localIp}
- PORT=${port}
- BIND_ALL=true
- NEXT_PUBLIC_HOST_IP=${localIp}
- NEXT_PUBLIC_LAN_SERVER_PORT=${port}
- NEXT_PUBLIC_SERVER_URL=${process.env.NEXT_PUBLIC_SERVER_URL}

==============================================
`);
} catch (error) {
  console.error('Failed to start LAN server:', error);
  process.exit(1);
} 