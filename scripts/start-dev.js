#!/usr/bin/env node

import { spawn } from 'child_process';
import { networkInterfaces } from 'os';

// Utility to get local IP address
function getLocalIpAddress() {
  const nets = networkInterfaces();
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  
  return '127.0.0.1'; // Fallback to localhost
}

// Get the local IP address
const localIp = getLocalIpAddress();
console.log(`\n🌐 Local network IP: ${localIp}\n`);

// Set environment variables
process.env.HOST_IP = localIp;

// Start the LAN server
console.log('🚀 Starting LAN server...');
const lanServer = spawn('npm', ['run', 'lan-server'], {
  stdio: 'pipe',
  shell: true,
  env: {
    ...process.env,
  }
});

lanServer.stdout.on('data', (data) => {
  const output = data.toString().trim();
  console.log(`[LAN Server] ${output}`);
});

lanServer.stderr.on('data', (data) => {
  const output = data.toString().trim();
  console.error(`[LAN Server Error] ${output}`);
});

// Start Next.js development server
console.log('🚀 Starting Next.js development server...');
const nextServer = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true, 
  env: {
    ...process.env,
  }
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down servers...');
  lanServer.kill('SIGINT');
  nextServer.kill('SIGINT');
  process.exit(0);
});

console.log(`
🔗 Application URLs:
   - Local:            http://localhost:3000
   - On Your Network:  http://${localIp}:3000
   - LAN Server:       http://${localIp}:3005

📱 Access from other devices using http://${localIp}:3000
⚡ LAN server is available at ws://${localIp}:3005

Press Ctrl+C to stop all servers
`); 