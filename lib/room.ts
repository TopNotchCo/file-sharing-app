"use client"

import constants from './constants'
import Socket from './socket'

// Define a type for SSE responses
interface SSEResponse extends Response {
  write(data: string): void
  end(): void
}

/**
 * Room class for managing WebSocket connections in a room
 */
export class Room {
  private sockets: Socket[] = []
  private watchers: { id: string, res: SSEResponse }[] = []
  private sender: string | null = null
  private name: string

  constructor(name: string) {
    this.name = name
  }

  /**
   * Add a socket to the room
   */
  addSocket(socket: Socket): void {
    this.sockets.push(socket)
    this.informWatchers()
  }

  /**
   * Add a watcher (SSE connection) to the room
   */
  addWatcher(watcher: { id: string, res: SSEResponse }): void {
    this.watchers.push(watcher)
  }

  /**
   * Remove a socket from the room
   */
  removeSocket(socket: Socket): void {
    const totalSockets = this.sockets.length
    this.sockets = this.sockets.filter(client => client.name !== socket.name)
    const totalSocketsAfterRemove = this.sockets.length

    // Requested socket for deletion was not there, terminate operation
    if (totalSockets === totalSocketsAfterRemove) return
    
    console.log(`${socket.name} has left ${this.name}`)
    this.informWatchers()

    if (this.sockets.length) {
      this.broadcast(constants.USER_LEAVE, socket.name, [socket.name])
    } else if (!this.watchers.length) {
      // Room is empty, could be deleted by an external service
    }
  }

  /**
   * Remove a watcher from the room
   */
  removeWatcher(watcher: { id: string, res: SSEResponse }): void {
    this.watchers = this.watchers.filter(({ id }) => id !== watcher.id)
    watcher.res.end()
  }

  /**
   * Broadcast a message to all sockets in the room
   */
  broadcast(event: string, message: unknown, ignore?: string[]): void {
    this.sockets.forEach(client => {
      if (ignore && ignore.includes(client.name)) return

      client.send(event, message)
    })
  }

  /**
   * Inform all watchers about the current state of the room
   */
  informWatchers(watchers = this.watchers): void {
    watchers.forEach(({ res }) => {
      res.write(`data: ${JSON.stringify(this.socketsData)}\n\n`)
    })
  }

  /**
   * Get socket data for all sockets in the room
   */
  get socketsData(): { name: string, peerId: string }[] {
    return this.sockets.map(({ name, peerId }) => ({ name, peerId }))
  }

  /**
   * Get a socket by name
   */
  getSocketFromName(name: string): Socket | undefined {
    return this.sockets.find(socket => socket.name === name)
  }

  /**
   * Get the sender socket
   */
  get senderSocket(): Socket | undefined {
    if (!this.sender) return undefined

    return this.sockets.find(socket => socket.name === this.sender)
  }

  /**
   * Set the sender for this room
   */
  setSender(name: string): void {
    this.sender = name
  }
}

export default Room 