/* eslint-disable @typescript-eslint/ban-ts-comment */
"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { useToast } from './use-toast'
import thunky from 'thunky'
// Import WebTorrent directly
import WebTorrent from 'webtorrent'

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

// Improve logger types
const webTorrentLogger = {
  debug: (...args: unknown[]) => console.debug(`[WebTorrent][${new Date().toISOString()}]`, ...args),
  info: (...args: unknown[]) => console.info(`[WebTorrent][${new Date().toISOString()}]`, ...args),
  warn: (...args: unknown[]) => console.warn(`[WebTorrent][${new Date().toISOString()}]`, ...args),
  error: (...args: unknown[]) => console.error(`[WebTorrent][${new Date().toISOString()}]`, ...args)
};

// Type the helper functions
interface WebTorrentFile {
  name: string;
  length: number;
  type?: string;
  path?: string;
  createReadStream?: () => NodeJS.ReadableStream;
  getBuffer?: (callback: (err: Error | null, buffer?: Uint8Array) => void) => void;
  getBlobURL?: (callback: (err: Error | null, url?: string) => void) => void;
  _torrent?: any; // For internal access
}

function downloadWithBuffer(file: WebTorrentFile): void {
  // Function implementation
}

function downloadWithReadStream(file: WebTorrentFile): void {
  // Function implementation
}

function triggerDownload(filename: string, url: string): void {
  // Function implementation
}

// Or implement it yourself
function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let previous = 0;
  
  return function(...args: Parameters<T>): ReturnType<T> | undefined {
    const now = Date.now();
    const remaining = wait - (now - previous);
    
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      return func(...args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        previous = Date.now();
        timeout = null;
        func(...args);
      }, remaining);
    }
    return undefined;
  };
}

// Add a ref to track client state
const clientRef = useRef<WebTorrent.Instance | null>(null);
const isDestroyingRef = useRef(false);

// Modify the getClient implementation to use the ref
const getClient = useCallback((callback: (err: Error | null, client: WebTorrent.Instance | null) => void) => {
  // If we're currently destroying the client, wait
  if (isDestroyingRef.current) {
    callback(new Error('Client is being destroyed'), null);
    return;
  }

  // If we already have a client, use it
  if (clientRef.current) {
    callback(null, clientRef.current);
    return;
  }

  try {
    // Create new client
    const client = new WebTorrent({
      tracker: {
        rtcConfig: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }
          ]
        },
        announce: [
          'wss://tracker.btorrent.xyz',
          'wss://tracker.openwebtorrent.com',
          'wss://tracker.webtorrent.dev'
        ]
      }
    });

    // Store the client reference
    clientRef.current = client;

    client.on('error', (err) => {
      console.error('WebTorrent error:', err);
      // Don't destroy the client on every error
      if (err.message.includes('destroyed')) {
        clientRef.current = null;
      }
    });

    callback(null, client);
  } catch (error) {
    callback(error as Error, null);
  }
}, []);

// Modify the cleanup function
const cleanupClient = useCallback(() => {
  return new Promise<void>((resolve) => {
    if (isDestroyingRef.current) {
      resolve();
      return;
    }

    const client = clientRef.current;
    if (!client) {
      resolve();
      return;
    }

    try {
      isDestroyingRef.current = true;
      client.destroy(() => {
        clientRef.current = null;
        isDestroyingRef.current = false;
        resolve();
      });
    } catch (error) {
      console.warn('Error during client cleanup:', error);
      clientRef.current = null;
      isDestroyingRef.current = false;
      resolve();
    }
  });
}, []);

export function useWebTorrent() {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle')
  const [peerConnectionIssue, setPeerConnectionIssue] = useState(false)
  const [files, setFiles] = useState<SharedFile[]>([])
  const { toast } = useToast()

  // Modify the useEffect for initialization
  useEffect(() => {
    if (typeof window === 'undefined') return;

    setConnectionStatus('connecting');
    
    getClient((err, client) => {
      if (err || !client) {
        console.error('Failed to initialize WebTorrent:', err);
        setConnectionStatus('failed');
        return;
      }

      setIsConnected(true);
      setConnectionStatus('connected');

      if (!WebTorrent.WEBRTC_SUPPORT) {
        setPeerConnectionIssue(true);
        toast({
          title: "WebRTC Not Supported",
          description: "Your browser doesn't fully support WebRTC, which is needed for peer-to-peer transfers.",
          variant: "destructive"
        });
      }
    });

    return () => {
      cleanupClient();
    };
  }, [cleanupClient, getClient, toast]);

  // Modify shareFiles to handle client state better
  const shareFiles = useCallback(async (selectedFiles: File[]) => {
    return new Promise<void>((resolve, reject) => {
      getClient((err, client) => {
        if (err || !client) {
          reject(new Error('WebTorrent client not available'));
          return;
        }

        try {
          client.seed(selectedFiles, {}, (torrent) => {
            // Create SharedFile objects for UI
            const newFiles = selectedFiles.map((file, index) => ({
              name: file.name,
              size: file.size,
              type: file.type || 'application/octet-stream',
              progress: 100,
              downloadSpeed: 0,
              uploadSpeed: torrent.uploadSpeed,
              status: 'seeding' as const,
              magnetURI: torrent.magnetURI,
              hash: `${torrent.infoHash}-${index}`,
            }));

            setFiles(prev => [...prev, ...newFiles]);
            resolve();
          });
        } catch (error) {
          // If we get a "client is destroyed" error, try to reinitialize
          if (error.message.includes('destroyed')) {
            clientRef.current = null;
            reject(new Error('Client was destroyed, please try again'));
          } else {
            reject(error);
          }
        }
      });
    });
  }, [getClient]);

  // Modify downloadFiles similarly
  const downloadFiles = useCallback((magnetURI: string) => {
    return new Promise<void>((resolve, reject) => {
      getClient((err, client) => {
        if (err || !client) {
          reject(new Error('WebTorrent client not available'));
          return;
        }

        try {
          client.add(magnetURI, {}, (torrent) => {
            // Add placeholder files to UI
            const newFiles = torrent.files.map((file, index) => ({
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
            
            // Update progress
            function updateProgress() {
              setFiles(prev => 
                prev.map(f => 
                  f.hash?.startsWith(torrent.infoHash)
                    ? {
                        ...f,
                        progress: torrent.progress * 100,
                        downloadSpeed: torrent.downloadSpeed,
                        uploadSpeed: torrent.uploadSpeed,
                        status: torrent.done ? 'done' : 'downloading'
                      }
                    : f
                )
              )
            }
            
            torrent.on('download', updateProgress)
            torrent.on('done', () => {
              updateProgress()
              
              // Handle file saving
              torrent.files.forEach(file => {
                file.getBlobURL((err, url) => {
                  if (err || !url) return console.error('Error getting blob URL:', err)
                  
                  const a = document.createElement('a')
                  a.download = file.name
                  a.href = url
                  a.click()
                  URL.revokeObjectURL(url)
                })
              })
            })
            
            resolve()
          })
        } catch (error) {
          if (error.message.includes('destroyed')) {
            clientRef.current = null;
            reject(new Error('Client was destroyed, please try again'));
          } else {
            reject(error);
          }
        }
      })
    })
  }, [getClient])

  // Expose the getClient function for components that need direct access
  const getWebTorrentClient = useCallback((callback: (client: WebTorrent.Instance | null) => void) => {
    getClient((err, client) => {
      callback(client || null)
    })
  }, [])

  return {
    isConnected,
    connectionStatus,
    peerConnectionIssue,
    files,
    shareFiles,
    downloadFiles,
    getClient: getWebTorrentClient
  }
}

function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
} 