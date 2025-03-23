/* eslint-disable @typescript-eslint/ban-ts-comment */
"use client"

// Import WebTorrent types for type checking
import type WebTorrent from 'webtorrent'
import { toast } from '@/hooks/use-toast'
import constants from './constants'
import Socket from './socket'

// @ts-expect-error: This path exists in webtorrent but not in @types/webtorrent
import _WT from 'webtorrent/dist/webtorrent.min.js'

// Cast the imported module to the WebTorrent type
const WebTorrentConstructor = _WT as typeof WebTorrent

// Define logger with timestamps and different levels
const logger = {
  debug: (...args: unknown[]) => console.debug(`[${new Date().toISOString()}] [DEBUG] FileShare:`, ...args),
  info: (...args: unknown[]) => console.info(`[${new Date().toISOString()}] [INFO] FileShare:`, ...args),
  warn: (...args: unknown[]) => console.warn(`[${new Date().toISOString()}] [WARN] FileShare:`, ...args),
  error: (...args: unknown[]) => console.error(`[${new Date().toISOString()}] [ERROR] FileShare:`, ...args),
  perf: (...args: unknown[]) => console.info(`[${new Date().toISOString()}] [PERF] FileShare:`, ...args)
}

// Performance monitoring helper
const measurePerf = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
  const start = performance.now()
  try {
    const result = await fn()
    const duration = performance.now() - start
    logger.perf(`${name} completed in ${duration.toFixed(2)}ms`)
    return result
  } catch (error) {
    const duration = performance.now() - start
    logger.error(`${name} failed after ${duration.toFixed(2)}ms:`, error)
    throw error
  }
}

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

// Simple tracker configuration that works reliably
const trackers = {
  announce: [
    'wss://tracker.btorrent.xyz', 
    'wss://tracker.openwebtorrent.com', 
    'wss://tracker.webtorrent.dev'
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
 * FileShare class for managing file transfers
 */
export class FileShare {
  private socket: Socket
  private torrentClient: WebTorrentClient
  private isReady: boolean = false
  private startTime: number = Date.now()

  constructor(socket: Socket) {
    logger.info('Initializing FileShare instance')
    this.socket = socket
    this.torrentClient = {} as WebTorrentClient
    
    // Initialize client asynchronously
    this.initClient()
  }
  
  private async initClient(): Promise<void> {
    try {
      logger.info('Initializing WebTorrent client')
      const initStart = performance.now()

      // Create WebTorrent client using the bundled distribution
      this.torrentClient = new WebTorrentConstructor({
        tracker: {
          ...trackers,
          rtcConfig: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19305' },
              { urls: 'stun:stun1.l.google.com:19305' }
            ]
          }
        }
      }) as unknown as WebTorrentClient

      // Log client events
      this.torrentClient.on('error', (err) => {
        logger.error('WebTorrent client error:', err)
      })

      this.torrentClient.on('warning', (warn) => {
        logger.warn('WebTorrent client warning:', warn)
      })

      this.isReady = true
      const initDuration = performance.now() - initStart
      logger.info(`WebTorrent client initialized successfully in ${initDuration.toFixed(2)}ms`)
      logger.debug('Client configuration:', {
        peerId: this.torrentClient.peerId,
        webRTCSupport: this.torrentClient.WEBRTC_SUPPORT,
        trackers: trackers.announce
      })
    } catch (err) {
      logger.error('Failed to initialize WebTorrent client:', err)
      throw new Error('Failed to initialize WebTorrent client')
    }
  }

  /**
   * Check if WebRTC is supported
   */
  get isWebRTC(): boolean {
    const supported = !!WebTorrentConstructor.WEBRTC_SUPPORT
    logger.debug(`WebRTC support: ${supported}`)
    return supported
  }
  
  /**
   * Get the WebTorrent peer ID
   */
  getPeerId(): string | null {
    const peerId = this.isReady && this.torrentClient ? this.torrentClient.peerId : null
    logger.debug(`Current peer ID: ${peerId}`)
    return peerId
  }

  /**
   * Listen for incoming files and handle download
   */
  receiveFiles({ onMeta, onProgress, onDone }: ProgressCallback): () => void {
    logger.info('Setting up file reception handlers')
    let metaData: { meta?: FileMeta[], size?: number } = {}
    let lastProgressLog = 0

    // Handle WebTorrent transfers
    this.socket.listen(constants.FILE_TORRENT, (data: unknown) => {
      logger.info('Received WebTorrent transfer request')
      if (!data || typeof data !== 'object') {
        logger.warn('Invalid torrent data received:', data)
        return
      }
      
      const torrentData = data as { infoHash: string, meta: FileMeta[], size: number, sender: string }
      const { infoHash, ...rest } = torrentData
      
      logger.debug('Torrent metadata:', {
        infoHash,
        size: rest.size,
        fileCount: rest.meta.length,
        sender: rest.sender
      })

      if (onMeta) {
        metaData = rest
        onMeta(rest)
      }

      if (!this.isReady) {
        logger.error('WebTorrent client not ready for transfer')
        return
      }

      logger.info(`Adding torrent with infoHash: ${infoHash}`)
      this.torrentClient.add(infoHash, trackers, (torrent: Torrent) => {
        logger.info(`Torrent added successfully, beginning download`)
        this._onTorrent({ torrent, onProgress, onDone })
      })
    })

    // Handle WebSocket transfers
    let fileParts: ArrayBuffer[] = []
    let size = 0, statProg = 0.25
    
    this.socket.listen(constants.FILE_INIT, (data: unknown) => {
      logger.info('Received WebSocket file init')
      if (!data || typeof data !== 'object') {
        logger.warn('Invalid file init data:', data)
        return
      }
      
      const fileData = data as { end?: boolean, meta?: FileMeta[], size?: number, sender?: string }
      
      if (fileData.end) {
        logger.info('File transfer complete signal received')
        if (fileParts.length && metaData.size && onDone) {
          logger.info(`Assembling final blob from ${fileParts.length} parts`)
          onDone(new Blob(fileParts), metaData.meta?.[0])
          fileParts = []
          size = 0
          statProg = 0.25
        }
      } else {
        logger.info('New file transfer starting', {
          sender: fileData.sender,
          size: fileData.size,
          fileCount: fileData.meta?.length
        })
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

        // Log progress every 10%
        const currentProgress = size / (metaData.size || 1)
        if (currentProgress - lastProgressLog >= 0.1) {
          lastProgressLog = currentProgress
          logger.debug(`Transfer progress: ${(currentProgress * 100).toFixed(1)}%`, {
            receivedSize: size,
            totalSize: metaData.size,
            chunks: fileParts.length,
            speed: `${((size / (Date.now() - this.startTime)) * 1000 / (1024 * 1024)).toFixed(2)} MB/s`
          })
        }

        if (metaData.size) {
          const progress = size / metaData.size

          if (onProgress) {
            onProgress({ progress })
          }

          if (progress >= statProg) {
            logger.debug(`Sending progress status: ${(statProg * 100).toFixed(1)}%`)
            statProg += 0.15
            this.socket.send(constants.FILE_STATUS, {
              progress: statProg,
              peer: this.socket.name,
            })
          }
        }
      } else {
        logger.warn('Received invalid chunk data type:', typeof data)
      }
    })

    logger.info('File reception handlers setup complete')
    return () => {
      logger.info('Cleaning up file reception handlers')
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
    logger.info('Setting up torrent event handlers', {
      infoHash: torrent.infoHash,
      size: torrent.length,
      fileCount: torrent.files.length
    })

    let updateInterval: NodeJS.Timeout | undefined
    let lastProgressLog = 0
    const startTime = Date.now()

    const update = () => {
      const progress = torrent.progress
      const currentTime = Date.now()
      const elapsedSeconds = (currentTime - startTime) / 1000

      // Log detailed progress every 10% or if speed changes significantly
      if (progress - lastProgressLog >= 0.1) {
        lastProgressLog = progress
        logger.debug('Torrent progress update:', {
          progress: `${(progress * 100).toFixed(1)}%`,
          downloadSpeed: `${(torrent.downloadSpeed / (1024 * 1024)).toFixed(2)} MB/s`,
          uploadSpeed: `${(torrent.uploadSpeed / (1024 * 1024)).toFixed(2)} MB/s`,
          peers: torrent.numPeers,
          timeElapsed: `${elapsedSeconds.toFixed(1)}s`,
          estimatedTimeRemaining: progress > 0 ? 
            `${((elapsedSeconds * (1 - progress)) / progress).toFixed(1)}s` : 
            'calculating...'
        })
      }

      if (onProgress) {
        onProgress(torrent)
      }

      if (!updateInterval) {
        updateInterval = setInterval(update, 500)
      }

      if (!torrent.uploadSpeed && !torrent.downloadSpeed) {
        logger.info('Torrent transfer complete', {
          totalTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
          finalSize: `${(torrent.length / (1024 * 1024)).toFixed(2)} MB`
        })
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

    torrent.on('upload', () => {
      logger.debug('Upload event:', {
        speed: `${(torrent.uploadSpeed / (1024 * 1024)).toFixed(2)} MB/s`,
        peers: torrent.numPeers
      })
      update()
    })

    torrent.on('download', () => {
      logger.debug('Download event:', {
        speed: `${(torrent.downloadSpeed / (1024 * 1024)).toFixed(2)} MB/s`,
        peers: torrent.numPeers
      })
      update()
    })

    torrent.on('done', () => {
      logger.info('Torrent download complete', {
        files: torrent.files.map(f => ({ name: f.name, size: f.length })),
        totalTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`
      })
      if (onDone) {
        onDone(torrent.files)
      }
    })

    torrent.on('error', (err) => {
      logger.error('Torrent error:', err)
    })

    torrent.on('warning', (warn) => {
      logger.warn('Torrent warning:', warn)
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
    logger.info('Starting WebSocket file transfer', {
      fileName: file.name,
      fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      numPeers
    })

    const reader = file.stream().getReader()
    const transferStatus = {
      peers: Array(numPeers - 1),
      progress: 0.25,
    }
    let sharedSize = 0, progress = 0
    const startTime = Date.now()
    let lastProgressLog = 0

    const meta = [{
      name: file.name,
      size: file.size,
      type: file.type,
    }]

    if (onMeta) {
      onMeta(meta)
    }
    
    logger.debug('Sending file init message', { meta })
    this.socket.send(constants.FILE_INIT, {
      sender: this.socket.name,
      size: file.size,
      meta,
    })

    return new Promise<void>((resolve) => {
      const stream = async () => {
        const { done, value } = await reader.read()
        if (done) {
          const totalTime = (Date.now() - startTime) / 1000
          logger.info('File transfer complete', {
            fileName: file.name,
            totalSize: `${(sharedSize / (1024 * 1024)).toFixed(2)} MB`,
            totalTime: `${totalTime.toFixed(1)}s`,
            averageSpeed: `${((sharedSize / totalTime) / (1024 * 1024)).toFixed(2)} MB/s`
          })
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

        // Log progress every 10%
        if (progress - lastProgressLog >= 0.1) {
          lastProgressLog = progress
          const currentTime = Date.now()
          const elapsedSeconds = (currentTime - startTime) / 1000
          logger.debug('Transfer progress:', {
            progress: `${(progress * 100).toFixed(1)}%`,
            speed: `${((sharedSize / elapsedSeconds) / (1024 * 1024)).toFixed(2)} MB/s`,
            timeElapsed: `${elapsedSeconds.toFixed(1)}s`,
            estimatedTimeRemaining: progress > 0 ? 
              `${((elapsedSeconds * (1 - progress)) / progress).toFixed(1)}s` : 
              'calculating...'
          })
        }

        if (onSocketProgress) {
          onSocketProgress({ progress })
        }

        if (transferStatus.peers.length === numPeers - 1 && progress < transferStatus.progress) {
          setTimeout(stream, 1)
        }
      }

      this.socket.listen(constants.FILE_STATUS, (data: unknown) => {
        if (!data || typeof data !== 'object') {
          logger.warn('Invalid status data received:', data)
          return
        }
        
        const statusData = data as { peer: string, progress: number }
        logger.debug('Received peer status update', statusData)
        
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
    logger.info('Starting file send operation', {
      numFiles: input.length,
      useTorrent,
      numPeers
    })

    if (!input || input.length === 0) {
      logger.warn('No files provided for sending')
      return
    }

    if (useTorrent) {
      return measurePerf('torrent-send', async () => {
        // Ensure client is ready
        if (!this.isReady) {
          logger.info('WebTorrent client not ready, initializing...')
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

        logger.debug('File analysis complete', {
          fileCount: files.length,
          totalSize: `${(totalSize / (1024 * 1024)).toFixed(2)} MB`,
          types: files.map(f => f.type)
        })

        if (totalSize > constants.TORRENT_SIZE_LIMIT) {
          logger.error('File size exceeds torrent limit', {
            size: totalSize,
            limit: constants.TORRENT_SIZE_LIMIT
          })
          throw new Error(constants.ERR_LARGE_FILE)
        } else if (totalSize > 70000000) { // 70MB
          logger.warn('Large file transfer initiated', {
            size: `${(totalSize / (1024 * 1024)).toFixed(2)} MB`
          })
          toast({
            title: 'Large file transfer',
            description: `File${pluralize(files.length, ' is', 's are')} large, transfer may take a long time`
          })
        }

        this.torrentClient.seed(files, trackers, (torrent: Torrent) => {
          logger.info('Started seeding torrent', {
            infoHash: torrent.infoHash,
            numFiles: torrent.files.length,
            totalSize: `${(torrent.length / (1024 * 1024)).toFixed(2)} MB`
          })

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
          
          logger.debug('Sending torrent info to peers', {
            infoHash: torrent.infoHash,
            fileCount: filesMeta.length
          })
          this.socket.send(constants.FILE_TORRENT, {
            infoHash: torrent.infoHash,
            sender: this.socket.name,
            size: torrent.length,
            meta: filesMeta,
          })
        })
      })
    } else {
      return measurePerf('websocket-send', async () => {
        const files = Array.from(input)
        logger.info('Starting WebSocket transfer', {
          fileCount: files.length,
          totalSize: `${(files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(2)} MB`
        })

        for (const file of files) {
          if (file.size > constants.WS_SIZE_LIMIT) {
            logger.error('File size exceeds WebSocket limit', {
              fileName: file.name,
              size: file.size,
              limit: constants.WS_SIZE_LIMIT
            })
            throw new Error(constants.ERR_LARGE_FILE)
          }
          await this.sendFileSocket({ file, numPeers, onMeta, onSocketProgress })
        }
        
        logger.info('All files sent successfully')
        if (onDone) {
          onDone()
        }
      })
    }
  }
}

export default FileShare 