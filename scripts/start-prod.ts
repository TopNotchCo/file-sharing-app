#!/usr/bin/env node

import path from 'path';
import { getLocalIpAddress } from '../lib/network-utils';

// Get the local IP address
const localIp = getLocalIpAddress();
console.log(`\n🌐 Server IP: ${localIp}\n`);

// Set environment variables
process.env.HOST_IP = localIp;
process.env.PORT = process.env.PORT || '3005';
process.env.BIND_ALL = 'true';

// Make these available to the Next.js app as well
process.env.NEXT_PUBLIC_HOST_IP = localIp;
process.env.NEXT_PUBLIC_LAN_SERVER_PORT = process.env.PORT || '3005';
process.env.NEXT_PUBLIC_SERVER_URL = process.env.RENDER_EXTERNAL_URL || `http://${localIp}:${process.env.PORT || '3005'}`;

// Start the LAN server directly rather than spawning a child process
const serverPath = path.join(__dirname, '../server/lan-server.js');

console.log('🚀 Starting LAN server in production mode...');
console.log(`Server path: ${serverPath}`);

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
- WebSocket URL: ws://${localIp}:${process.env.PORT || '3005'}
- HTTP Status: http://${localIp}:${process.env.PORT || '3005'}/status
  
Environment Variables:
- HOST_IP=${localIp}
- PORT=${process.env.PORT || '3005'}
- BIND_ALL=true
- NEXT_PUBLIC_HOST_IP=${localIp}
- NEXT_PUBLIC_LAN_SERVER_PORT=${process.env.PORT || '3005'}
- NEXT_PUBLIC_SERVER_URL=${process.env.RENDER_EXTERNAL_URL || `http://${localIp}:${process.env.PORT || '3005'}`}

==============================================
`);
} catch (error) {
  console.error('Failed to start LAN server:', error);
  process.exit(1);
} 