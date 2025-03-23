"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "./use-toast";
import SimplePeer from "simple-peer";
import WebTorrent from "webtorrent";

// Correct window type declarations
declare global {
  interface Window {
    global: typeof globalThis;
    Buffer: typeof Buffer;
    process: typeof process;
    webTorrentClient?: WebTorrent.Instance;  // Changed from TorrentClient
  }
}

// Update process polyfill with modern import
if (typeof window !== 'undefined') {
  window.global = window;
  window.Buffer = window.Buffer || Buffer;
  import('process/browser').then((process) => {
    window.process = window.process || process;
  });
}

export interface TorrentFile {
  id: string;
  name: string;
  size: string;
  owner: string;
  magnetURI: string;
  timestamp: string;
  progress?: number;
  downloading?: boolean;
  torrent?: WebTorrent.Torrent;
}

export interface WebTorrentHookReturn {
  isClientReady: boolean;
  sharedFiles: TorrentFile[];
  downloadingFiles: TorrentFile[];
  createTorrent: (file: File, owner: string) => Promise<TorrentFile>;
  createTextTorrent: (text: string, owner: string) => Promise<TorrentFile>;
  downloadTorrent: (magnetURI: string) => Promise<void>;
  destroyClient: () => void;
}

const WEBTORRENT_TRACKERS = [
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.btorrent.xyz",
  "wss://tracker.fastcast.nz",
]

// Function to get additional RTC config if needed (can be expanded with server-provided configuration)
const getRtcConfig = (): RTCConfiguration => {
  // Default STUN servers if you don't have custom TURN servers
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  };
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  else return (bytes / 1048576).toFixed(1) + " MB";
}

// Helper function to get error message safely
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error occurred';
}

export function useWebTorrent(): WebTorrentHookReturn {
  const [client, setClient] = useState<WebTorrent.Instance | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  const [sharedFiles, setSharedFiles] = useState<TorrentFile[]>([]);
  const [downloadingFiles, setDownloadingFiles] = useState<TorrentFile[]>([]);
  const { toast } = useToast();
  const clientRef = useRef<WebTorrent.Instance | null>(null);

  // Initialize WebTorrent client
  useEffect(() => {
    if (typeof window === "undefined") return;

    const initWebTorrent = async () => {
      try {
        const { default: WebTorrentLib } = await import("webtorrent");
        const rtcConfig = getRtcConfig();
        
        const webTorrentClient = new WebTorrentLib({
          tracker: {
            announce: WEBTORRENT_TRACKERS,
            rtcConfig: {
              ...SimplePeer.config,
              ...rtcConfig
            }
          }
        });

        if (process.env.NODE_ENV === 'development') {
          window.webTorrentClient = webTorrentClient;
        }

        setClient(webTorrentClient);
        clientRef.current = webTorrentClient;
        setIsClientReady(true);

        return () => {
          webTorrentClient.destroy();
          setClient(null);
          clientRef.current = null;
        };
      } catch (err) {
        console.error("WebTorrent initialization failed:", err);
        toast({
          title: "WebTorrent Error",
          description: "Failed to initialize file sharing client",
          variant: "destructive",
        });
      }
    };

    initWebTorrent();
  }, [toast]);

  // Create a torrent from a file
  const createTorrent = useCallback(
    async (file: File, owner: string): Promise<TorrentFile> => {
      if (!client) throw new Error("WebTorrent client not initialized");

      return new Promise((resolve) => {
        client.seed(file, { 
          announce: WEBTORRENT_TRACKERS
        }, (torrent: WebTorrent.Torrent) => {
          const newFile: TorrentFile = {
            id: torrent.infoHash,
            name: file.name,
            size: formatFileSize(file.size),
            owner: owner,
            magnetURI: torrent.magnetURI,
            timestamp: new Date().toISOString(),
            torrent: torrent,
          };

          setSharedFiles((prev) => [newFile, ...prev]);
          
          // Set up event listeners
          torrent.on("download", () => {
            // Update UI with download progress
          });
          
          torrent.on("upload", () => {
            // Update UI with upload stats
          });
          
          torrent.on("done", () => {
            toast({
              title: "Seeding Complete",
              description: `${file.name} is now being seeded to the network`,
            });
          });

          torrent.on("error", (err: string | Error) => {
            toast({
              title: "Torrent Error",
              description: getErrorMessage(err),
              variant: "destructive",
            });
          });

          resolve(newFile);
        });
      });
    },
    [client, toast]
  );

  // Create a torrent from text content
  const createTextTorrent = useCallback(
    async (text: string, owner: string): Promise<TorrentFile> => {
      if (!client) throw new Error("WebTorrent client not initialized");

      const blob = new Blob([text], { type: "text/plain" });
      const file = new File([blob], "shared-text.txt", { type: "text/plain" });

      return new Promise((resolve) => {
        client.seed(file, { 
          announce: WEBTORRENT_TRACKERS
        }, (torrent: WebTorrent.Torrent) => {
          const newFile: TorrentFile = {
            id: torrent.infoHash,
            name: "Text Snippet",
            size: formatFileSize(file.size),
            owner: owner,
            magnetURI: torrent.magnetURI,
            timestamp: new Date().toISOString(),
            torrent: torrent,
          };

          setSharedFiles((prev) => [newFile, ...prev]);
          
          torrent.on("error", (err: string | Error) => {
            toast({
              title: "Torrent Error",
              description: getErrorMessage(err),
              variant: "destructive",
            });
          });

          resolve(newFile);
        });
      });
    },
    [client, toast]
  );

  // Download a torrent from magnetURI
  const downloadTorrent = useCallback(
    async (magnetURI: string): Promise<void> => {
      if (!client) throw new Error("WebTorrent client not initialized");

      return new Promise((resolve, reject) => {
        // Don't download if we're already downloading this torrent
        const existingTorrent = client.torrents.find(
          t => t.magnetURI === magnetURI
        );
        if (existingTorrent) {
          toast({
            title: "Already downloading",
            description: "This file is already being downloaded",
          });
          return resolve();
        }

        client.add(magnetURI, { announce: WEBTORRENT_TRACKERS }, (torrent) => {
          const newFile: TorrentFile = {
            id: torrent.infoHash,
            name: torrent.name || "Unknown",
            size: formatFileSize(torrent.length),
            owner: "Remote",
            magnetURI: torrent.magnetURI,
            timestamp: new Date().toISOString(),
            progress: 0,
            downloading: true,
            torrent: torrent,
          };

          setDownloadingFiles((prev) => [newFile, ...prev]);

          torrent.on("download", () => {
            // Update progress
            setDownloadingFiles(files => 
              files.map(file => 
                file.id === torrent.infoHash 
                  ? { ...file, progress: Math.round(torrent.progress * 100) } 
                  : file
              )
            );
          });

          torrent.on("done", () => {
            toast({
              title: "Download Complete",
              description: `${torrent.name} has been downloaded successfully`,
            });
            
            // Move from downloading to downloaded
            setDownloadingFiles(files => 
              files.filter(file => file.id !== torrent.infoHash)
            );
            
            // Get file
            const torrentFile = torrent.files[0];
            
            // Create download link programmatically
            torrentFile.getBlobURL((err, url) => {
              if (err) {
                console.error("Error getting blob URL:", err);
                return;
              }
              
              if (!url) {
                console.error("No URL returned");
                return;
              }
              
              const a = document.createElement("a");
              a.href = url;
              a.download = torrentFile.name;
              document.body.appendChild(a);
              a.click();
              setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }, 100);
            });
            
            resolve();
          });

          torrent.on("error", (err: string | Error) => {
            toast({
              title: "Download Error",
              description: getErrorMessage(err),
              variant: "destructive",
            });
            reject(err);
          });
        });
      });
    },
    [client, toast]
  );

  // Cleanup function
  const destroyClient = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.destroy();
      setClient(null);
      clientRef.current = null;
      setIsClientReady(false);
    }
  }, []);

  return {
    isClientReady,
    sharedFiles,
    downloadingFiles,
    createTorrent,
    createTextTorrent,
    downloadTorrent,
    destroyClient,
  };
} 