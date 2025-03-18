"use client"

export interface PeerInfo {
  id: string
  name: string
  lastSeen: number
}

export class PeerDiscovery {
  private ws: WebSocket | null = null
  private peers: Map<string, PeerInfo> = new Map()
  private reconnectTimeout: NodeJS.Timeout | null = null
  private keepAliveInterval: NodeJS.Timeout | null = null
  private onPeersChange: (peers: PeerInfo[]) => void
  private localPeer: PeerInfo
  private isConnecting: boolean = false

  constructor(userName: string, clientId: string, onPeersChange: (peers: PeerInfo[]) => void) {
    this.onPeersChange = onPeersChange
    this.localPeer = {
      id: clientId,
      name: userName,
      lastSeen: Date.now()
    }
  }

  connect() {
    if (this.isConnecting) {
      console.log('Already attempting to connect, skipping')
      return
    }

    try {
      this.isConnecting = true
      // Use secure WebSocket if the page is served over HTTPS
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.hostname
      const port = window.location.port
      
      // In development, we need to use the actual port (usually 3000)
      const wsUrl = port
        ? `${protocol}//${host}:${port}/api/ws`
        : `${protocol}//${host}/api/ws`

      console.log('Attempting WebSocket connection to:', wsUrl)
      
      if (this.ws) {
        console.log('Closing existing WebSocket connection')
        this.ws.close()
        this.ws = null
      }

      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        console.log('WebSocket connection established')
        this.isConnecting = false
        this.startKeepAlive()
        this.announce()
      }

      this.ws.onclose = (event) => {
        console.log('WebSocket connection closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        })
        this.isConnecting = false
        this.scheduleReconnect()
      }

      this.ws.onerror = () => {
        console.error('WebSocket connection error - check server logs for details')
        if (this.ws) {
          console.log('Current WebSocket state:', this.ws.readyState)
        }
        this.isConnecting = false
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'PEER_ANNOUNCE') {
            const peer = message.peer as PeerInfo
            if (peer.id !== this.localPeer.id) {
              this.peers.set(peer.id, { ...peer, lastSeen: Date.now() })
              this.notifyPeersChange()
            }
          }
        } catch (error) {
          console.error('Error handling message:', error)
        }
      }
    } catch (error) {
      console.error('Error setting up WebSocket connection:', error)
      this.isConnecting = false
      this.scheduleReconnect()
    }
  }

  private startKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval)
    }
    
    this.keepAliveInterval = setInterval(() => {
      this.announce()
      this.cleanupStaleConnections()
    }, 5000)
  }

  private announce() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: 'PEER_ANNOUNCE',
          peer: {
            ...this.localPeer,
            lastSeen: Date.now()
          }
        }))
      } catch (error) {
        console.error('Error announcing peer:', error)
      }
    }
  }

  private cleanupStaleConnections() {
    const now = Date.now()
    let hasChanges = false
    
    Array.from(this.peers.entries()).forEach(([id, peer]) => {
      if (now - peer.lastSeen > 15000) { // 15 seconds timeout
        this.peers.delete(id)
        hasChanges = true
      }
    })

    if (hasChanges) {
      this.notifyPeersChange()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }
    this.reconnectTimeout = setTimeout(() => {
      if (!this.isConnecting) {
        this.connect()
      }
    }, 5000)
  }

  private notifyPeersChange() {
    this.onPeersChange(Array.from(this.peers.values()))
  }

  updateUserName(userName: string) {
    this.localPeer.name = userName
    this.announce()
  }

  disconnect() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval)
      this.keepAliveInterval = null
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.peers.clear()
    this.notifyPeersChange()
    this.isConnecting = false
  }
} 