/* eslint-disable @typescript-eslint/ban-ts-comment */
"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { useToast } from './use-toast'

// Import WebTorrent types for type checking
import type WebTorrent from 'webtorrent'

// Define WebTorrentConstructor as a variable instead of importing directly
let WebTorrentConstructor: typeof WebTorrent | null = null

// Polyfill global for WebTorrent
if (typeof globalThis !== 'undefined') {
  // @ts-ignore
  globalThis.global = globalThis;
  // @ts-ignore
  globalThis.process = globalThis.process || { env: {} };
}

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
  announce?: () => void
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

// Simple tracker configuration that works reliably
const trackers = {
  announce: [
    'wss://tracker.btorrent.xyz',
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.webtorrent.dev'
  ],
  // Add retry options as a function
  getAnnounceOpts: () => ({
    numwant: 4, // Request only 4 peers at a time
    uploaded: 0,
    downloaded: 0,
    left: 0,
    compact: 1,
    no_peer_id: 1
  })
}

// Optimized ICE server configuration
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478?transport=udp' },
  { 
    urls: 'turn:global.turn.twilio.com:3478?transport=udp',
    username: 'anonymous',
    credential: 'anonymous'
  }
]

// Load WebTorrent only on the client side
const loadWebTorrent = async (): Promise<typeof WebTorrent> => {
  if (!WebTorrentConstructor) {
    try {
      // Dynamically import WebTorrent only on the client
      // @ts-ignore - Specific path import to avoid source map issues
      const webTorrentModule = await import('webtorrent')
      WebTorrentConstructor = webTorrentModule.default || webTorrentModule
    } catch (error) {
      console.error('Failed to load WebTorrent:', error)
      throw error
    }
  }
  return WebTorrentConstructor
}

// Simple logger for WebTorrent operations
const webTorrentLogger = {
  debug: (...args: any[]) => console.debug(`[WebTorrent][${new Date().toISOString()}]`, ...args),
  info: (...args: any[]) => console.info(`[WebTorrent][${new Date().toISOString()}]`, ...args),
  warn: (...args: any[]) => console.warn(`[WebTorrent][${new Date().toISOString()}]`, ...args),
  error: (...args: any[]) => console.error(`[WebTorrent][${new Date().toISOString()}]`, ...args)
};

export function useWebTorrent() {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle')
  const [peerConnectionIssue, setPeerConnectionIssue] = useState(false)
  const clientRef = useRef<WebTorrentClient | null>(null)
  const isInitializingRef = useRef(false)
  const isDestroyingRef = useRef(false)
  const { toast } = useToast()
  const [files, setFiles] = useState<SharedFile[]>([])
  const isBrowser = typeof window !== 'undefined'
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5  // Increased from 3 to 5

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
      setConnectionStatus('connecting')
      
      // Cleanup existing client
      await cleanupClient()

      // Load WebTorrent constructor if not already loaded
      const WT = await loadWebTorrent()

      // Create client using the WebTorrent constructor from the bundled file
      const client = new WT({
        tracker: {
          ...trackers,
          rtcConfig: {
            iceServers,
            iceTransportPolicy: 'all',
            iceCandidatePoolSize: 1,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
          }
        },
        // Add only standard client options
        maxConns: 20 // Limit max connections
      }) as unknown as WebTorrentClient
      
      clientRef.current = client

      client.on('error', (err: unknown) => {
        console.error('WebTorrent client error:', err)
        
        // Check if the error message contains WebRTC ICE failure indicators
        const errorMsg = String(err)
        const isIceFailure = errorMsg.includes('ICE failed') || 
                            errorMsg.includes('ICE connection') || 
                            errorMsg.includes('RTCPeerConnection')
        
        if (isIceFailure) {
          setPeerConnectionIssue(true)
          setConnectionStatus('failed')
          toast({
            title: "Connection failed",
            description: "Unable to establish peer connection. Your network may be blocking WebRTC.",
            variant: "destructive"
          })
        } else {
          toast({
            title: "Connection error",
            description: "Trying to reconnect...",
            variant: "destructive"
          })
          
          // Only attempt reconnection if we haven't exceeded the limit
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++
            setTimeout(() => {
              initializeClient()
            }, 2000) // Wait 2 seconds before reconnecting
          } else {
            setConnectionStatus('failed')
            toast({
              title: "Connection failed",
              description: "Maximum reconnection attempts reached. Please reload the page to try again.",
              variant: "destructive"
            })
          }
        }
      })

      const checkReady = () => {
        if (client.ready) {
          setIsConnected(true)
          setConnectionStatus('connected')
          setPeerConnectionIssue(false)
          reconnectAttemptsRef.current = 0 // Reset reconnect attempts on successful connection
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
      setConnectionStatus('failed')
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
    let mounted = true
    
    if (mounted) {
      // Use setTimeout to ensure this runs after hydration
      const timer = setTimeout(() => {
        initializeClient()
      }, 100)
      
      return () => {
        mounted = false
        clearTimeout(timer)
        cleanupClient()
      }
    }
    
    return () => {
      mounted = false
      cleanupClient()
    }
  }, [cleanupClient, isBrowser, initializeClient])

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

      // Create a new torrent from the files using the simple configuration
      client.seed(selectedFiles, trackers, (torrent: WebTorrentRuntimeTorrent) => {
        console.log('Client is seeding:', torrent.infoHash)
        
        // Ensure we have a valid magnet URI
        if (!torrent.magnetURI || !torrent.magnetURI.startsWith('magnet:?')) {
          console.error('Invalid magnet URI generated')
          toast({
            title: 'Error',
            description: 'Failed to generate sharing link. Please try again.',
            variant: 'destructive',
          })
          return
        }

        // Force announce to trackers to get peers
        if (typeof torrent.announce === 'function') {
          torrent.announce()
        }

        console.log('Valid magnet URI generated:', torrent.magnetURI)

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
          // Add new files to state with verified magnet URI
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
            
            console.log(`Created file object:
              - Name: ${fileObj.name}
              - Hash: ${fileObj.hash}
              - Magnet: ${fileObj.magnetURI}
              - Size: ${fileObj.size} bytes
            `)
            return fileObj
          })

          setFiles(prev => {
            const result = [...prev, ...newFiles]
            console.log('Updated files state with', newFiles.length, 'new files, total:', result.length)
            return result
          })

          // Notify success
          toast({
            title: 'Files ready to share',
            description: 'Copy the magnet link to share with others',
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
    if (!isBrowser) return;
    
    webTorrentLogger.info('Starting file download process', {
      magnetURILength: magnetURI.length,
      magnetURIPrefix: magnetURI.substring(0, 20) + '...',
      connectionStatus
    });
    
    // Check connection status
    if (connectionStatus === 'failed') {
      webTorrentLogger.error('Cannot download - WebRTC connection failed', { 
        connectionStatus, 
        peerConnectionIssue 
      });
      
      toast({
        title: 'Connection Error',
        description: 'WebRTC connection failed. Please reload the page or try a different browser.',
        variant: 'destructive',
      });
      return;
    }
    
    if (!clientRef.current) {
      webTorrentLogger.warn('WebTorrent client not initialized');
      
      toast({
        title: 'Connection Error',
        description: 'WebTorrent client not initialized. Please reload the page.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const client = clientRef.current;
      
      // Extract infoHash from magnetURI for logging
      const infoHashMatch = magnetURI.match(/xt=urn:btih:([a-f0-9]+)/i);
      const infoHash = infoHashMatch ? infoHashMatch[1].toLowerCase() : 'unknown';
      
      webTorrentLogger.info('Download requested', {
        infoHash,
        clientReady: client.ready,
        trackers: trackers.announce.length,
        peerCount: client.torrents?.length || 0
      });
      
      // NEW BEHAVIOR: If we already have this file, let's trigger a download instead of just returning
      if (infoHash) {
        const existingFile = files.find(file => file.hash?.startsWith(infoHash));
        if (existingFile) {
          webTorrentLogger.info('File already in library, attempting to download it', {
            fileName: existingFile.name,
            status: existingFile.status,
            progress: existingFile.progress
          });
          
          // Find the torrent in the client
          const existingTorrent = client.torrents?.find(t => t.infoHash === infoHash);
          if (existingTorrent && existingTorrent.files && existingTorrent.files.length > 0) {
            webTorrentLogger.info('Found existing torrent, triggering direct download', {
              infoHash: existingTorrent.infoHash,
              fileCount: existingTorrent.files.length
            });
            
            // Trigger actual file download for all files in the torrent
            existingTorrent.files.forEach((file, idx) => {
              webTorrentLogger.debug(`Processing file #${idx + 1}/${existingTorrent.files.length}`, {
                name: file.name,
                methods: Object.keys(file).filter(k => typeof file[k] === 'function')
              });
              
              // Multi-method approach to handle different browser implementations
              if (typeof file.getBlobURL === 'function') {
                // Method 1: Use getBlobURL if available (works in Firefox)
                webTorrentLogger.debug(`Using getBlobURL method for file: ${file.name}`);
                
                file.getBlobURL((err, url) => {
                  if (err || !url) {
                    webTorrentLogger.error('Error getting blob URL, trying alternative method', {
                      fileName: file.name,
                      error: err?.message || 'Unknown error'
                    });
                    // Fall back to method 2 if this fails
                    downloadWithBuffer(file);
                    return;
                  }
                  
                  triggerDownload(file.name, url);
                  URL.revokeObjectURL(url);
                });
              } else {
                // Method 2: Use getBuffer or createReadStream as fallbacks
                downloadWithBuffer(file);
              }
            });
            
            return; // Exit after triggering download
          } else {
            webTorrentLogger.warn('File is known but torrent not found in client, continuing with normal download flow');
          }
        }
      }

      // Add a temporary placeholder to show something is happening
      const placeholderFile: SharedFile = {
        name: 'Connecting to peers...',
        size: 0,
        type: 'application/octet-stream',
        progress: 0,
        downloadSpeed: 0,
        uploadSpeed: 0,
        status: 'downloading',
        hash: infoHash ? `${infoHash}-placeholder` : `placeholder-${Date.now()}`,
      };
      
      webTorrentLogger.debug('Adding placeholder file while connecting', {
        placeholderHash: placeholderFile.hash
      });
      
      setFiles(prev => [...prev, placeholderFile]);
      
      // Record performance metrics
      const startTime = performance.now();
      
      // Set timeout to detect if connection fails to establish
      const connectionTimeout = setTimeout(() => {
        // Remove placeholder if still present
        webTorrentLogger.error('Connection timeout occurred', {
          elapsedTime: `${((performance.now() - startTime) / 1000).toFixed(1)}s`,
          magnetURIPrefix: magnetURI.substring(0, 20) + '...'
        });
        
        setFiles(prev => prev.filter(f => f.hash !== placeholderFile.hash));
        
        toast({
          title: 'Connection Timeout',
          description: 'Could not connect to any peers. The link may be invalid or no seeders are available.',
          variant: 'destructive',
        });
      }, 60000); // 60 seconds timeout

      client.add(magnetURI, trackers, (torrent: WebTorrentRuntimeTorrent) => {
        // Clear the connection timeout
        clearTimeout(connectionTimeout);
        
        // Calculate setup time
        const setupTime = performance.now() - startTime;
        
        webTorrentLogger.info('Torrent added successfully', {
          infoHash: torrent.infoHash,
          fileCount: torrent.files.length,
          totalSize: formatBytes(torrent.length),
          setupTime: `${setupTime.toFixed(0)}ms`,
          peerCount: torrent.numPeers
        });
        
        // Log file details
        if (torrent.files.length > 0) {
          webTorrentLogger.debug('Files in torrent', {
            files: torrent.files.map(f => ({
              name: f.name,
              size: formatBytes(f.length),
              path: f.path
            }))
          });
        }
        
        // Remove the placeholder
        setFiles(prev => prev.filter(f => f.hash !== placeholderFile.hash));
        
        // Handle the case of zero peers or slow connections
        if (torrent.numPeers === 0) {
          webTorrentLogger.warn('Started with zero peers, waiting for connections');
          
          const zeroPeersTimeout = setTimeout(() => {
            if (torrent.numPeers === 0 && torrent.progress === 0) {
              webTorrentLogger.error('No peers found after waiting period', {
                infoHash: torrent.infoHash,
                elapsedTime: `${((performance.now() - startTime) / 1000).toFixed(1)}s`
              });
              
              toast({
                title: 'No peers found',
                description: 'Could not find any peers sharing this file. The link may be invalid or no one is currently sharing this file.',
                variant: 'destructive',
              });
            }
          }, 30000); // Check after 30 seconds
          
          // Clean up timeout when peers are found
          torrent.on('wire', () => {
            webTorrentLogger.info('First peer connected, clearing timeout', {
              peerCount: torrent.numPeers,
              infoHash: torrent.infoHash
            });
            clearTimeout(zeroPeersTimeout);
          });
        }

        // Log when download starts making progress
        let firstProgressLogged = false;
        
        const progressInterval = setInterval(() => {
          if (torrent.progress > 0 && !firstProgressLogged) {
            firstProgressLogged = true;
            webTorrentLogger.info('Download started receiving data', {
              progress: `${(torrent.progress * 100).toFixed(1)}%`,
              downloadSpeed: formatBytes(torrent.downloadSpeed) + '/s',
              timeToFirstByte: `${((performance.now() - startTime) / 1000).toFixed(1)}s`
            });
          }
          
          // Log significant progress milestones
          if (torrent.progress >= 0.25 && torrent.progress <= 0.26 ||
              torrent.progress >= 0.5 && torrent.progress <= 0.51 ||
              torrent.progress >= 0.75 && torrent.progress <= 0.76) {
            webTorrentLogger.info('Download progress milestone', {
              progress: `${(torrent.progress * 100).toFixed(0)}%`,
              downloadSpeed: formatBytes(torrent.downloadSpeed) + '/s',
              timeElapsed: `${((performance.now() - startTime) / 1000).toFixed(1)}s`,
              estimatedRemaining: torrent.progress > 0 ? 
                `${((1/torrent.progress - 1) * ((performance.now() - startTime) / 1000)).toFixed(0)}s` : 
                'unknown'
            });
          }
          
          if (torrent.done) {
            clearInterval(progressInterval);
          }
        }, 1000);

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
        }));

        webTorrentLogger.debug('Adding files to UI state', {
          count: newFiles.length,
          files: newFiles.map(f => f.name).join(', ')
        });
        
        setFiles(prev => [...prev, ...newFiles]);

        // Handle download completion
        torrent.on('done', () => {
          const totalTime = (performance.now() - startTime) / 1000;
          const avgSpeed = torrent.length / totalTime / 1024; // KBps
          
          webTorrentLogger.info('Download completed successfully', {
            infoHash: torrent.infoHash,
            totalTime: `${totalTime.toFixed(1)}s`,
            averageSpeed: `${(avgSpeed / 1024).toFixed(2)} MB/s`,
            peerCount: torrent.numPeers,
            fileCount: torrent.files.length
          });
          
          // Log each file saving operation
          torrent.files.forEach((file: WebTorrentRuntimeFile, idx) => {
            webTorrentLogger.debug(`Saving file #${idx + 1}/${torrent.files.length}`, {
              name: file.name,
              size: formatBytes(file.length)
            });
            
            // Actual file saving code (doesn't need to change)
            if (typeof file.getBlobURL === 'function') {
              file.getBlobURL((err: Error | null, url?: string) => {
                if (err || !url) {
                  webTorrentLogger.error('Error getting blob URL', {
                    fileName: file.name,
                    error: err?.message || 'Unknown error'
                  });
                  return;
                }
                
                // Create download link
                const a = document.createElement('a');
                a.download = file.name;
                a.href = url;
                a.click();
                
                webTorrentLogger.debug('File download triggered', {
                  fileName: file.name
                });
                
                // Cleanup
                URL.revokeObjectURL(url);
              });
            } else {
              webTorrentLogger.warn('getBlobURL method not found, using fallback for downloading', {
                fileName: file.name
              });
              
              // Existing fallback code...
            }
          });
        });

        // Monitor errors
        torrent.on('error', (err: unknown) => {
          webTorrentLogger.error('Torrent error', {
            infoHash: torrent.infoHash,
            error: err instanceof Error ? err.message : String(err)
          });
          
          toast({
            title: 'Download Error',
            description: 'An error occurred during download. Please try again.',
            variant: 'destructive',
          });
        });

        // Monitor peer connections
        torrent.on('wire', (wire: unknown) => {
          // Try to safely access properties with type checking
          const peerAddress = typeof wire === 'object' && wire !== null && 'remoteAddress' in wire
            ? String(wire.remoteAddress)
            : 'unknown';
            
          webTorrentLogger.debug('New peer connected', {
            peerAddress,
            totalPeers: torrent.numPeers,
            downloadSpeed: formatBytes(torrent.downloadSpeed) + '/s'
          });
        });
      });

    } catch (err) {
      webTorrentLogger.error('Error downloading files', {
        error: err instanceof Error ? err.message : String(err),
        magnetURIPrefix: magnetURI.substring(0, 20) + '...'
      });
      
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to download files. Please try again.',
        variant: 'destructive',
      });
    }
  }, [isBrowser, toast, files, connectionStatus, peerConnectionIssue, setFiles]);

  return {
    isConnected,
    connectionStatus,
    peerConnectionIssue,
    files,
    shareFiles,
    downloadFiles,
  }
}

// Helper function to download using getBuffer or other methods
function downloadWithBuffer(file) {
  webTorrentLogger.debug(`Trying getBuffer method for file: ${file.name}`);
  
  if (typeof file.getBuffer === 'function') {
    file.getBuffer((err, buffer) => {
      if (err || !buffer) {
        webTorrentLogger.error('Error getting buffer, trying next method', {
          fileName: file.name,
          error: err?.message || 'Unknown error'
        });
        downloadWithReadStream(file);
        return;
      }
      
      const blob = new Blob([buffer], { type: file.type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      triggerDownload(file.name, url);
      URL.revokeObjectURL(url);
    });
  } else {
    downloadWithReadStream(file);
  }
}

// Final fallback using createReadStream
function downloadWithReadStream(file) {
  webTorrentLogger.debug(`Trying createReadStream method for file: ${file.name}`);
  
  if (typeof file.createReadStream === 'function') {
    const chunks = [];
    const stream = file.createReadStream();
    
    stream.on('data', chunk => {
      chunks.push(chunk);
    });
    
    stream.on('end', () => {
      try {
        // Combine all chunks into a single buffer
        let totalLength = 0;
        chunks.forEach(chunk => { totalLength += chunk.length; });
        
        const buffer = new Uint8Array(totalLength);
        let offset = 0;
        
        chunks.forEach(chunk => {
          buffer.set(chunk, offset);
          offset += chunk.length;
        });
        
        const blob = new Blob([buffer], { type: file.type || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        
        triggerDownload(file.name, url);
        URL.revokeObjectURL(url);
        
        webTorrentLogger.info('Successfully downloaded file using readStream method', {
          fileName: file.name
        });
      } catch (error) {
        webTorrentLogger.error('Failed to process file data from stream', {
          fileName: file.name,
          error: error instanceof Error ? error.message : String(error)
        });
        
        toast({
          title: 'Download Failed',
          description: `Could not download ${file.name}. Please try again.`,
          variant: 'destructive',
        });
      }
    });
    
    stream.on('error', error => {
      webTorrentLogger.error('Stream error while downloading file', {
        fileName: file.name,
        error: error instanceof Error ? error.message : String(error)
      });
      
      toast({
        title: 'Download Error',
        description: `Error streaming ${file.name}. Please try again.`,
        variant: 'destructive',
      });
    });
  } else {
    // Last resort: Download directly from the torrent's download property
    webTorrentLogger.warn('No download methods available, attempting direct access', {
      fileName: file.name
    });
    
    try {
      // Some WebTorrent implementations store the file data directly
      if (file._torrent && file._torrent.storage && file._torrent.storage.pieces) {
        webTorrentLogger.debug('Attempting to access file data through torrent storage');
        
        // Accessing internal properties is risky but might work in some implementations
        const buffer = file._torrent.storage.pieces.reduce((acc, piece) => {
          if (piece && piece.buffer) {
            const temp = new Uint8Array(acc.length + piece.buffer.length);
            temp.set(acc, 0);
            temp.set(new Uint8Array(piece.buffer), acc.length);
            return temp;
          }
          return acc;
        }, new Uint8Array(0));
        
        if (buffer.length > 0) {
          const blob = new Blob([buffer], { type: file.type || 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          triggerDownload(file.name, url);
          URL.revokeObjectURL(url);
          return;
        }
      }
      
      // If all else fails, inform the user
      webTorrentLogger.error('All download methods failed', { fileName: file.name });
      toast({
        title: 'Browser Compatibility Issue',
        description: `Could not download ${file.name}. Please try Firefox or Edge browsers.`,
        variant: 'destructive',
      });
    } catch (error) {
      webTorrentLogger.error('Error in last-resort download attempt', {
        fileName: file.name,
        error: error instanceof Error ? error.message : String(error)
      });
      
      toast({
        title: 'Download Failed',
        description: `Could not download ${file.name} due to a technical issue. Please try a different browser.`,
        variant: 'destructive',
      });
    }
  }
}

// Helper to trigger the actual download
function triggerDownload(filename, url) {
  webTorrentLogger.debug(`Triggering download for ${filename}`);
  const a = document.createElement('a');
  a.download = filename;
  a.href = url;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
  }, 100);
} 