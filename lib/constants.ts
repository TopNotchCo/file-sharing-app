"use client"

const constants = {
  /* File transfer related */
  CHUNK: 'chunk',
  JOIN: 'join',
  USER_JOIN: 'user-join',
  USER_LEAVE: 'user-leave',
  FILE_INIT: 'file-init',
  FILE_STATUS: 'file-status',
  FILE_TORRENT: 'file-torrent',

  /* Error related */
  ERR_SAME_NAME: 'ERR_SAME_NAME',
  ERR_CONN_CLOSED: 'ERR_CONN_CLOSED',
  ERR_LARGE_FILE: 'ERR_LARGE_FILE',

  /* Service worker features related */
  SW_LOAD_FILES: 'sw-load-files',
  SW_SHARE_READY: 'sw-share-ready',
  
  /* Room management */
  ROOM_CREATE: 'room-create',
  ROOM_JOIN: 'room-join',
  ROOM_INFO: 'room-info',
  PEER_ANNOUNCE: 'peer-announce',
  
  /* Size limits */
  WS_SIZE_LIMIT: 100 * 1024 * 1024, // 100MB for WebSocket transfers
  TORRENT_SIZE_LIMIT: 2 * 1024 * 1024 * 1024, // 2GB for WebTorrent transfers
}

export default constants 