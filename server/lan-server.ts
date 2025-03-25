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
  subnet: string; // Store the subnet to group peers by WiFi network
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

// Replace global room with a map of rooms by subnet
const rooms = new Map<string, Set<LANPeer>>();
const PEER_TIMEOUT = 30000; // 30 seconds

// Function to extract subnet from IP address (e.g., 192.168.1.x → 192.168.1)
function extractSubnet(ip: string): string {
  const parts = ip.split('.');
  if (parts.length !== 4) return 'unknown';
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

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

  // Extract subnet from IP to determine which room the peer belongs to
  const subnet = extractSubnet(ip);
  console.log(`[WS] Connection #${connectionCounter} from IP: ${ip}, Subnet: ${subnet}`);
  
  let currentPeer: LANPeer | null = null;
  let currentRoom: Set<LANPeer> | null = null;

  const heartbeat = () => {
    if (currentPeer) {
      currentPeer.lastSeen = Date.now();
    }
  };

  const interval = setInterval(() => {
    const now = Date.now();
    
    // Check for timed out peers in all rooms
    for (const [subnet, room] of rooms.entries()) {
      const timedOutPeers: LANPeer[] = [];
      
      room.forEach(peer => {
        if (now - peer.lastSeen > PEER_TIMEOUT) {
          console.log(`[WS] Peer ${peer.name} (${peer.id}) from ${peer.ip} timed out, removing`);
          timedOutPeers.push(peer);
        }
      });
      
      // Remove timed out peers
      timedOutPeers.forEach(peer => room.delete(peer));
      
      // If the room is empty, delete it
      if (room.size === 0) {
        console.log(`[WS] Room for subnet ${subnet} is empty, removing`);
        rooms.delete(subnet);
      } else {
        // Broadcast updated peer list to this room only
        broadcastPeersToRoom(subnet, room);
      }
    }
  }, 5000);

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString()) as PeerMessage;
      console.log(`[WS] Message from ${ip}: ${message.type}`);
      
      switch (message.type) {
        case 'JOIN':
          console.log(`[WS] User ${message.userName || 'Unknown'} (${message.userId}) joining from ${ip} (subnet: ${subnet})`);
          
          // Get or create room for this subnet
          if (!rooms.has(subnet)) {
            console.log(`[WS] Creating new room for subnet ${subnet}`);
            rooms.set(subnet, new Set<LANPeer>());
          }
          
          currentRoom = rooms.get(subnet)!;
          
          // Check if user already exists in this room (reconnecting)
          for (const peer of currentRoom) {
            if (peer.id === message.userId) {
              console.log(`[WS] User ${message.userId} already exists in room ${subnet}, removing old connection`);
              currentRoom.delete(peer);
              break;
            }
          }
          
          currentPeer = {
            id: message.userId,
            name: message.userName || 'Anonymous',
            peerId: message.peerId || '',
            lastSeen: Date.now(),
            ip,
            subnet,
            ws
          };
          
          currentRoom.add(currentPeer);
          broadcastPeersToRoom(subnet, currentRoom);
          break;
        
        case 'HEARTBEAT':
          heartbeat();
          break;
          
        case 'MESSAGE':
          if (!currentRoom) {
            console.log(`[WS] Cannot relay message: peer not in any room`);
            break;
          }
          
          console.log(`[WS] Relaying message from ${message.userId} in subnet ${subnet}: ${message.message?.type}`);
          console.log('[WS] Full message payload:', JSON.stringify(message.message, null, 2));
          
          // If the message has a specific recipient
          if (message.message?.recipient) {
            let recipientFound = false;
            
            // Find the recipient peer in the same room
            for (const peer of currentRoom) {
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
              console.log(`[WS] Recipient with peerId ${message.message.recipient} not found in room ${subnet}`);
            }
          } else {
            // Broadcast the message to all peers in the same room except the sender
            console.log(`[WS] Broadcasting message to all peers in subnet ${subnet} except sender`);
            
            let messagesSent = 0;
            for (const peer of currentRoom) {
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
            
            console.log(`[WS] Message broadcast to ${messagesSent} peers in subnet ${subnet}`);
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
    
    if (currentPeer && currentRoom) {
      console.log(`[WS] Removing peer ${currentPeer.name} (${currentPeer.id}) from room ${subnet}`);
      currentRoom.delete(currentPeer);
      
      // If the room is empty, remove it
      if (currentRoom.size === 0) {
        console.log(`[WS] Room for subnet ${subnet} is empty, removing`);
        rooms.delete(subnet);
      } else {
        // Otherwise broadcast updated peer list
        broadcastPeersToRoom(subnet, currentRoom);
      }
    }
  });

  ws.on('error', (error) => {
    console.error(`[WS] Error for connection #${connectionCounter}:`, error);
  });

  // Function to broadcast peers list to a specific room
  const broadcastPeersToRoom = (subnet: string, room: Set<LANPeer>) => {
    const peersList = Array.from(room).map(({ id, name, peerId, lastSeen, ip, subnet }) => ({ 
      id, 
      name, 
      peerId,
      lastSeen,
      ip,
      subnet
    }));
    
    const message = JSON.stringify({ 
      type: 'PEERS', 
      peers: peersList
    });
    
    console.log(`[WS] Broadcasting peers update to subnet ${subnet}: ${peersList.length} peers`);
    
    // Send to all peers in the specified room
    room.forEach(peer => {
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
  console.log(`[SERVER] Status: ${connectionCounter} total connections, ${rooms.size} active rooms`);
  
  let totalPeers = 0;
  for (const [subnet, room] of rooms.entries()) {
    totalPeers += room.size;
    console.log(`[SERVER] Room ${subnet}: ${room.size} peers`);
    
    if (room.size > 0) {
      Array.from(room).forEach(peer => {
        console.log(`  - ${peer.name} (${peer.id}) from ${peer.ip}, last seen: ${new Date(peer.lastSeen).toISOString()}`);
      });
    }
  }
  
  console.log(`[SERVER] Total active peers across all rooms: ${totalPeers}`);
}, 30000);

// Expose endpoints for checking server status and active rooms
app.get('/status', (_, res) => {
  const roomsInfo = Array.from(rooms.entries()).map(([subnet, room]) => ({
    subnet,
    peerCount: room.size,
    peers: Array.from(room).map(({ id, name, peerId, ip, lastSeen, subnet }) => ({
      id,
      name,
      peerId,
      ip,
      subnet,
      lastSeen
    }))
  }));
  
  res.json({
    status: 'online',
    connections: connectionCounter,
    roomCount: rooms.size,
    totalPeers: roomsInfo.reduce((acc, room) => acc + room.peerCount, 0),
    rooms: roomsInfo
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
          .room { margin-bottom: 30px; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
          h3 { margin-top: 0; }
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
        
        <h2>Current Rooms</h2>
        <div id="rooms">Loading...</div>
        
        <script>
          const statusEl = document.getElementById('status');
          const roomsEl = document.getElementById('rooms');
          let mySubnet = null;
          
          statusEl.textContent = 'Attempting connection...';
          
          function updatePeersList(peers) {
            if (!mySubnet && peers.length > 0) {
              mySubnet = peers[0].subnet;
            }
            
            if (peers.length === 0) {
              roomsEl.innerHTML = '<p>No peers connected in your subnet</p>';
              return;
            }
            
            let html = '<div class="room">';
            html += '<h3>Your Room (Subnet: ' + mySubnet + ')</h3>';
            html += '<table>';
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
            
            html += '</table></div>';
            roomsEl.innerHTML = html;
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
                statusEl.textContent = 'Connected! Current peers in your room: ' + data.peers.length;
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