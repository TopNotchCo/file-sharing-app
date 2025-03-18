"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { useToast } from './use-toast'
import { createWebTorrentClient } from '@/lib/webtorrent-client'

// Interface for our shared file state
export interface SharedFile {
  name: string
  size: number
  type: string
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  status: 'downloading' | 'seeding' | 'error' | 'done'
  magnetURI?: string
  hash?: string
}

export interface TorrentProgress {
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  numPeers: number
}

// Define runtime WebTorrent types for internal use
interface WebTorrentRuntimeFile {
  name: string
  path: string
  length: number
  type?: string
  getBlobURL?(callback: (err: Error | null, url?: string) => void): void
  createReadStream?(): NodeJS.ReadableStream
}

interface WebTorrentRuntimeTorrent {
  infoHash: string
  magnetURI: string
  files: WebTorrentRuntimeFile[]
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

// Interface for the WebTorrent client
interface WebTorrentClient {
  ready: boolean
  seed(files: File[], opts: object, callback: (torrent: WebTorrentRuntimeTorrent) => void): void
  add(magnetURI: string, opts: object, callback: (torrent: WebTorrentRuntimeTorrent) => void): void
  on(event: string, callback: (arg?: unknown) => void): void
  once(event: string, callback: (arg?: unknown) => void): void
  destroy(callback?: () => void): void
  torrents?: WebTorrentRuntimeTorrent[]
}

export function useWebTorrent() {
  const [isConnected, setIsConnected] = useState(false)
  const clientRef = useRef<WebTorrentClient | null>(null)
  const isInitializingRef = useRef(false)
  const isDestroyingRef = useRef(false)
  const { toast } = useToast()
  const [files, setFiles] = useState<SharedFile[]>([])
  const isBrowser = typeof window !== 'undefined'

  // Safe cleanup function
  const cleanupClient = useCallback(() => {
    return new Promise<void>((resolve) => {
      // Only run on client
      if (!isBrowser) {
        resolve()
        return
      }
      
      const client = clientRef.current
      if (!client || isDestroyingRef.current) {
        resolve()
        return
      }

      try {
        isDestroyingRef.current = true
        client.destroy(() => {
          clientRef.current = null
          isDestroyingRef.current = false
          resolve()
        })
      } catch (error) {
        console.warn('Error during client cleanup:', error)
        clientRef.current = null
        isDestroyingRef.current = false
        resolve()
      }
    })
  }, [isBrowser])

  // Initialize WebTorrent client
  const initializeClient = useCallback(async () => {
    if (isInitializingRef.current) return
    if (!isBrowser) return

    try {
      isInitializingRef.current = true
      
      // Cleanup existing client
      await cleanupClient()

      // Create new client
      const client = await createWebTorrentClient()
      
      clientRef.current = client as unknown as WebTorrentClient

      client.on('error', (err: unknown) => {
        console.error('WebTorrent client error:', err)
        toast({
          title: "Connection error",
          description: "Trying to reconnect...",
          variant: "destructive"
        })
      })

      const checkReady = () => {
        if (client.ready) {
          setIsConnected(true)
          toast({
            title: "Connected successfully",
            description: "Ready to share files",
          })
        }
      }
      
      checkReady()
      client.once('ready', checkReady)
    } catch (error) {
      console.error('Failed to initialize WebTorrent:', error)
      toast({
        title: "Connection failed",
        description: "Could not initialize file sharing",
        variant: "destructive"
      })
    } finally {
      isInitializingRef.current = false
    }
  }, [cleanupClient, isBrowser, toast])

  useEffect(() => {
    // Don't run on server
    if (!isBrowser) return
    
    // Initialize client on mount
    initializeClient()

    return () => {
      cleanupClient()
    }
  }, [toast, cleanupClient, isBrowser, initializeClient])

  // Share files
  const shareFiles = useCallback(async (selectedFiles: File[]) => {
    // Don't run on server
    if (!isBrowser) return
    
    // Ensure client is initialized
    if (!clientRef.current) {
      if (isInitializingRef.current) {
        console.log('Client initializing, waiting...')
        // Wait for initialization to complete
        await new Promise<void>(resolve => {
          const checkInterval = setInterval(() => {
            if (clientRef.current && !isInitializingRef.current) {
              clearInterval(checkInterval)
              resolve()
            }
          }, 100)
        })
      } else {
        console.log('Client not initialized, initializing now...')
        await initializeClient()
      }
      
      // Double check client is available
      if (!clientRef.current) {
        throw new Error('Failed to initialize WebTorrent client')
      }
    }

    try {
      const client = clientRef.current
      console.log('Client ready, creating torrent from files:', selectedFiles.map(f => f.name).join(', '))

      // Create a new torrent from the files
      client.seed(selectedFiles, {
        announce: [
          'wss://tracker.openwebtorrent.com',
          'wss://tracker.webtorrent.dev',
          'wss://tracker.novage.com.ua'
        ]
      }, (torrent: WebTorrentRuntimeTorrent) => {
        console.log('Client is seeding:', torrent.infoHash)
        console.log('Magnet URI generated:', torrent.magnetURI)

        // Check if we already have files with this hash to prevent duplicates
        const existingFileIndex = files.findIndex(file => 
          file.hash && file.hash.startsWith(torrent.infoHash)
        )

        if (existingFileIndex >= 0) {
          console.log('Files already being seeded, updating status')
          
          // Update existing files instead of adding new ones
          setFiles(prev => 
            prev.map(f => 
              f.hash && f.hash.startsWith(torrent.infoHash)
                ? {
                    ...f,
                    uploadSpeed: torrent.uploadSpeed || 0,
                    progress: 100,
                    status: 'seeding' as const,
                    magnetURI: torrent.magnetURI // Ensure the magnet URI is set
                  }
                : f
            )
          )
        } else {
          // Add new files to state
          const newFiles = selectedFiles.map((file, index) => {
            const fileObj = {
              name: file.name,
              size: file.size,
              type: file.type,
              progress: 100,
              downloadSpeed: 0,
              uploadSpeed: torrent.uploadSpeed || 0,
              status: 'seeding' as const,
              magnetURI: torrent.magnetURI,
              hash: `${torrent.infoHash}-${index}`,
            }
            
            console.log(`Created file object with hash ${fileObj.hash} and magnet ${fileObj.magnetURI?.substring(0, 30)}...`)
            return fileObj
          })

          setFiles(prev => {
            const result = [...prev, ...newFiles]
            console.log('Updated files state with', newFiles.length, 'new files, total:', result.length)
            return result
          })
        }

        // Update progress - use an efficient approach
        let lastUpdate = Date.now()
        const interval = setInterval(() => {
          const now = Date.now()
          // Only update every 1 second and when changes are significant
          if (now - lastUpdate >= 1000) {
            lastUpdate = now
            
            setFiles(prev => {
              const needsUpdate = prev.some(f => 
                f.hash && 
                f.hash.startsWith(torrent.infoHash) && 
                (
                  Math.abs(f.uploadSpeed - (torrent.uploadSpeed || 0)) > 1000 || // 1KB/s change
                  f.status !== (torrent.done ? 'done' : 'seeding')
                )
              )
              
              if (!needsUpdate) return prev; // Skip update if no significant changes
              
              return prev.map(f => 
                f.hash && f.hash.startsWith(torrent.infoHash)
                  ? {
                      ...f,
                      uploadSpeed: torrent.uploadSpeed || 0,
                      status: torrent.done ? 'done' as const : 'seeding' as const
                    }
                  : f
              )
            })
          }
        }, 250) // Check more frequently but update less frequently

        // Prevent garbage collection of torrent
        // @ts-expect-error - Adding property to window for debugging
        window.__debugTorrent = torrent

        // Cleanup interval when torrent is done
        torrent.on('done', () => {
          clearInterval(interval)
          console.log('Torrent is done seeding')
        })
      })

    } catch (err) {
      console.error('Error sharing files:', err)
      toast({
        title: 'Error',
        description: 'Failed to share files. Please try again.',
        variant: 'destructive',
      })
      throw err // Re-throw to allow caller to handle
    }
  }, [files, isBrowser, toast, initializeClient])

  // Download files from magnet URI
  const downloadFiles = useCallback(async (magnetURI: string) => {
    // Don't run on server
    if (!isBrowser) return
    if (!clientRef.current) return

    try {
      const client = clientRef.current
      
      // Extract infoHash from magnetURI to check for duplicates
      // Magnet URIs contain the infoHash in the format: xt=urn:btih:INFOHASH
      const infoHashMatch = magnetURI.match(/xt=urn:btih:([a-f0-9]+)/i)
      const infoHash = infoHashMatch ? infoHashMatch[1].toLowerCase() : null
      
      // Check if we already have this torrent in our files list
      if (infoHash) {
        const existingFile = files.find(file => file.hash?.startsWith(infoHash))
        if (existingFile) {
          toast({
            title: 'Already processing',
            description: `The file "${existingFile.name}" is already ${existingFile.status === 'seeding' ? 'being shared' : 'downloading'}.`,
          })
          return
        }
        
        try {
          // Check if the client already has this torrent
          // This is a safer way to prevent duplicate torrent errors
          if (client.torrents && Array.isArray(client.torrents)) {
            const existingTorrent = client.torrents.find(t => t.infoHash === infoHash);
            if (existingTorrent) {
              toast({
                title: 'Already downloading',
                description: 'This torrent is already being processed by the client.',
              })
              return
            }
          }
        } catch (err) {
          console.error('Error checking existing torrents:', err)
        }
      }

      client.add(magnetURI, {
        announce: [
          'wss://tracker.openwebtorrent.com',
          'wss://tracker.webtorrent.dev',
          'wss://tracker.novage.com.ua'
        ]
      }, (torrent: WebTorrentRuntimeTorrent) => {
        console.log('Client is downloading:', torrent.infoHash)

        // Add files to state
        const newFiles = torrent.files.map((file: WebTorrentRuntimeFile, index) => ({
          name: file.name,
          size: file.length,
          type: file.type || 'application/octet-stream',
          progress: 0,
          downloadSpeed: 0,
          uploadSpeed: 0,
          status: 'downloading' as const,
          hash: `${torrent.infoHash}-${index}`,
        }))

        setFiles(prev => [...prev, ...newFiles])

        // Update progress with more efficient approach
        let lastUpdate = Date.now()
        const interval = setInterval(() => {
          const now = Date.now()
          // Only update every 1 second or when done
          if (now - lastUpdate >= 1000 || torrent.done) {
            lastUpdate = now
            
            setFiles(prev => {
              // Check if update is needed
              const needsUpdate = prev.some(f => 
                f.hash && 
                f.hash.startsWith(torrent.infoHash) && 
                (
                  Math.abs(f.progress - (torrent.progress || 0) * 100) > 1 || // 1% progress change
                  Math.abs(f.downloadSpeed - (torrent.downloadSpeed || 0)) > 1000 || // 1KB/s change
                  f.status !== (torrent.done ? 'done' : 'downloading')
                )
              )
              
              if (!needsUpdate) return prev; // Skip update if no significant changes
              
              return prev.map(f =>
                f.hash && f.hash.startsWith(torrent.infoHash)
                  ? {
                      ...f,
                      progress: (torrent.progress || 0) * 100,
                      downloadSpeed: torrent.downloadSpeed || 0,
                      uploadSpeed: torrent.uploadSpeed || 0,
                      status: torrent.done ? 'done' : 'downloading'
                    }
                  : f
              )
            })
          }
        }, 250) // Check frequently but update less frequently

        // Handle download completion
        torrent.on('done', () => {
          clearInterval(interval)
          console.log('Download complete')
          
          // Save files
          torrent.files.forEach((file: WebTorrentRuntimeFile) => {
            // Check if getBlobURL exists, otherwise use a fallback
            if (typeof file.getBlobURL === 'function') {
              file.getBlobURL((err: Error | null, url?: string) => {
                if (err || !url) {
                  console.error('Error getting blob URL:', err)
                  return
                }
                
                // Create download link
                const a = document.createElement('a')
                a.download = file.name
                a.href = url
                a.click()
                
                // Cleanup
                URL.revokeObjectURL(url)
              })
            } else {
              console.log('getBlobURL method not found, using fallback for downloading', file.name)
              
              // Fallback: use createReadStream if available
              try {
                if (typeof file.createReadStream === 'function') {
                  const stream = file.createReadStream()
                  const chunks: Uint8Array[] = []
                  
                  stream.on('data', (chunk: Uint8Array) => {
                    chunks.push(chunk)
                  })
                  
                  stream.on('end', () => {
                    try {
                      // Combine chunks into a single Uint8Array
                      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
                      const fullBuffer = new Uint8Array(totalLength)
                      let offset = 0
                      
                      for (const chunk of chunks) {
                        fullBuffer.set(chunk, offset)
                        offset += chunk.length
                      }
                      
                      // Create blob and download
                      const blob = new Blob([fullBuffer], { type: file.type || 'application/octet-stream' })
                      const url = URL.createObjectURL(blob)
                      
                      const a = document.createElement('a')
                      a.download = file.name
                      a.href = url
                      a.click()
                      
                      // Cleanup
                      URL.revokeObjectURL(url)
                      
                      console.log('Successfully downloaded file using fallback method:', file.name)
                    } catch (streamErr) {
                      console.error('Error in stream processing:', streamErr)
                      toast({
                        title: 'Download Error',
                        description: `Could not download ${file.name}. Please try a different browser.`,
                        variant: 'destructive',
                      })
                    }
                  })
                  
                  stream.on('error', (streamErr: Error) => {
                    console.error('Error in file stream:', streamErr)
                  })
                } else {
                  console.error('No compatible download method available for file:', file.name)
                  toast({
                    title: 'Download Error',
                    description: `Could not download ${file.name}. WebTorrent compatibility issue.`,
                    variant: 'destructive',
                  })
                }
              } catch (err) {
                console.error('Error in fallback download method:', err)
                toast({
                  title: 'Download Error',
                  description: `Failed to download ${file.name}. Please try again.`,
                  variant: 'destructive',
                })
              }
            }
          })
        })
      })

    } catch (err) {
      console.error('Error downloading files:', err)
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to download files. Please try again.',
        variant: 'destructive',
      })
    }
  }, [isBrowser, toast, files])

  return {
    isConnected,
    files,
    shareFiles,
    downloadFiles,
  }
} 