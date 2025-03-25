import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import express from 'express';
import { networkInterfaces } from 'os';
import { getIp, getLocalIpAddress } from '../lib/network-utils';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ 
  server,
  // Set explicit WebSocket server options
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    threshold: 1024 // Only compress messages larger than 1KB
  }
});

interface LANPeer {
  id: string;
  name: string;
  peerId: string;
  lastSeen: number;
  ip: string; // Store the client's IP
  ws: WebSocket;
}

interface PeerMessage {
  type: string;
  userId: string;
  userName?: string;
  peerId?: string;
  message?: {
    type: string;
    data: Record<string, unknown>;
    recipient?: string;
  };
}

// Use a single global room for all LAN peers
const globalRoom = new Set<LANPeer>();
const PEER_TIMEOUT = 30000; // 30 seconds

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Add a debug middleware
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url} from ${req.ip}`);
  next();
});

// Connection counter for debugging
let connectionCounter = 0;

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  connectionCounter++;
  console.log(`[WS] New connection #${connectionCounter} from ${req.socket.remoteAddress}`);
  
  const ip = getIp(req);
  if (!ip) {
    console.log('[WS] No IP detected, closing connection');
    return ws.close();
  }

  console.log(`[WS] Connection #${connectionCounter} from IP: ${ip}`);
  
  let currentPeer: LANPeer | null = null;

  const heartbeat = () => {
    if (currentPeer) {
      currentPeer.lastSeen = Date.now();
    }
  };

  const interval = setInterval(() => {
    const now = Date.now();
    globalRoom.forEach(peer => {
      if (now - peer.lastSeen > PEER_TIMEOUT) {
        console.log(`[WS] Peer ${peer.name} (${peer.id}) from ${peer.ip} timed out, removing`);
        globalRoom.delete(peer);
      }
    });
    broadcastPeers();
  }, 5000);

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString()) as PeerMessage;
      console.log(`[WS] Message from ${ip}: ${message.type}`);
      
      switch (message.type) {
        case 'JOIN':
          console.log(`[WS] User ${message.userName || 'Unknown'} (${message.userId}) joining from ${ip}`);
          
          // Check if user already exists (reconnecting)
          for (const peer of globalRoom) {
            if (peer.id === message.userId) {
              console.log(`[WS] User ${message.userId} already exists, removing old connection`);
              globalRoom.delete(peer);
              break;
            }
          }
          
          currentPeer = {
            id: message.userId,
            name: message.userName || 'Anonymous',
            peerId: message.peerId || '',
            lastSeen: Date.now(),
            ip,
            ws
          };
          globalRoom.add(currentPeer);
          broadcastPeers();
          break;
        
        case 'HEARTBEAT':
          heartbeat();
          break;
          
        case 'MESSAGE':
          console.log(`[WS] Relaying message from ${message.userId}: ${message.message?.type}`);
          console.log('[WS] Full message payload:', JSON.stringify(message.message, null, 2));
          
          // If the message has a specific recipient
          if (message.message?.recipient) {
            let recipientFound = false;
            
            // Find the recipient peer
            for (const peer of globalRoom) {
              if (peer.peerId === message.message.recipient) {
                recipientFound = true;
                
                // Forward the message only to the intended recipient
                if (peer.ws.readyState === WebSocket.OPEN) {
                  try {
                    peer.ws.send(JSON.stringify(message));
                    console.log(`[WS] Message forwarded to recipient ${peer.name} (${peer.peerId})`);
                  } catch (error) {
                    console.error(`[WS] Error forwarding message to ${peer.name}:`, error);
                  }
                } else {
                  console.log(`[WS] Recipient ${peer.name} connection not open, cannot deliver`);
                }
                break;
              }
            }
            
            if (!recipientFound) {
              console.log(`[WS] Recipient with peerId ${message.message.recipient} not found`);
            }
          } else {
            // Broadcast the message to all peers except the sender
            console.log(`[WS] Broadcasting message to all peers except sender`);
            
            let messagesSent = 0;
            for (const peer of globalRoom) {
              if (peer.id !== message.userId && peer.ws.readyState === WebSocket.OPEN) {
                try {
                  peer.ws.send(JSON.stringify(message));
                  messagesSent++;
                  console.log(`[WS] Message broadcast to ${peer.name}`);
                } catch (error) {
                  console.error(`[WS] Error broadcasting message to ${peer.name}:`, error);
                }
              }
            }
            
            console.log(`[WS] Message broadcast to ${messagesSent} peers`);
          }
          break;
      }
    } catch (error) {
      console.error('[WS] Invalid message format:', error);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[WS] Connection #${connectionCounter} closed with code ${code}, reason: ${reason || 'No reason'}`);
    clearInterval(interval);
    if (currentPeer) {
      console.log(`[WS] Removing peer ${currentPeer.name} (${currentPeer.id})`);
      globalRoom.delete(currentPeer);
    }
    broadcastPeers();
  });

  ws.on('error', (error) => {
    console.error(`[WS] Error for connection #${connectionCounter}:`, error);
  });

  const broadcastPeers = () => {
    const peersList = Array.from(globalRoom).map(({ id, name, peerId, lastSeen, ip }) => ({ 
      id, 
      name, 
      peerId,
      lastSeen,
      ip // Include IP for debugging
    }));
    
    const message = JSON.stringify({ 
      type: 'PEERS', 
      peers: peersList
    });
    
    console.log(`[WS] Broadcasting peers update to all clients: ${peersList.length} peers`);
    
    // Send to all peers in the global room
    globalRoom.forEach(peer => {
      if (peer.ws.readyState === WebSocket.OPEN) {
        try {
          peer.ws.send(message);
        } catch (error) {
          console.error(`[WS] Error sending to peer ${peer.name} (${peer.id}):`, error);
        }
      }
    });
  };
});

// Heartbeat for WebSocket server
setInterval(() => {
  console.log(`[SERVER] Status: ${connectionCounter} total connections, ${globalRoom.size} active peers`);
  
  if (globalRoom.size > 0) {
    console.log('[SERVER] Active peers:');
    Array.from(globalRoom).forEach(peer => {
      console.log(`  - ${peer.name} (${peer.id}) from ${peer.ip}, last seen: ${new Date(peer.lastSeen).toISOString()}`);
    });
  }
}, 30000);

// Expose endpoints for checking server status and active rooms
app.get('/status', (_, res) => {
  res.json({
    status: 'online',
    connections: connectionCounter,
    activePeers: globalRoom.size,
    peers: Array.from(globalRoom).map(({ id, name, peerId, ip, lastSeen }) => ({
      id,
      name,
      peerId,
      ip,
      lastSeen
    }))
  });
});

// Endpoint to get server's local IP address
app.get('/ip', (_, res) => {
  const serverIp = getLocalIpAddress();
  res.json({
    ip: serverIp,
    wsUrl: `ws://${serverIp}:3005`,
    interfaces: networkInterfaces()
  });
});

// Root route for basic testing
app.get('/', (_, res) => {
  res.send(`
    <html>
      <head>
        <title>AirShare LAN Server</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          pre { background: #f5f5f5; padding: 10px; border-radius: 5px; overflow: auto; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f5f5f5; }
        </style>
      </head>
      <body>
        <h1>AirShare LAN Server</h1>
        <p>Server is running. The following endpoints are available:</p>
        <ul>
          <li><a href="/status">/status</a> - View server status</li>
          <li><a href="/ip">/ip</a> - View server IP information</li>
        </ul>
        <p>Connect to the WebSocket server at: <code>ws://${getLocalIpAddress()}:3005</code></p>
        <h2>Testing WebSocket Connection</h2>
        <p>Open browser console to see connection status.</p>
        <pre id="status">Connecting...</pre>
        
        <h2>Current Peers</h2>
        <div id="peers">Loading...</div>
        
        <script>
          const statusEl = document.getElementById('status');
          const peersEl = document.getElementById('peers');
          
          statusEl.textContent = 'Attempting connection...';
          
          function updatePeersList(peers) {
            if (peers.length === 0) {
              peersEl.innerHTML = '<p>No peers connected</p>';
              return;
            }
            
            let html = '<table>';
            html += '<tr><th>Name</th><th>ID</th><th>Peer ID</th><th>IP</th><th>Last Seen</th></tr>';
            
            peers.forEach(peer => {
              const lastSeen = new Date(peer.lastSeen).toLocaleTimeString();
              html += '<tr>' +
                '<td>' + peer.name + '</td>' +
                '<td>' + peer.id.substring(0, 8) + '...</td>' +
                '<td>' + peer.peerId.substring(0, 8) + '...</td>' +
                '<td>' + (peer.ip || 'Unknown') + '</td>' +
                '<td>' + lastSeen + '</td>' +
                '</tr>';
            });
            
            html += '</table>';
            peersEl.innerHTML = html;
          }
          
          try {
            const ws = new WebSocket('ws://' + window.location.hostname + ':3005');
            
            ws.onopen = () => {
              statusEl.textContent = 'Connected to WebSocket server!';
              console.log('Connected to WebSocket server');
              
              // Send JOIN message
              ws.send(JSON.stringify({
                type: 'JOIN',
                userId: 'browser-test-' + Date.now(),
                userName: 'Browser Test',
                peerId: 'browser-test-peer',
              }));
            };
            
            ws.onclose = () => {
              statusEl.textContent = 'Disconnected from WebSocket server.';
              console.log('Disconnected from WebSocket server');
            };
            
            ws.onerror = (err) => {
              statusEl.textContent = 'Error connecting to WebSocket server!';
              console.error('WebSocket error:', err);
            };
            
            ws.onmessage = (event) => {
              console.log('Received message:', JSON.parse(event.data));
              const data = JSON.parse(event.data);
              if (data.type === 'PEERS') {
                statusEl.textContent = 'Connected! Current peers: ' + data.peers.length;
                updatePeersList(data.peers);
              }
            };
            
            // Heartbeat
            setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'HEARTBEAT', userId: 'browser-test-' + Date.now() }));
              }
            }, 10000);
            
          } catch (err) {
            statusEl.textContent = 'Error: ' + err.message;
            console.error('Error initializing WebSocket:', err);
          }
        </script>
      </body>
    </html>
  `);
});

const port = Number(process.env.PORT || 3005);
const bindAddress = '0.0.0.0'; // Explicitly bind to all interfaces
const serverIp = getLocalIpAddress();

console.log(`Attempting to bind server to ${bindAddress}:${port}`);

server.listen(port, bindAddress, () => {
  console.log(`LAN Server running on port ${port}`);
  console.log(`Local IP: ${serverIp}`);
  console.log(`For other devices, connect to: ws://${serverIp}:${port}`);
  console.log(`API available at: http://${serverIp}:${port}/status`);
  console.log(`Test page available at: http://${serverIp}:${port}`);
  console.log(`Active network interfaces:`, JSON.stringify(networkInterfaces(), null, 2));
}); 