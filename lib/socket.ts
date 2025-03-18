"use client"

/**
 * Socket class for handling WebSocket communication
 * Similar to the competitor's implementation but with TypeScript improvements
 */
export interface SocketCallbacks {
  [key: string]: ((data: unknown) => void) | undefined
}

export class Socket {
  private socket: WebSocket
  private callbacks: SocketCallbacks = {}
  public peerId: string = ''
  public name: string = ''
  public ip: string = ''

  constructor(socket: WebSocket, ip: string = '') {
    this.socket = socket
    this.socket.binaryType = 'arraybuffer'
    this.ip = ip

    socket.addEventListener('message', (msg: MessageEvent) => {
      let callback, data
      
      if (typeof msg.data === 'string') {
        try {
          const json = JSON.parse(msg.data)
          data = json.data
          callback = this.callbacks[json.event]
        } catch (err) {
          console.error('Error parsing message data:', err)
          return
        }
      } else {
        callback = this.callbacks['chunk']
        data = msg.data
      }

      if (callback) {
        callback(data)
      }
    })
  }

  /**
   * Register a callback for a specific event
   */
  listen(event: string, callback: (data: unknown) => void): void {
    this.callbacks[event] = callback
  }

  /**
   * Add an event listener directly to the WebSocket
   */
  on(event: string, callback: EventListener): void {
    this.socket.addEventListener(event, callback)
  }

  /**
   * Remove a callback for a specific event
   */
  off(event: string): void {
    this.callbacks[event] = undefined
  }

  /**
   * Send data to the WebSocket
   */
  send(event: string, data: unknown): void {
    if (event === 'chunk') {
      if (data instanceof ArrayBuffer || 
          data instanceof Blob || 
          ArrayBuffer.isView(data)) {
        this.socket.send(data)
      } else {
        console.error('Invalid chunk data type:', typeof data)
      }
    } else {
      this.socket.send(JSON.stringify({ event, data }))
    }
  }

  /**
   * Close the WebSocket connection
   */
  close(code?: number, reason?: string): void {
    this.socket.close(code, reason)
  }

  /**
   * Get the socket ID
   */
  get id(): string | undefined {
    return (this.socket as { id?: string }).id
  }
}

export default Socket 