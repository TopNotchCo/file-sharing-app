import http from 'http'
import { WebSocketServer } from 'ws'
import { randomUUID } from 'crypto'

interface PeerInfo {
  id: string
  name: string
  lastSeen: number
}

interface ConnectedClient {
  id: string
  ws: WebSocket
  lastSeen: number
  name?: string
  clientId?: string
}

class SignalingServer {
  private static instance: SignalingServer
  private server: http.Server | null = null
  private wss: WebSocketServer | null = null
  private clients: Map<string, ConnectedClient> = new Map()
  private keepAliveInterval: NodeJS.Timeout | null = null
  
  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): SignalingServer {
    if (!SignalingServer.instance) {
      SignalingServer.instance = new SignalingServer()
    }
    return SignalingServer.instance
  }

  public initialize(server: http.Server): void {
    if (this.wss) {
      console.log('WebSocket server already initialized')
      return
    }

    this.server = server
    this.wss = new WebSocketServer({ 
      server,
      path: '/api/ws'
    })

    this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
      const id = randomUUID()
      const ip = req.socket.remoteAddress || 'unknown'
      
      console.log(`New WebSocket connection: ${id} from ${ip}`)
      
      const client: ConnectedClient = {
        id,
        ws,
        lastSeen: Date.now()
      }
      
      this.clients.set(id, client)
      
      ws.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data.toString())
          this.handleMessage(id, message)
        } catch (error) {
          console.error('Error parsing message:', error)
        }
      })
      
      ws.addEventListener('close', () => {
        console.log(`WebSocket connection closed: ${id}`)
        this.clients.delete(id)
        this.broadcastPeers()
      })
    })

    // Start keep-alive interval
    this.keepAliveInterval = setInterval(() => {
      this.cleanupStaleConnections()
    }, 30000) // Clean up every 30 seconds
    
    console.log('WebSocket server initialized')
  }

  private handleMessage(clientId: string, message: Record<string, unknown>): void {
    const client = this.clients.get(clientId)
    if (!client) return
    
    client.lastSeen = Date.now()
    
    switch (message.type) {
      case 'PEER_ANNOUNCE':
        if (message.peer && typeof message.peer === 'object') {
          const peer = message.peer as PeerInfo
          client.name = peer.name
          client.clientId = peer.id
          this.broadcastPeers()
        }
        break
        
      case 'ICE_CANDIDATE':
        if (message.target && message.candidate) {
          this.relayIceCandidate(client, message.target as string, message.candidate as RTCIceCandidate)
        }
        break
        
      case 'SDP_OFFER':
        if (message.target && message.sdp) {
          this.relaySdpOffer(client, message.target as string, message.sdp as RTCSessionDescription)
        }
        break
        
      case 'SDP_ANSWER':
        if (message.target && message.sdp) {
          this.relaySdpAnswer(client, message.target as string, message.sdp as RTCSessionDescription)
        }
        break
    }
  }

  private relayIceCandidate(sender: ConnectedClient, targetId: string, candidate: RTCIceCandidate): void {
    // Convert clients Map to array and iterate
    Array.from(this.clients.values()).forEach(client => {
      if (client.clientId === targetId) {
        try {
          client.ws.send(JSON.stringify({
            type: 'ICE_CANDIDATE',
            sender: sender.clientId,
            candidate
          }))
        } catch (error) {
          console.error('Error sending ICE candidate:', error)
        }
      }
    })
  }

  private relaySdpOffer(sender: ConnectedClient, targetId: string, sdp: RTCSessionDescription): void {
    // Convert clients Map to array and iterate
    Array.from(this.clients.values()).forEach(client => {
      if (client.clientId === targetId) {
        try {
          client.ws.send(JSON.stringify({
            type: 'SDP_OFFER',
            sender: sender.clientId,
            sdp
          }))
        } catch (error) {
          console.error('Error sending SDP offer:', error)
        }
      }
    })
  }

  private relaySdpAnswer(sender: ConnectedClient, targetId: string, sdp: RTCSessionDescription): void {
    // Convert clients Map to array and iterate
    Array.from(this.clients.values()).forEach(client => {
      if (client.clientId === targetId) {
        try {
          client.ws.send(JSON.stringify({
            type: 'SDP_ANSWER',
            sender: sender.clientId,
            sdp
          }))
        } catch (error) {
          console.error('Error sending SDP answer:', error)
        }
      }
    })
  }

  private broadcastPeers(): void {
    const peersList = Array.from(this.clients.values())
      .filter(client => client.clientId && client.name)
      .map(client => ({
        id: client.clientId,
        name: client.name,
        lastSeen: client.lastSeen
      }))
    
    // Convert clients Map to array and iterate
    Array.from(this.clients.values()).forEach(client => {
      try {
        client.ws.send(JSON.stringify({
          type: 'PEERS_LIST',
          peers: peersList.filter(peer => peer.id !== client.clientId)
        }))
      } catch (error) {
        console.error('Error broadcasting peers:', error)
      }
    })
  }

  private cleanupStaleConnections(): void {
    const now = Date.now()
    let hasChanges = false
    
    // Convert entries to array before iterating
    Array.from(this.clients.entries()).forEach(([id, client]) => {
      if (now - client.lastSeen > 60000) { // 60 seconds timeout
        console.log(`Removing stale connection: ${id}`)
        this.clients.delete(id)
        try {
          client.ws.close()
        } catch (error) {
          console.error('Error closing stale connection:', error)
        }
        hasChanges = true
      }
    })
    
    if (hasChanges) {
      this.broadcastPeers()
    }
  }

  public shutdown(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval)
      this.keepAliveInterval = null
    }
    
    if (this.wss) {
      this.wss.close()
      this.wss = null
    }
    
    this.clients.clear()
    console.log('WebSocket server shut down')
  }
}

export default SignalingServer 