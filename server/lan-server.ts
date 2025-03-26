/* eslint-disable */
// @ts-nocheck
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import express from 'express';
import { Request, Response, NextFunction } from 'express';
import { networkInterfaces } from 'os';
import { getIp, getLocalIpAddress } from '../lib/network-utils';
import { nanoid } from 'nanoid';

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
// Use HTTP server for development, Render.com handles the HTTPS termination in production
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
  roomId?: string; // Optional room ID for explicit rooms
}

interface PeerMessage {
  type: string;
  userId: string;
  userName?: string;
  peerId?: string;
  roomId?: string; // Add roomId for explicit room joining
  message?: {
    type: string;
    data: Record<string, unknown>;
    recipient?: string;
  };
}

// Replace global room with a map of rooms by subnet
const rooms = new Map<string, Set<LANPeer>>();
// Add explicit rooms map
const explicitRooms = new Map<string, Set<LANPeer>>();
const PEER_TIMEOUT = 30000; // 30 seconds

// Function to extract subnet from IP address (e.g., 192.168.1.x → 192.168.1)
function extractSubnet(ip: string): string {
  const parts = ip.split('.');
  if (parts.length !== 4) return 'unknown';
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

// Enable CORS for all routes
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Add a debug middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[HTTP] ${req.method} ${req.url} from ${req.ip}`);
  next();
});

// API endpoint to create a new explicit room
app.get('/create-room', (_: Request, res: Response) => {
  const roomId = nanoid(6);
  explicitRooms.set(roomId, new Set<LANPeer>());
  console.log(`[API] Created new explicit room: ${roomId}`);
  res.json({ roomId });
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
  let isExplicitRoom = false;

  const heartbeat = () => {
    if (currentPeer) {
      currentPeer.lastSeen = Date.now();
    }
  };

  const interval = setInterval(() => {
    const now = Date.now();
    
    // Check for timed out peers in subnet rooms
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
        broadcastPeersToRoom(subnet, room, false);
      }
    }
    
    // Check for timed out peers in explicit rooms
    for (const [roomId, room] of explicitRooms.entries()) {
      const timedOutPeers: LANPeer[] = [];
      
      room.forEach(peer => {
        if (now - peer.lastSeen > PEER_TIMEOUT) {
          console.log(`[WS] Peer ${peer.name} (${peer.id}) from explicit room ${roomId} timed out, removing`);
          timedOutPeers.push(peer);
        }
      });
      
      // Remove timed out peers
      timedOutPeers.forEach(peer => room.delete(peer));
      
      // If the room is empty, delete it
      if (room.size === 0) {
        console.log(`[WS] Explicit room ${roomId} is empty, removing`);
        explicitRooms.delete(roomId);
      } else {
        // Broadcast updated peer list to this room only
        broadcastPeersToRoom(roomId, room, true);
      }
    }
  }, 5000);

  ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
    try {
      // Convert data to string, handling different input types
      let messageStr = '';
      if (Buffer.isBuffer(data)) {
        messageStr = data.toString();
      } else if (data instanceof ArrayBuffer) {
        messageStr = Buffer.from(data).toString();
      } else if (Array.isArray(data)) {
        messageStr = Buffer.concat(data).toString();
      }
      
      const message = JSON.parse(messageStr) as PeerMessage;
      console.log(`[WS] Message from ${ip}: ${message.type}`);
      
      switch (message.type) {
        case 'JOIN':
          console.log(`[WS] User ${message.userName || 'Unknown'} (${message.userId}) joining from ${ip} (subnet: ${subnet})`);
          
          // If a roomId is provided, use explicit room
          if (message.roomId) {
            if (!explicitRooms.has(message.roomId)) {
              console.log(`[WS] Creating new explicit room: ${message.roomId}`);
              explicitRooms.set(message.roomId, new Set<LANPeer>());
            }
            
            currentRoom = explicitRooms.get(message.roomId)!;
            isExplicitRoom = true;
            
            // Check if user already exists in this room (reconnecting)
            for (const peer of currentRoom) {
              if (peer.id === message.userId) {
                console.log(`[WS] User ${message.userId} already exists in explicit room ${message.roomId}, removing old connection`);
                currentRoom.delete(peer);
                break;
              }
            }
          } else {
            // Default to subnet-based room for LAN discovery
            if (!rooms.has(subnet)) {
              console.log(`[WS] Creating new room for subnet ${subnet}`);
              rooms.set(subnet, new Set<LANPeer>());
            }
            
            currentRoom = rooms.get(subnet)!;
            isExplicitRoom = false;
            
            // Check if user already exists in this room (reconnecting)
            for (const peer of currentRoom) {
              if (peer.id === message.userId) {
                console.log(`[WS] User ${message.userId} already exists in room ${subnet}, removing old connection`);
                currentRoom.delete(peer);
                break;
              }
            }
          }
          
          currentPeer = {
            id: message.userId,
            name: message.userName || 'Anonymous',
            peerId: message.peerId || '',
            lastSeen: Date.now(),
            ip,
            subnet,
            ws,
            roomId: message.roomId
          };
          
          currentRoom.add(currentPeer);
          broadcastPeersToRoom(isExplicitRoom ? message.roomId! : subnet, currentRoom, isExplicitRoom);
          break;
        
        case 'HEARTBEAT':
          heartbeat();
          break;
          
        case 'MESSAGE':
          if (!currentRoom) {
            console.log(`[WS] Cannot relay message: peer not in any room`);
            break;
          }
          
          console.log(`[WS] Relaying message from ${message.userId} in ${isExplicitRoom ? 'explicit room ' + currentPeer?.roomId : 'subnet ' + subnet}: ${message.message?.type}`);
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
              console.log(`[WS] Recipient with peerId ${message.message.recipient} not found in ${isExplicitRoom ? 'explicit room ' + currentPeer?.roomId : 'subnet ' + subnet}`);
            }
          } else {
            // Broadcast the message to all peers in the same room except the sender
            console.log(`[WS] Broadcasting message to all peers in ${isExplicitRoom ? 'explicit room ' + currentPeer?.roomId : 'subnet ' + subnet} except sender`);
            
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
            
            console.log(`[WS] Message broadcast to ${messagesSent} peers in ${isExplicitRoom ? 'explicit room ' + currentPeer?.roomId : 'subnet ' + subnet}`);
          }
          break;
      }
    } catch (error) {
      console.error('[WS] Invalid message format:', error);
    }
  });

  ws.on('close', (code: number, reason: string) => {
    console.log(`[WS] Connection #${connectionCounter} closed with code ${code}, reason: ${reason || 'No reason'}`);
    clearInterval(interval);
    
    if (currentPeer && currentRoom) {
      if (isExplicitRoom && currentPeer.roomId) {
        console.log(`[WS] Removing peer ${currentPeer.name} (${currentPeer.id}) from explicit room ${currentPeer.roomId}`);
        currentRoom.delete(currentPeer);
        
        // If the room is empty, remove it
        if (currentRoom.size === 0) {
          console.log(`[WS] Explicit room ${currentPeer.roomId} is empty, removing`);
          explicitRooms.delete(currentPeer.roomId);
        } else {
          // Otherwise broadcast updated peer list
          broadcastPeersToRoom(currentPeer.roomId, currentRoom, true);
        }
      } else {
        console.log(`[WS] Removing peer ${currentPeer.name} (${currentPeer.id}) from room ${subnet}`);
        currentRoom.delete(currentPeer);
        
        // If the room is empty, remove it
        if (currentRoom.size === 0) {
          console.log(`[WS] Room for subnet ${subnet} is empty, removing`);
          rooms.delete(subnet);
        } else {
          // Otherwise broadcast updated peer list
          broadcastPeersToRoom(subnet, currentRoom, false);
        }
      }
    }
  });

  ws.on('error', (error: Error) => {
    console.error(`[WS] Error for connection #${connectionCounter}:`, error);
  });

  // Function to broadcast peers list to a specific room
  const broadcastPeersToRoom = (roomIdentifier: string, room: Set<LANPeer>, isExplicitRoom: boolean) => {
    const peersList = Array.from(room).map(({ id, name, peerId, lastSeen, ip, subnet, roomId }) => ({ 
      id, 
      name, 
      peerId,
      lastSeen,
      ip,
      subnet,
      roomId
    }));
    
    const message = JSON.stringify({ 
      type: 'PEERS', 
      peers: peersList
    });
    
    console.log(`[WS] Broadcasting peers update to ${isExplicitRoom ? 'explicit room' : 'subnet'} ${roomIdentifier}: ${peersList.length} peers`);
    
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
  console.log(`[SERVER] Status: ${connectionCounter} total connections, ${rooms.size} subnet rooms, ${explicitRooms.size} explicit rooms`);
  
  let totalSubnetPeers = 0;
  for (const [subnet, room] of rooms.entries()) {
    totalSubnetPeers += room.size;
    console.log(`[SERVER] Subnet room ${subnet}: ${room.size} peers`);
    
    if (room.size > 0) {
      Array.from(room).forEach(peer => {
        console.log(`  - ${peer.name} (${peer.id}) from ${peer.ip}, last seen: ${new Date(peer.lastSeen).toISOString()}`);
      });
    }
  }
  
  let totalExplicitPeers = 0;
  for (const [roomId, room] of explicitRooms.entries()) {
    totalExplicitPeers += room.size;
    console.log(`[SERVER] Explicit room ${roomId}: ${room.size} peers`);
    
    if (room.size > 0) {
      Array.from(room).forEach(peer => {
        console.log(`  - ${peer.name} (${peer.id}) from ${peer.ip}, last seen: ${new Date(peer.lastSeen).toISOString()}`);
      });
    }
  }
  
  console.log(`[SERVER] Total active peers: ${totalSubnetPeers + totalExplicitPeers} (${totalSubnetPeers} in subnet rooms, ${totalExplicitPeers} in explicit rooms)`);
}, 30000);

// Expose endpoints for checking server status and active rooms
app.get('/status', (_: Request, res: Response) => {
  const subnetRoomsInfo = Array.from(rooms.entries()).map(([subnet, room]) => ({
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
  
  const explicitRoomsInfo = Array.from(explicitRooms.entries()).map(([roomId, room]) => ({
    roomId,
    peerCount: room.size,
    peers: Array.from(room).map(({ id, name, peerId, ip, lastSeen, roomId }) => ({
      id,
      name,
      peerId,
      ip,
      roomId,
      lastSeen
    }))
  }));
  
  res.json({
    status: 'online',
    connections: connectionCounter,
    subnetRoomCount: rooms.size,
    explicitRoomCount: explicitRooms.size,
    totalPeers: subnetRoomsInfo.reduce((acc, room) => acc + room.peerCount, 0) + 
               explicitRoomsInfo.reduce((acc, room) => acc + room.peerCount, 0),
    subnetRooms: subnetRoomsInfo,
    explicitRooms: explicitRoomsInfo
  });
});

// Endpoint to get server's local IP address
app.get('/ip', (_: Request, res: Response) => {
  const serverIp = getLocalIpAddress();
  res.json({
    ip: serverIp,
    wsUrl: `ws://${serverIp}:3005`,
    interfaces: networkInterfaces()
  });
});

// Root route for basic testing
app.get('/', (_: Request, res: Response) => {
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
          .create-room { margin: 20px 0; padding: 10px; background: #f0f0f0; border-radius: 5px; }
          button { padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; }
          button:hover { background: #45a049; }
          input { padding: 8px; margin-right: 10px; border: 1px solid #ddd; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h1>AirShare LAN Server</h1>
        <p>Server is running. The following endpoints are available:</p>
        <ul>
          <li><a href="/status">/status</a> - View server status</li>
          <li><a href="/ip">/ip</a> - View server IP information</li>
          <li><a href="/create-room">/create-room</a> - Create a new room</li>
        </ul>
        <p>Connect to the WebSocket server at: <code>ws://${getLocalIpAddress()}:3005</code></p>
        
        <div class="create-room">
          <h2>Create or Join Room</h2>
          <div>
            <button id="createRoomBtn">Create New Room</button>
            <div id="roomResult" style="margin-top: 10px;"></div>
          </div>
          <div style="margin-top: 15px;">
            <input id="roomIdInput" placeholder="Enter Room ID" />
            <button id="joinRoomBtn">Join Room</button>
          </div>
        </div>
        
        <h2>Testing WebSocket Connection</h2>
        <p>Open browser console to see connection status.</p>
        <pre id="status">Connecting...</pre>
        
        <h2>Current Room</h2>
        <div id="rooms">Loading...</div>
        
        <script>
          const statusEl = document.getElementById('status');
          const roomsEl = document.getElementById('rooms');
          const createRoomBtn = document.getElementById('createRoomBtn');
          const roomResult = document.getElementById('roomResult');
          const roomIdInput = document.getElementById('roomIdInput');
          const joinRoomBtn = document.getElementById('joinRoomBtn');
          
          let myRoomId = null;
          let mySubnet = null;
          let ws = null;
          
          statusEl.textContent = 'Not connected';
          
          // Create room function
          createRoomBtn.addEventListener('click', async () => {
            try {
              const response = await fetch('/create-room');
              const data = await response.json();
              roomResult.innerHTML = \`Room created! ID: <strong>\${data.roomId}</strong>\`;
              roomIdInput.value = data.roomId;
            } catch (error) {
              console.error('Error creating room:', error);
              roomResult.textContent = 'Error creating room: ' + error.message;
            }
          });
          
          // Join room function
          joinRoomBtn.addEventListener('click', () => {
            const roomId = roomIdInput.value.trim();
            if (!roomId) {
              alert('Please enter a room ID');
              return;
            }
            
            connectToWebSocket(roomId);
          });
          
          function updatePeersList(peers) {
            if (peers.length === 0) {
              roomsEl.innerHTML = '<p>No peers connected in your room</p>';
              return;
            }
            
            // Update room identification
            if (myRoomId) {
              mySubnet = null; // If we're in an explicit room, ignore subnet
            } else if (!mySubnet && peers.length > 0) {
              mySubnet = peers[0].subnet;
            }
            
            const roomIdentifier = myRoomId || mySubnet || 'Unknown';
            
            let html = '<div class="room">';
            html += '<h3>Your Room: ' + (myRoomId ? 'ID: ' + myRoomId : 'Subnet: ' + mySubnet) + '</h3>';
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
          
          function connectToWebSocket(roomId = null) {
            // Close existing connection if any
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
            
            myRoomId = roomId;
            statusEl.textContent = 'Attempting connection...';
            
            try {
              ws = new WebSocket(\`\${window.location.protocol === 'https:' ? 'wss://' : 'ws://'}\${window.location.hostname}\${window.location.protocol === 'https:' ? '' : ':3005'}\`);
              
              ws.onopen = () => {
                statusEl.textContent = 'Connected to WebSocket server!';
                console.log('Connected to WebSocket server');
                
                // Generate a unique user ID
                const userId = 'browser-test-' + Date.now();
                
                // Send JOIN message with room ID if provided
                const joinMessage = {
                  type: 'JOIN',
                  userId: userId,
                  userName: 'Browser Test',
                  peerId: 'browser-test-peer-' + Date.now().toString(36),
                };
                
                if (roomId) {
                  joinMessage.roomId = roomId;
                }
                
                ws.send(JSON.stringify(joinMessage));
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
                if (ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'HEARTBEAT', userId: 'browser-test-' + Date.now() }));
                }
              }, 10000);
              
            } catch (err) {
              statusEl.textContent = 'Error: ' + err.message;
              console.error('Error initializing WebSocket:', err);
            }
          }
          
          // Auto-connect without a room ID (default to subnet-based for LAN)
          connectToWebSocket();
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
  
  // Use appropriate protocol for logging based on environment
  const protocol = isProduction ? 'wss://' : 'ws://';
  const hostname = isProduction ? 'file-sharing-app-23eq.onrender.com' : serverIp;
  const portDisplay = isProduction ? '' : `:${port}`;
  
  console.log(`For other devices, connect to: ${protocol}${hostname}${portDisplay}`);
  console.log(`API available at: http${isProduction ? 's' : ''}://${hostname}${portDisplay}/status`);
  console.log(`Test page available at: http${isProduction ? 's' : ''}://${hostname}${portDisplay}`);
  console.log(`Active network interfaces:`, JSON.stringify(networkInterfaces(), null, 2));
}); 