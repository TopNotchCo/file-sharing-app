"use client"

import type WebTorrent from 'webtorrent'
import { toast } from '@/hooks/use-toast'
import constants from './constants'
import Socket from './socket'

// Define file-related types
export interface FileMeta {
  name: string
  size: number
  type: string
}

export interface TorrentFile {
  name: string
  length: number
  path: string
  type?: string
  getBlobURL(callback: (err: Error | null, url?: string) => void): void
}

export interface Torrent {
  infoHash: string
  magnetURI: string
  files: TorrentFile[]
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  numPeers: number
  done: boolean
  on(event: string, callback: (arg?: unknown) => void): void
  off(event: string, callback: (arg?: unknown) => void): void
  destroy(): void
  length: number
}

export interface WebTorrentClient {
  peerId: string
  ready: boolean
  WEBRTC_SUPPORT?: boolean
  on(event: string, callback: (arg?: unknown) => void): void
  off(event: string, callback: (arg?: unknown) => void): void
  seed(files: File[], opts: object, callback: (torrent: Torrent) => void): void
  add(torrentId: string, opts: object, callback: (torrent: Torrent) => void): void
  destroy(callback?: (err: Error | null) => void): void
}

// Runtime import holder
let WebTorrentRuntime: typeof WebTorrent | null = null

// WebTorrent configuration
const TRACKERS = {
  announce: [
    'wss://tracker.btorrent.xyz', 
    'wss://tracker.openwebtorrent.com', 
    'wss://tracker.webtorrent.dev',
    'wss://tracker.files.fm:7073/announce'
  ]
}

// Helper for pluralization
const pluralize = (count: number, single: string, plural: string): string => {
  return count === 1 ? single : plural
}

export interface ProgressInfo {
  progress: number
}

export interface TorrentProgressInfo {
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  numPeers: number
}

export interface ProgressCallback {
  onMeta?: (data: FileMeta[] | { meta: FileMeta[], size: number, sender: string }) => void
  onProgress?: (data: ProgressInfo | TorrentProgressInfo) => void
  onDone?: (data?: Blob | TorrentFile[], meta?: FileMeta) => void
}

/**
 * Load the WebTorrent library dynamically
 */
const loadWebTorrent = async (): Promise<typeof WebTorrent> => {
  if (WebTorrentRuntime) return WebTorrentRuntime
  
  if (typeof window === 'undefined') {
    throw new Error('WebTorrent can only be loaded in the browser')
  }
  
  try {
    const webTorrentModule = await import('webtorrent')
    WebTorrentRuntime = webTorrentModule.default
    return WebTorrentRuntime
  } catch (err) {
    console.error('Failed to load WebTorrent:', err)
    throw new Error('Failed to load WebTorrent')
  }
}

/**
 * FileShare class for managing file transfers
 */
export class FileShare {
  private socket: Socket
  private torrentClient: WebTorrentClient
  private isReady: boolean = false

  constructor(socket: Socket) {
    this.socket = socket
    this.torrentClient = {} as WebTorrentClient
    
    // Initialize client asynchronously
    this.initClient()
  }
  
  private async initClient(): Promise<void> {
    try {
      const WebTorrentClass = await loadWebTorrent()
      
      this.torrentClient = new WebTorrentClass({
        tracker: {
          ...TRACKERS,
          rtcConfig: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19305' },
              { urls: 'stun:stun1.l.google.com:19305' }
            ]
          }
        }
      }) as unknown as WebTorrentClient
      
      this.isReady = true
    } catch (err) {
      console.error('Error initializing WebTorrent client:', err)
      throw new Error('Failed to initialize WebTorrent client')
    }
  }

  /**
   * Check if WebRTC is supported
   */
  get isWebRTC(): boolean {
    return this.isReady && this.torrentClient && !!this.torrentClient.WEBRTC_SUPPORT
  }
  
  /**
   * Get the WebTorrent peer ID
   */
  getPeerId(): string | null {
    return this.isReady && this.torrentClient ? this.torrentClient.peerId : null
  }

  /**
   * Listen for incoming files and handle download
   */
  receiveFiles({ onMeta, onProgress, onDone }: ProgressCallback): () => void {
    let metaData: { meta?: FileMeta[], size?: number } = {}

    // Handle WebTorrent transfers
    this.socket.listen(constants.FILE_TORRENT, (data: unknown) => {
      if (!data || typeof data !== 'object') return
      
      const torrentData = data as { infoHash: string, meta: FileMeta[], size: number, sender: string }
      const { infoHash, ...rest } = torrentData
      
      if (onMeta) {
        metaData = rest
        onMeta(rest)
      }

      if (!this.isReady) {
        console.error('WebTorrent client not ready')
        return
      }

      this.torrentClient.add(infoHash, TRACKERS, (torrent: Torrent) => {
        this._onTorrent({ torrent, onProgress, onDone })
      })
    })

    // Handle WebSocket transfers
    let fileParts: ArrayBuffer[] = []
    let size = 0, statProg = 0.25
    
    this.socket.listen(constants.FILE_INIT, (data: unknown) => {
      if (!data || typeof data !== 'object') return
      
      const fileData = data as { end?: boolean, meta?: FileMeta[], size?: number, sender?: string }
      
      if (fileData.end) {
        if (fileParts.length && metaData.size && onDone) {
          onDone(new Blob(fileParts), metaData.meta?.[0])
          fileParts = []
          size = 0
          statProg = 0.25
        }
      } else {
        metaData = fileData
        if (onMeta) {
          onMeta(fileData as { meta: FileMeta[], size: number, sender: string })
        }
      }
    })

    this.socket.listen(constants.CHUNK, data => {
      if (data instanceof ArrayBuffer) {
        fileParts.push(data)
        size += data.byteLength

        if (metaData.size) {
          const progress = size / metaData.size

          if (onProgress) {
            onProgress({ progress })
          }

          if (progress >= statProg) {
            statProg += 0.15
            this.socket.send(constants.FILE_STATUS, {
              progress: statProg,
              peer: this.socket.name,
            })
          }
        }
      }
    })

    // Return cleanup function
    return () => {
      this.socket.off(constants.FILE_TORRENT)
      this.socket.off(constants.FILE_INIT)
      this.socket.off(constants.CHUNK)
    }
  }

  /**
   * Handle WebTorrent progress updates and completion
   */
  private _onTorrent({ torrent, onProgress, onDone }: { 
    torrent: Torrent, 
    onProgress?: (data: TorrentProgressInfo) => void, 
    onDone?: (data?: TorrentFile[]) => void 
  }): void {
    let updateInterval: NodeJS.Timeout | undefined

    const update = () => {
      if (onProgress) {
        onProgress({
          progress: torrent.progress,
          downloadSpeed: torrent.downloadSpeed,
          uploadSpeed: torrent.uploadSpeed,
          numPeers: torrent.numPeers
        })
      }

      if (!updateInterval) {
        updateInterval = setInterval(update, 500)
      }

      if (!torrent.uploadSpeed && !torrent.downloadSpeed) {
        if (onDone) {
          onDone()
        }
        torrent.destroy()
        if (updateInterval) {
          clearInterval(updateInterval)
          updateInterval = undefined
        }
      }
    }

    torrent.on('upload', update)
    torrent.on('download', update)
    torrent.on('done', () => {
      if (onDone) {
        onDone(torrent.files)
      }
    })
  }

  /**
   * Send a file via WebSockets
   */
  async sendFileSocket({ file, numPeers, onMeta, onSocketProgress }: { 
    file: File, 
    numPeers: number, 
    onMeta?: (meta: FileMeta[]) => void, 
    onSocketProgress?: (data: ProgressInfo) => void 
  }): Promise<void> {
    const reader = file.stream().getReader()
    const transferStatus = {
      peers: Array(numPeers - 1),
      progress: 0.25,
    }
    let sharedSize = 0, progress = 0

    const meta = [{
      name: file.name,
      size: file.size,
      type: file.type,
    }]

    if (onMeta) {
      onMeta(meta)
    }
    
    this.socket.send(constants.FILE_INIT, {
      sender: this.socket.name,
      size: file.size,
      meta,
    })

    return new Promise<void>((resolve) => {
      const stream = async () => {
        const { done, value } = await reader.read()
        if (done) {
          this.socket.off(constants.FILE_STATUS)
          this.socket.send(constants.FILE_INIT, {
            end: true,
          })
          resolve()
          return
        }

        this.socket.send(constants.CHUNK, value.buffer)
        sharedSize += value.byteLength
        progress = sharedSize / file.size

        if (onSocketProgress) {
          onSocketProgress({ progress })
        }

        if (transferStatus.peers.length === numPeers - 1 && progress < transferStatus.progress) {
          setTimeout(stream, 1)
        }
      }

      this.socket.listen(constants.FILE_STATUS, (data: unknown) => {
        if (!data || typeof data !== 'object') return
        
        const statusData = data as { peer: string, progress: number }
        
        if (statusData.progress !== transferStatus.progress) {
          transferStatus.progress = statusData.progress
          transferStatus.peers = [statusData.peer]
        } else {
          transferStatus.peers.push(statusData.peer)
        }
        
        stream()
      })

      stream()
    })
  }

  /**
   * Send files using either WebTorrent or WebSocket
   */
  async sendFiles({ 
    numPeers, 
    input, 
    useTorrent, 
    onMeta, 
    onSocketProgress, 
    onTorrentProgress, 
    onDone 
  }: { 
    numPeers: number, 
    input: FileList | File[], 
    useTorrent: boolean, 
    onMeta?: (meta: FileMeta[]) => void, 
    onSocketProgress?: (data: ProgressInfo) => void, 
    onTorrentProgress?: (data: TorrentProgressInfo) => void, 
    onDone?: () => void 
  }): Promise<void> {
    if (!input || input.length === 0) return

    if (useTorrent) {
      // Ensure client is ready
      if (!this.isReady) {
        await this.initClient()
      }
      
      const inputMap: Record<string, File> = {}
      let totalSize = 0
      const files = Array.from(input)
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        inputMap[file.name + file.size] = file
        totalSize += file.size
      }

      if (totalSize > constants.TORRENT_SIZE_LIMIT) {
        throw new Error(constants.ERR_LARGE_FILE)
      } else if (totalSize > 70000000) { // 70MB
        toast({
          title: 'Large file transfer',
          description: `File${pluralize(files.length, ' is', 's are')} large, transfer may take a long time`
        })
      }

      this.torrentClient.seed(files, TRACKERS, (torrent: Torrent) => {
        this._onTorrent({
          torrent,
          onProgress: onTorrentProgress,
          onDone,
        })

        const filesMeta = torrent.files.map((file: TorrentFile) => ({
          name: file.name,
          size: file.length,
          type: inputMap[file.name + file.length]?.type || 'application/octet-stream',
        }))

        if (onMeta) {
          onMeta(filesMeta)
        }
        
        this.socket.send(constants.FILE_TORRENT, {
          infoHash: torrent.infoHash,
          sender: this.socket.name,
          size: torrent.length,
          meta: filesMeta,
        })
      })
    } else {
      const files = Array.from(input)

      for (const file of files) {
        if (file.size > constants.WS_SIZE_LIMIT) {
          throw new Error(constants.ERR_LARGE_FILE)
        }
        await this.sendFileSocket({ file, numPeers, onMeta, onSocketProgress })
      }
      
      if (onDone) {
        onDone()
      }
    }
  }
}

export default FileShare 