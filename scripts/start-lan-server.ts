import { exec } from 'child_process';
import path from 'path';
import { getLocalIpAddress } from '../lib/network-utils';
import { networkInterfaces } from 'os';

// Start the LAN discovery server
console.log('Starting LAN discovery server...');

// Get the local IP address
const localIp = getLocalIpAddress();
console.log(`Local network IP detected: ${localIp}`);

// Print network interface information for debugging
console.log('Available network interfaces:');
const interfaces = networkInterfaces();
Object.keys(interfaces).forEach(iface => {
  console.log(`Interface: ${iface}`);
  (interfaces[iface] || []).forEach(details => {
    if (details.family === 'IPv4') {
      console.log(`  - ${details.address} (${details.internal ? 'internal' : 'external'})`);
    }
  });
});

// Set environment variables for the server
process.env.HOST_IP = localIp;
process.env.PORT = '3005';
process.env.BIND_ALL = 'true';

// Make these available to the Next.js app as well
process.env.NEXT_PUBLIC_HOST_IP = localIp;
process.env.NEXT_PUBLIC_LAN_SERVER_PORT = '3005';

const serverPath = path.join(__dirname, '../server/lan-server.ts');
const tsx = path.join(__dirname, '../node_modules/.bin/tsx');

// Start the server with increased verbosity for debugging
const command = `${tsx} ${serverPath}`;
console.log(`Executing: ${command}`);

const child = exec(command, (error) => {
  if (error) {
    console.error('Failed to start LAN server:', error);
    process.exit(1);
  }
});

child.stdout?.on('data', (data) => {
  console.log(`[LAN Server] ${data.toString().trim()}`);
});

child.stderr?.on('data', (data) => {
  console.error(`[LAN Server Error] ${data.toString().trim()}`);
});

process.on('SIGINT', () => {
  console.log('Shutting down LAN server...');
  child.kill('SIGINT');
  process.exit(0);
});

// Print a more comprehensive status message
console.log(`
==============================================
🚀 LAN SERVER STARTED
==============================================

Server Information:
- WebSocket URL: ws://${localIp}:3005
- HTTP Status: http://${localIp}:3005/status
- Test page: http://${localIp}:3005

To use from your mobile device:
1. Connect your device to the same WiFi network
2. Open a web browser on your mobile device 
3. Navigate to: http://${localIp}:3000
4. If using Firefox on mobile and seeing connection issues:
   a. Try Chrome or Safari
   b. Check that both devices are on the same network
   c. Ensure no firewall is blocking connections

Environment Variables Set:
- HOST_IP=${localIp}
- PORT=3005
- BIND_ALL=true
- NEXT_PUBLIC_HOST_IP=${localIp}
- NEXT_PUBLIC_LAN_SERVER_PORT=3005

Press Ctrl+C to stop the server.
==============================================
`); 