"use client"

import Socket from './socket'
import FileShare from './file-share'
import constants from './constants'

/**
 * Opens a socket connection to join a room
 * @param room Room to join
 * @param username Name of the user joining the room
 * @returns FileShare instance connected to the socket
 */
export function socketConnect(room: string, username: string): FileShare {
  // Use secure WebSocket if the page is served over HTTPS
  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000'
  const wsUrl = `${protocol}//${host}/api/ws`
  
  const socket = new Socket(new WebSocket(wsUrl))
  const fileShare = new FileShare(socket)
  socket.name = username
  
  socket.on('open', () => {
    socket.send(constants.JOIN, {
      roomName: room,
      name: username,
      peerId: fileShare.getPeerId(),
    })
  })

  return fileShare
}

export default socketConnect 