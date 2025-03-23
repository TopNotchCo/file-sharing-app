"use client"

import type React from "react"
import { useState, useEffect, useCallback, useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import MainScreen from "./main-screen"
import { useWebTorrent, type TorrentFile } from "@/hooks/use-webtorrent"

interface SharingState {
  isSharing: boolean
  progress: number
  stage: 'preparing' | 'hashing' | 'metadata' | 'ready' | null
}

export default function FileSharing() {
  const { toast } = useToast()
  const [isCopied, setIsCopied] = useState(false)
  const [currentMagnetLink, setCurrentMagnetLink] = useState<string>("")
  const [sharingState, setSharingState] = useState<SharingState>({
    isSharing: false,
    progress: 0,
    stage: null
  })
  
  // Initialize WebTorrent hook
  const { 
    isClientReady,
    sharedFiles, 
    downloadingFiles,
    createTorrent, 
    createTextTorrent, 
    downloadTorrent,
    setSharedFiles,
    setDownloadingFiles
  } = useWebTorrent()

  // All files (shared + downloading)
  const allFiles = [...sharedFiles, ...downloadingFiles]

  // Add refs to store cleanup functions
  const cleanupRef = useRef<(() => void)[]>([]);
  
  // Add cleanup handler
  const handleCleanup = useCallback(() => {
    // Execute all cleanup functions
    cleanupRef.current.forEach(cleanup => cleanup());
    // Reset cleanup array
    cleanupRef.current = [];
    
    // Reset all states
    setSharingState({
      isSharing: false,
      progress: 0,
      stage: null
    });
    setCurrentMagnetLink("");
  }, []);

  // Handle share cancellation
  const handleShareCancel = useCallback(() => {
    console.log('Cancelling share operation');
    handleCleanup();
    
    toast({
      title: "Share cancelled",
      description: "The file sharing operation has been cancelled",
    });
  }, [handleCleanup, toast]);

  // Debug logging for state changes
  useEffect(() => {
    console.log('Sharing State Changed:', {
      isSharing: sharingState.isSharing,
      progress: sharingState.progress,
      stage: sharingState.stage
    });
  }, [sharingState]);

  useEffect(() => {
    console.log('Magnet Link Changed:', currentMagnetLink ? 'New link available' : 'No link');
  }, [currentMagnetLink]);

  // Handle file deletion
  const handleFileDelete = useCallback((fileId: string) => {
    // Find the file in either shared or downloading arrays
    const sharedFile = sharedFiles.find(f => f.id === fileId);
    const downloadingFile = downloadingFiles.find(f => f.id === fileId);
    const file = sharedFile || downloadingFile;

    if (!file) {
      console.warn(`File with id ${fileId} not found`);
      return;
    }

    try {
      // If file is downloading, cancel the download first
      if (downloadingFile?.downloading) {
        file.torrent?.destroy({ destroyStore: true });
        // Remove from downloading files
        setDownloadingFiles((prev: TorrentFile[]) => prev.filter((f: TorrentFile) => f.id !== fileId));
      }

      // For shared files, just destroy the torrent
      if (sharedFile) {
        file.torrent?.destroy();
        // Remove from shared files
        setSharedFiles((prev: TorrentFile[]) => prev.filter((f: TorrentFile) => f.id !== fileId));
      }

      // Show appropriate toast message
      toast({
        title: downloadingFile?.downloading ? "Download cancelled" : "File removed",
        description: `${file.name} has been ${downloadingFile?.downloading ? 'cancelled' : 'removed'} successfully`,
      });

    } catch (error) {
      console.error("Error deleting file:", error);
      toast({
        title: "Error removing file",
        description: "An error occurred while removing the file. Please try again.",
        variant: "destructive",
      });
    }
  }, [sharedFiles, downloadingFiles, toast, setSharedFiles, setDownloadingFiles]);

  // Simulate connection to local network
  useEffect(() => {
    if (isClientReady) {
      toast({
        title: "Connected to P2P network",
        description: "You can now share files with other users",
      })
    }
  }, [isClientReady, toast])

  const handleFileShare = async (file: File) => {
    if (!isClientReady) {
      toast({
        title: "WebTorrent not ready",
        description: "Please wait for WebTorrent to initialize",
        variant: "destructive",
      })
      return
    }

    try {
      console.log('Starting file share process:', {
        fileName: file.name,
        fileSize: file.size,
        timestamp: new Date().toISOString()
      });

      // Initialize sharing state
      setSharingState({
        isSharing: true,
        progress: 0,
        stage: 'preparing'
      })

      // Create a promise that resolves when the torrent is fully ready
      const torrentPromise = new Promise<TorrentFile>((resolve, reject) => {
        console.log('Creating torrent...');
        
        const startTime = Date.now();
        let progressInterval: NodeJS.Timeout;
        let metadataCheckInterval: NodeJS.Timeout;
        let timeoutId: NodeJS.Timeout;
        
        // Store cleanup function
        cleanupRef.current.push(() => {
          clearInterval(progressInterval);
          clearInterval(metadataCheckInterval);
          clearTimeout(timeoutId);
        });

        createTorrent(file, "You")
          .then(newFile => {
            if (!newFile.torrent) {
              console.error('Torrent object missing');
              reject(new Error("Torrent creation failed"));
              return;
            }

            // Store torrent cleanup
            cleanupRef.current.push(() => {
              console.log('Cleaning up torrent');
              newFile.torrent?.destroy({ destroyStore: true });
            });

            // Rest of the existing torrent creation code...
            const simulateProgress = () => {
              const elapsedTime = Date.now() - startTime;
              const baseProgress = Math.min(95, (elapsedTime / 2000) * 100);
              
              setSharingState(prev => ({
                ...prev,
                progress: Math.round(baseProgress),
                stage: baseProgress < 40 ? 'preparing' 
                  : baseProgress < 70 ? 'hashing'
                  : baseProgress < 95 ? 'metadata'
                  : 'ready'
              }));

              if (baseProgress >= 95) {
                clearInterval(progressInterval);
              }
            };

            progressInterval = setInterval(simulateProgress, 100);

            // Handle torrent events
            newFile.torrent.on('ready', () => {
              console.log('Torrent ready event fired');
              
              if (newFile.magnetURI) {
                console.log('Magnet link available, completing process');
                clearInterval(progressInterval);
                
                setSharingState(prev => ({
                  ...prev,
                  stage: 'ready',
                  progress: 100
                }));
                
                setCurrentMagnetLink(newFile.magnetURI);
                resolve(newFile);
              } else {
                setSharingState(prev => ({
                  ...prev,
                  progress: Math.max(prev.progress, 95),
                  stage: 'metadata'
                }));
              }
            });

            metadataCheckInterval = setInterval(() => {
              if (newFile.magnetURI) {
                console.log('Magnet link detected in check interval');
                clearInterval(metadataCheckInterval);
                clearInterval(progressInterval);
                
                setSharingState(prev => ({
                  ...prev,
                  stage: 'ready',
                  progress: 100
                }));
                
                setCurrentMagnetLink(newFile.magnetURI);
                resolve(newFile);
              }
            }, 100);

            newFile.torrent.on('error', (err) => {
              console.error('Torrent error:', err);
              handleCleanup();
              reject(err);
            });

            timeoutId = setTimeout(() => {
              handleCleanup();
              reject(new Error("Timeout waiting for magnet link"));
            }, 10000);
          })
          .catch(err => {
            console.error('Error in createTorrent:', err);
            handleCleanup();
            reject(err);
          });
      });

      await torrentPromise;
      console.log('Torrent promise resolved');
      
      toast({
        title: "File shared successfully",
        description: `${file.name} is now available to others. Share the magnet link to allow others to download.`,
      })
    } catch (err) {
      console.error("Error sharing file:", err)
      handleCleanup();
      toast({
        title: "Error sharing file",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  const handleTextShare = async (text: string) => {
    if (!isClientReady) {
      toast({
        title: "WebTorrent not ready",
        description: "Please wait for WebTorrent to initialize",
        variant: "destructive",
      })
      return
    }

    try {
      const newFile = await createTextTorrent(text, "You")
      
      // Show and copy magnet link
      setCurrentMagnetLink(newFile.magnetURI)
      
      toast({
        title: "Text shared successfully",
        description: `"${text.slice(0, 30)}${text.length > 30 ? '...' : ''}" is now available to others. Share the magnet link to allow others to download.`,
      })
    } catch (err) {
      console.error("Error sharing text:", err)
      toast({
        title: "Error sharing text",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  const handleFileDownload = async (magnetURI: string) => {
    if (!isClientReady) {
      toast({
        title: "WebTorrent not ready",
        description: "Please wait for WebTorrent to initialize",
        variant: "destructive",
      })
      return
    }

    try {
      await downloadTorrent(magnetURI)
      
      toast({
        title: "Download started",
        description: "The file will be automatically downloaded when ready",
      })
    } catch (err) {
      console.error("Error downloading file:", err)
      toast({
        title: "Error downloading file",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  const handleCopyMagnetLink = () => {
    if (!currentMagnetLink) return
    
    navigator.clipboard.writeText(currentMagnetLink)
      .then(() => {
        setIsCopied(true)
        setTimeout(() => setIsCopied(false), 2000)
        
        toast({
          title: "Magnet link copied",
          description: "Share this link with others to allow them to download your file",
        })
      })
      .catch(err => {
        console.error("Error copying to clipboard:", err)
        toast({
          title: "Error copying magnet link",
          description: "Please copy it manually",
          variant: "destructive",
        })
      })
  }

  return (
    <MainScreen
      onFileShare={handleFileShare}
      onTextShare={handleTextShare}
      onFileDownload={handleFileDownload}
      onFileDelete={handleFileDelete}
      onShareCancel={handleShareCancel}
      sharedFiles={allFiles}
      currentMagnetLink={currentMagnetLink}
      onCopyMagnetLink={handleCopyMagnetLink}
      isCopied={isCopied}
      isClientReady={isClientReady}
      isSharing={sharingState.isSharing}
      sharingProgress={sharingState.progress}
      sharingStage={sharingState.stage}
    />
  )
}
