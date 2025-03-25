"use client";

import { useState, useRef, useEffect } from "react";
import { useLANDiscovery } from "../hooks/use-lan-discovery";
import { useWebTorrent } from "../hooks/use-webtorrent";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { 
  DownloadCloud, 
  UploadCloud, 
  FileText, 
  Check, 
  X, 
  Users, 
  Image as ImageIcon, 
  FileVideo, 
  FileAudio, 
  File as FileIcon,
  Eye,
  Play,
  Loader
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

interface SharedFileInfo {
  id: string;
  name: string;
  size: number;
  magnetURI: string;
  sender: {
    id: string;
    name: string;
    avatar?: string;
  };
  timestamp: number;
  type?: string;
  previewUrl?: string;
  previewContent?: string;
  isGeneratingPreview?: boolean;
}

// Custom type for the message event
interface LanMessageEvent extends CustomEvent {
  detail: {
    type: string;
    data: SharedFileInfo;
  };
}

// Maximum file size for auto preview in bytes (10MB)
const MAX_PREVIEW_SIZE = 10 * 1024 * 1024; 
// Size of partial download for preview (1MB)
const PREVIEW_CHUNK_SIZE = 1 * 1024 * 1024;

// Helper function to ensure progress is limited to 100%
function normalizeProgress(progress: number | undefined): number {
  if (progress === undefined || progress === null) return 0;
  return Math.min(Math.round(progress), 100);
}

export function LANFileSharing() {
  const { localUsers, currentUser, isDiscoveryActive, sendMessage } = useLANDiscovery();
  const { 
    createTorrent,
    downloadTorrent,
    sharedFiles,
    downloadingFiles,
    isClientReady
  } = useWebTorrent();
  const { toast } = useToast();
  
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [availableFiles, setAvailableFiles] = useState<SharedFileInfo[]>([]);
  const [fileNotifications, setFileNotifications] = useState<SharedFileInfo[]>([]);
  const [previewFile, setPreviewFile] = useState<SharedFileInfo | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTorrents, setPreviewTorrents] = useState<Record<string, {destroy?: () => void}>>({});

  // Log key information for debugging
  useEffect(() => {
    console.log("[LANFileSharing] Current user info:", currentUser);
    console.log("[LANFileSharing] Local users:", localUsers);
  }, [currentUser, localUsers]);

  // Handle received file share messages
  useEffect(() => {
    // Setup message listener for file shares
    const handleMessageReceived = (e: Event) => {
      console.log("[LANFileSharing] Received event:", e);
      
      const event = e as LanMessageEvent;
      console.log("[LANFileSharing] Received lan-message event:", event.detail);
      
      if (event.detail?.type === 'FILE_SHARE') {
        console.log("[LANFileSharing] Processing FILE_SHARE message:", event.detail.data);
        
        const fileInfo = event.detail.data;
        
        // Add to available files
        setAvailableFiles(prev => {
          if (prev.find(f => f.id === fileInfo.id)) return prev;
          return [fileInfo, ...prev];
        });
        
        // Add to notifications
        setFileNotifications(prev => [fileInfo, ...prev]);
        
        // Show toast notification
        toast({
          title: "New file shared",
          description: `${fileInfo.sender.name} shared "${fileInfo.name}"`,
        });
      }
    };
    
    // Register the message handler with the LAN discovery hook
    if (typeof window !== 'undefined') {
      console.log("[LANFileSharing] Adding lan-message event listener");
      window.addEventListener('lan-message', handleMessageReceived);
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        console.log("[LANFileSharing] Removing lan-message event listener");
        window.removeEventListener('lan-message', handleMessageReceived);
      }
    };
  }, [toast]);

  // Auto dismiss notifications after 5 seconds
  useEffect(() => {
    if (fileNotifications.length > 0) {
      const timer = setTimeout(() => {
        setFileNotifications(prev => prev.slice(0, prev.length - 1));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [fileNotifications]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(e.target.files);
    }
  };

  const togglePeerSelection = (peerId: string) => {
    // Prevent selecting yourself
    if (peerId === currentUser.peerId) return;
    
    setSelectedPeers(prev => 
      prev.includes(peerId) 
        ? prev.filter(id => id !== peerId)
        : [...prev, peerId]
    );
  };

  const shareFiles = async () => {
    if (!selectedFiles || selectedFiles.length === 0 || selectedPeers.length === 0) return;
    
    setIsSharing(true);
    
    try {
      // Create a torrent from the selected files
      const file = selectedFiles[0]; // For simplicity, just use the first file
      const torrent = await createTorrent(file, currentUser.name);
      
      console.log(`[LANFileSharing] Created torrent:`, torrent);
      
      // Create file info to share with peers
      const fileInfo: SharedFileInfo = {
        id: torrent.id,
        name: file.name,
        size: file.size,
        magnetURI: torrent.magnetURI,
        sender: {
          id: currentUser.id,
          name: currentUser.name,
          avatar: currentUser.avatar
        },
        timestamp: Date.now()
      };
      
      // Share the torrent info with selected peers
      console.log(`[LANFileSharing] Sharing torrent ${torrent.id} with peers:`, selectedPeers);
      
      // Send file info to each selected peer
      for (const peerId of selectedPeers) {
        console.log(`[LANFileSharing] Sending FILE_SHARE message to peer ${peerId}`);
        
        const messageData = {
          type: 'FILE_SHARE',
          data: fileInfo as unknown as Record<string, unknown>,
          recipient: peerId
        };
        
        console.log("[LANFileSharing] Sending message:", messageData);
        sendMessage(messageData);
      }
      
      // We no longer add the file to our own availableFiles list
      // as the user doesn't want to see their own shared files in the "Files Shared with You" list
      
      // Show toast notification
      toast({
        title: "File shared",
        description: `Successfully shared "${file.name}" with ${selectedPeers.length} recipient(s)`,
      });
      
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setSelectedFiles(null);
      setSelectedPeers([]);
    } catch (error) {
      console.error("[LANFileSharing] Error sharing files:", error);
      toast({
        title: "Error sharing file",
        description: "An error occurred while sharing the file",
        variant: "destructive"
      });
    } finally {
      setIsSharing(false);
    }
  };

  // Function to determine file type from name
  const getFileType = (fileName: string): string => {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    
    // Image formats
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
      return 'image';
    }
    
    // Video formats
    if (['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(extension)) {
      return 'video';
    }
    
    // Audio formats
    if (['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(extension)) {
      return 'audio';
    }
    
    // Text formats
    if (['txt', 'md', 'json', 'csv', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'yaml', 'yml'].includes(extension)) {
      return 'text';
    }
    
    // PDF
    if (extension === 'pdf') {
      return 'pdf';
    }
    
    // Other formats
    return 'other';
  };

  // Function to get file icon based on type
  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <ImageIcon className="h-5 w-5 text-[#9D4EDD]" />;
      case 'video':
        return <FileVideo className="h-5 w-5 text-[#9D4EDD]" />;
      case 'audio':
        return <FileAudio className="h-5 w-5 text-[#9D4EDD]" />;
      case 'text':
        return <FileText className="h-5 w-5 text-[#9D4EDD]" />;
      default:
        return <FileIcon className="h-5 w-5 text-[#9D4EDD]" />;
    }
  };
  
  // Helper to get MIME type from filename
  const getMimeType = (filename: string): string => {
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    
    // Common MIME types
    const mimeTypes: {[key: string]: string} = {
      // Images
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'bmp': 'image/bmp',
      
      // Videos
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'ogg': 'video/ogg',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      
      // Audio
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'm4a': 'audio/mp4',
      'aac': 'audio/aac',
      
      // Other
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'md': 'text/markdown',
      'json': 'application/json'
    };
    
    return mimeTypes[extension] || 'application/octet-stream';
  };

  // Function to preview a file before downloading
  const previewBeforeDownload = async (file: SharedFileInfo) => {
    // Don't regenerate if already previewing or has preview
    if (file.isGeneratingPreview || file.previewUrl || file.previewContent) return;
    
    const fileType = getFileType(file.name);
    // Only try to preview supported formats
    if (!['image', 'video', 'audio', 'text', 'pdf'].includes(fileType)) return;
    
    // Check if file is too large for preview
    if (file.size > MAX_PREVIEW_SIZE) {
      toast({
        title: "File too large for preview",
        description: "Only files under 10MB can be previewed without downloading",
      });
      return;
    }
    
    try {
      // Mark file as generating preview
      setAvailableFiles(prev => 
        prev.map(f => {
          if (f.id === file.id) {
            return { ...f, isGeneratingPreview: true };
          }
          return f;
        })
      );
      
      console.log(`[LANFileSharing] Generating preview for ${file.name}`);
      
      // Create a temporary client instance to download just enough for preview
      const tempClient = await window.webTorrentClient?.add(file.magnetURI);
      
      if (!tempClient) {
        throw new Error("Failed to create preview download");
      }
      
      // Store reference to be able to destroy it later
      setPreviewTorrents(prev => ({ ...prev, [file.id]: tempClient }));
      
      // Wait for metadata to be ready before accessing files
      const waitForMetadata = () => {
        return new Promise<void>((resolve, reject) => {
          // Check if files already exist first
          if (tempClient.files && tempClient.files.length > 0) {
            resolve();
            return;
          }
          
          // Set up event listener for when torrent metadata loads
          const onReady = () => {
            if (tempClient.files && tempClient.files.length > 0) {
              resolve();
            } else {
              reject(new Error("Torrent has no files after metadata loaded"));
            }
          };
          
          // Listen for the ready event
          tempClient.on('ready', onReady);
          
          // Set a timeout in case metadata never loads
          setTimeout(() => {
            tempClient.removeListener('ready', onReady);
            reject(new Error("Timed out waiting for torrent metadata"));
          }, 15000);
        });
      };
      
      // Wait for metadata to be ready
      await waitForMetadata();
      
      // Check if we have files now
      if (!tempClient.files || tempClient.files.length === 0) {
        throw new Error("No files found in torrent after metadata loaded");
      }
      
      // Set priority on first file only
      const torrentFile = tempClient.files[0];
      
      // For most file types, we just need the beginning of the file
      if (['image', 'video', 'audio', 'pdf'].includes(fileType)) {
        // Select just the first chunk to download
        const previewLength = Math.min(PREVIEW_CHUNK_SIZE, file.size);
        
        // Create buffer for partial content
        let partialContent: Uint8Array | null = null;
        
        // Create a promise to wait for enough data for preview
        const previewPromise = new Promise<string>((resolve, reject) => {
          let downloadedEnough = false;
          
          const checkDownload = () => {
            // Only proceed if we downloaded at least 50KB or 10% of file
            const minBytes = Math.min(50 * 1024, file.size * 0.1);
            
            if (tempClient.downloaded >= minBytes && !downloadedEnough) {
              downloadedEnough = true;
              
              try {
                // Get partial content as stream or buffer
                const stream = torrentFile.createReadStream({ 
                  start: 0,
                  end: Math.min(previewLength - 1, torrentFile.length - 1)
                });
                
                const chunks: Uint8Array[] = [];
                
                stream.on('data', (chunk: Uint8Array) => {
                  chunks.push(chunk);
                });
                
                stream.on('end', () => {
                  partialContent = new Uint8Array(Buffer.concat(chunks));
                  
                  // Create blob URL from the partial content
                  const blob = new Blob([partialContent], { type: getMimeType(file.name) });
                  const url = URL.createObjectURL(blob);
                  resolve(url);
                });
                
                stream.on('error', (err: Error) => {
                  reject(err);
                });
              } catch (err) {
                reject(err);
              }
            }
          };
          
          // Poll download progress
          const interval = setInterval(checkDownload, 200);
          
          // Timeout after 15 seconds
          const timeout = setTimeout(() => {
            clearInterval(interval);
            reject(new Error("Preview generation timed out"));
          }, 15000);
          
          // Set up cleanup
          tempClient.once('close', () => {
            clearInterval(interval);
            clearTimeout(timeout);
            reject(new Error("Download was closed"));
          });
        });
        
        // Wait for preview to be ready
        const previewUrl = await previewPromise;
        
        // Update file with preview URL
        setAvailableFiles(prev => 
          prev.map(f => {
            if (f.id === file.id) {
              return { 
                ...f, 
                previewUrl,
                type: fileType,
                isGeneratingPreview: false 
              };
            }
            return f;
          })
        );
      } else if (fileType === 'text') {
        // For text files, get a small preview of the content
        const previewPromise = new Promise<string>((resolve, reject) => {
          let downloadedEnough = false;
          
          const checkDownload = () => {
            // Only need first ~10KB for text preview
            const minBytes = Math.min(10 * 1024, file.size);
            
            if (tempClient.downloaded >= minBytes && !downloadedEnough) {
              downloadedEnough = true;
              
              try {
                // Get first part of text file
                const stream = torrentFile.createReadStream({ 
                  start: 0,
                  end: Math.min(minBytes - 1, torrentFile.length - 1)
                });
                
                const chunks: Uint8Array[] = [];
                
                stream.on('data', (chunk: Uint8Array) => {
                  chunks.push(chunk);
                });
                
                stream.on('end', () => {
                  try {
                    const content = new TextDecoder().decode(Buffer.concat(chunks));
                    resolve(content.slice(0, 1000)); // First 1000 chars
                  } catch (err) {
                    reject(err);
                  }
                });
                
                stream.on('error', (err: Error) => {
                  reject(err);
                });
              } catch (err) {
                reject(err);
              }
            }
          };
          
          // Poll download progress
          const interval = setInterval(checkDownload, 200);
          
          // Timeout after 15 seconds
          const timeout = setTimeout(() => {
            clearInterval(interval);
            reject(new Error("Preview generation timed out"));
          }, 15000);
          
          // Set up cleanup
          tempClient.once('close', () => {
            clearInterval(interval);
            clearTimeout(timeout);
            reject(new Error("Download was closed"));
          });
        });
        
        // Wait for preview to be ready
        const previewContent = await previewPromise;
        
        // Update file with preview content
        setAvailableFiles(prev => 
          prev.map(f => {
            if (f.id === file.id) {
              return { 
                ...f, 
                previewContent,
                type: fileType,
                isGeneratingPreview: false 
              };
            }
            return f;
          })
        );
      }
    } catch (error) {
      console.error(`[LANFileSharing] Error generating preview:`, error);
      
      // Reset generating state
      setAvailableFiles(prev => 
        prev.map(f => {
          if (f.id === file.id) {
            return { ...f, isGeneratingPreview: false };
          }
          return f;
        })
      );
      
      toast({
        title: "Preview generation failed",
        description: "Could not generate preview for this file",
        variant: "destructive"
      });
    }
  };

  // Function to open preview dialog
  const openPreview = (file: SharedFileInfo) => {
    setPreviewFile(file);
    setIsPreviewOpen(true);
    
    // For text files that have been downloaded, get the full content
    if (file.type === 'text') {
      const downloadedFile = downloadingFiles.find(df => df.magnetURI === file.magnetURI);
      
      if (downloadedFile?.torrent && downloadedFile.progress === 100) {
        const torrentFile = downloadedFile.torrent.files[0];
        
        if (torrentFile) {
          torrentFile.getBuffer((err, buffer) => {
            if (err || !buffer) return;
            
            try {
              const textContent = new TextDecoder().decode(buffer);
              setPreviewContent(textContent);
            } catch (error) {
              console.error("Error decoding text file:", error);
              setPreviewContent("Error loading file content");
            }
          });
        }
      }
    }
  };
  
  // Clean up preview torrents when component unmounts
  useEffect(() => {
    return () => {
      // Destroy all preview torrents
      Object.values(previewTorrents).forEach(torrent => {
        try {
          if (torrent && typeof torrent.destroy === 'function') {
            torrent.destroy();
          }
        } catch (e) {
          console.error("[LANFileSharing] Error destroying preview torrent:", e);
        }
      });
    };
  }, [previewTorrents]);

  // Track when downloading is complete to possibly show preview
  useEffect(() => {
    downloadingFiles.forEach(file => {
      // Find matching file in availableFiles
      const availableFile = availableFiles.find(af => af.magnetURI === file.magnetURI);
      
      if (availableFile && file.progress === 100 && file.torrent) {
        // File is completely downloaded, we can create preview
        const fileType = getFileType(file.name);
        
        // Only create previews for supported formats and small enough files
        if (['image', 'text', 'video', 'audio'].includes(fileType) && file.size < MAX_PREVIEW_SIZE) {
          const torrentFile = file.torrent.files[0];
          
          if (torrentFile) {
            if (fileType === 'text') {
              // For text files, get the content
              torrentFile.getBuffer((err, buffer) => {
                if (err || !buffer) return;
                
                try {
                  const textContent = new TextDecoder().decode(buffer);
                  
                  // Update availableFiles with the text content
                  setAvailableFiles(prev => 
                    prev.map(f => {
                      if (f.id === availableFile.id) {
                        return {
                          ...f,
                          type: fileType,
                          previewContent: textContent.slice(0, 1000) // Limit preview to first 1000 chars
                        };
                      }
                      return f;
                    })
                  );
                } catch (error) {
                  console.error("Error decoding text file:", error);
                }
              });
            } else {
              // For other file types, get blob URL
              torrentFile.getBlobURL((err, url) => {
                if (err || !url) return;
                
                // Update availableFiles with the preview URL
                setAvailableFiles(prev => 
                  prev.map(f => {
                    if (f.id === availableFile.id) {
                      return {
                        ...f,
                        type: fileType,
                        previewUrl: url
                      };
                    }
                    return f;
                  })
                );
              });
            }
          }
        }
      }
    });
  }, [downloadingFiles, availableFiles]);

  const downloadSharedFile = async (magnetURI: string) => {
    if (!magnetURI.trim()) return;
    
    try {
      await downloadTorrent(magnetURI);
      
      // Remove the file from notifications if it exists there
      setFileNotifications(prev => 
        prev.filter(file => file.magnetURI !== magnetURI)
      );
    } catch (error) {
      console.error("Error downloading file:", error);
    }
  };

  const dismissNotification = (fileId: string) => {
    setFileNotifications(prev => 
      prev.filter(file => file.id !== fileId)
    );
  };

  // Calculate total upload/download speeds
  const uploadSpeed = [...sharedFiles, ...downloadingFiles].reduce(
    (total, file) => total + (file.torrent?.uploadSpeed || 0), 
    0
  );
  
  const downloadSpeed = downloadingFiles.reduce(
    (total, file) => total + (file.downloadSpeed || 0), 
    0
  );

  return (
    <div className="space-y-4">
      <Card className="border border-[#9D4EDD]/20 overflow-hidden">
        <CardContent className="px-2 py-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-card/50 p-3 rounded-lg">
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant="outline" className="bg-accent/50 text-white border-[#9D4EDD]/30">
                  Connected
                </Badge>
                {localUsers.length > 0 && (
                  <Badge variant="outline" className="bg-[#9D4EDD]/10 text-white border-[#9D4EDD]/30">
                    {localUsers.length} Online {localUsers.length === 1 ? 'Device' : 'Devices'}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* File share notifications */}
      {fileNotifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-[90%] sm:max-w-md">
          {fileNotifications.map(file => (
            <div key={file.id} className="bg-black/80 backdrop-blur-md border border-[#9D4EDD]/30 rounded-lg p-3 shadow-lg flex items-center justify-between animate-in slide-in-from-right">
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback style={{ backgroundColor: file.sender.avatar || '#9D4EDD' }}>
                    {file.sender.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-white">{file.sender.name} shared a file</p>
                  <p className="text-xs text-white/70 truncate max-w-full">{file.name}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-7 w-7 text-white/70 hover:text-white hover:bg-[#9D4EDD]/20"
                  onClick={() => downloadSharedFile(file.magnetURI)}
                >
                  <DownloadCloud className="h-4 w-4" />
                </Button>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-7 w-7 text-white/70 hover:text-white hover:bg-[#9D4EDD]/20"
                  onClick={() => dismissNotification(file.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="sm:max-w-[90vw] max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{previewFile?.name}</DialogTitle>
          </DialogHeader>
          
          <div className="mt-4">
            {previewFile?.type === 'image' && previewFile.previewUrl && (
              <img 
                src={previewFile.previewUrl} 
                alt={previewFile.name} 
                className="max-w-full h-auto rounded-md"
              />
            )}
            
            {previewFile?.type === 'video' && previewFile.previewUrl && (
              <video 
                src={previewFile.previewUrl} 
                controls 
                className="max-w-full h-auto rounded-md"
              />
            )}
            
            {previewFile?.type === 'audio' && previewFile.previewUrl && (
              <audio 
                src={previewFile.previewUrl} 
                controls 
                className="w-full"
              />
            )}
            
            {previewFile?.type === 'text' && (
              <pre className="bg-secondary/20 p-4 rounded-md overflow-auto max-h-[60vh] text-sm">
                {previewContent || "Loading content..."}
              </pre>
            )}
            
            {(!previewFile?.type || previewFile.type === 'other') && (
              <div className="text-center p-6 bg-secondary/20 rounded-md">
                <FileIcon className="h-16 w-16 text-[#9D4EDD]/50 mx-auto mb-4" />
                <p>Preview not available for this file type</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
        <CardHeader className="px-3">
          <CardTitle className="gradient-text">Local Network Sharing</CardTitle>
          <CardDescription>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="outline" className={isDiscoveryActive ? "border-[#9D4EDD]/30 bg-[#9D4EDD]/10 text-[#9D4EDD]" : "bg-red-100/10 border-red-300/30 text-red-500"}>
                {isDiscoveryActive ? "Connected" : "Disconnected"}
              </Badge>
              
              {!isClientReady && (
                <Badge variant="outline" className="border-amber-300/30 bg-amber-100/10 text-amber-500">Initializing</Badge>
              )}
              
              <Badge variant="outline" className="border-[#9D4EDD]/30 bg-[#9D4EDD]/10 text-[#9D4EDD]">
                {localUsers.length} Online Device{localUsers.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3">
          <div className="space-y-6">
            {/* Network members */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-[#9D4EDD]" />
                <h3 className="text-sm font-medium text-[#9D4EDD]">Available Devices</h3>
              </div>
              
              <div className="flex flex-wrap gap-2 sm:gap-3">
                {/* Other users */}
                {localUsers.length > 0 ? (
                  localUsers.map(user => (
                    <div 
                      key={user.id}
                      className={`flex flex-col items-center justify-center border rounded-lg p-2 sm:p-3 min-w-[60px] cursor-pointer transition-colors ${
                        selectedPeers.includes(user.peerId) 
                          ? 'border-[#9D4EDD] bg-[#9D4EDD]/10' 
                          : 'border-[#9D4EDD]/20 bg-background/50 hover:bg-[#9D4EDD]/5'
                      }`}
                      onClick={() => togglePeerSelection(user.peerId)}
                    >
                      <Avatar className="h-12 w-12 mb-2">
                        <AvatarFallback style={{ backgroundColor: user.avatar || '#9D4EDD' }}>
                          {user.id.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">User {user.id.substring(0, 4)}</span>
                      <Badge 
                        variant="outline" 
                        className={`mt-1 ${
                          selectedPeers.includes(user.peerId) 
                            ? 'border-[#9D4EDD] bg-[#9D4EDD]/20 text-[#9D4EDD]' 
                            : 'border-[#9D4EDD]/30'
                        }`}
                      >
                        {selectedPeers.includes(user.peerId) ? 'Selected' : 'Tap to select'}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-center w-full p-6 border border-[#9D4EDD]/20 rounded-lg bg-secondary/10">
                    <p className="text-sm text-muted-foreground">
                      You&apos;re the only one here. Waiting for others to join...
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* File sharing section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <UploadCloud className="h-4 w-4 text-[#9D4EDD]" />
                <h3 className="text-sm font-medium text-[#9D4EDD]">Share Files</h3>
              </div>
              
              <div className="border-2 border-dashed border-[#9D4EDD]/30 hover:border-[#9D4EDD]/60 rounded-lg p-6 space-y-4 bg-secondary/5 transition-colors">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange} 
                  multiple 
                  className="block w-full text-sm text-slate-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-md file:border-0
                    file:text-sm file:font-semibold
                    file:bg-[#9D4EDD]/10 file:text-[#9D4EDD]
                    hover:file:bg-[#9D4EDD]/20"
                />
                
                {selectedFiles && (
                  <div className="text-sm">
                    Selected {selectedFiles.length} file(s):
                    <ul className="mt-1 list-disc list-inside">
                      {Array.from(selectedFiles).map((file, index) => (
                        <li key={index} className="truncate max-w-full">
                          {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <Button 
                  onClick={shareFiles} 
                  disabled={!selectedFiles || selectedPeers.length === 0 || isSharing || !isClientReady}
                  className="w-full bg-[#9D4EDD] hover:bg-[#7B2CBF]"
                >
                  {isSharing ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Sharing...</span>
                    </div>
                  ) : selectedPeers.length 
                      ? `Share with ${selectedPeers.length} selected device${selectedPeers.length !== 1 ? 's' : ''}` 
                      : 'Select devices to share with'
                  }
                </Button>
              </div>
            </div>

            {/* Available files section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <DownloadCloud className="h-4 w-4 text-[#9D4EDD]" />
                <h3 className="text-sm font-medium text-[#9D4EDD]">Files Shared with You</h3>
              </div>
              
              {availableFiles.filter(file => file.sender.id !== currentUser.id).length > 0 ? (
                <div className="space-y-3">
                  {availableFiles
                    .filter(file => file.sender.id !== currentUser.id)
                    .map(file => {
                    // Check if this file is currently downloading
                    const isDownloading = downloadingFiles.some(df => 
                      df.magnetURI === file.magnetURI
                    );
                    
                    // Find download progress if available
                    const downloadInfo = downloadingFiles.find(df => 
                      df.magnetURI === file.magnetURI
                    );

                    // Determine if file is previewable
                    const fileType = getFileType(file.name);
                    const isPreviewable = ['image', 'video', 'audio', 'text', 'pdf'].includes(fileType);
                    const isFullyDownloaded = downloadInfo?.progress === 100;
                    const isSmallEnough = file.size < MAX_PREVIEW_SIZE;
                    const hasPreview = file.previewUrl || file.previewContent;
                    const canShowPreview = isPreviewable && (isFullyDownloaded || hasPreview) && isSmallEnough;
                    
                    return (
                      <div key={file.id} className="flex items-center justify-between border border-[#9D4EDD]/20 rounded-lg p-2 text-sm bg-secondary/30 hover:bg-secondary/50 transition-colors">
                        <div className="flex items-center space-x-2 sm:space-x-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback style={{ backgroundColor: file.sender.avatar || '#9D4EDD' }}>
                              {file.sender.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center space-x-2">
                              <p className="text-sm font-medium truncate max-w-[150px] sm:max-w-full">{file.name}</p>
                              {downloadInfo?.progress === 100 && <Check className="h-3.5 w-3.5 text-green-500" />}
                            </div>
                            <div className="flex items-center gap-1 sm:gap-2">
                              <p className="text-xs text-muted-foreground whitespace-nowrap">
                                {getFileIcon(fileType)} {file.sender.name} • {(file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                              
                              {/* Preview button */}
                              {canShowPreview ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openPreview(file)}
                                  className="h-6 px-1 sm:px-2 ml-1 text-xs text-[#9D4EDD] hover:bg-[#9D4EDD]/10"
                                >
                                  {fileType === 'video' ? 
                                    <Play className="h-3 w-3 mr-1" /> : 
                                    <Eye className="h-3 w-3 mr-1" />
                                  }
                                  <span className="hidden sm:inline">Preview</span>
                                </Button>
                              ) : isPreviewable && isSmallEnough && !file.isGeneratingPreview && !isDownloading ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => previewBeforeDownload(file)}
                                  className="h-6 px-1 sm:px-2 ml-1 text-xs text-[#9D4EDD] hover:bg-[#9D4EDD]/10"
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  <span className="hidden sm:inline">Generate Preview</span>
                                </Button>
                              ) : file.isGeneratingPreview ? (
                                <div className="flex items-center h-6 px-1 sm:px-2 ml-1 text-xs text-[#9D4EDD]">
                                  <Loader className="h-3 w-3 mr-1" />
                                  <span className="hidden sm:inline">Previewing...</span>
                                </div>
                              ) : null}
                            </div>
                            
                            {/* File Preview Thumbnails (only for certain file types) */}
                            {canShowPreview && (file.previewUrl || file.previewContent) && (
                              <div className="mt-2 relative" onClick={() => openPreview(file)}>
                                {fileType === 'image' && file.previewUrl && (
                                  <div className="relative group cursor-pointer">
                                    <img 
                                      src={file.previewUrl} 
                                      alt={file.name}
                                      className="h-16 sm:h-20 max-w-[120px] sm:max-w-[200px] object-cover rounded-md border border-[#9D4EDD]/20" 
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center rounded-md">
                                      <Eye className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                  </div>
                                )}
                                
                                {fileType === 'video' && file.previewUrl && (
                                  <div className="relative group cursor-pointer">
                                    <video 
                                      src={file.previewUrl}
                                      className="h-16 sm:h-20 max-w-[120px] sm:max-w-[200px] object-cover rounded-md border border-[#9D4EDD]/20"
                                    />
                                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center rounded-md">
                                      <Play className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                                    </div>
                                  </div>
                                )}
                                
                                {fileType === 'text' && file.previewContent && (
                                  <div className="mt-2 bg-secondary/20 p-2 rounded-md text-xs cursor-pointer group">
                                    <div className="max-h-12 sm:max-h-16 overflow-hidden relative">
                                      <pre className="font-mono text-[10px] leading-tight opacity-70">
                                        {file.previewContent}
                                      </pre>
                                      <div className="absolute bottom-0 left-0 right-0 h-6 sm:h-8 bg-gradient-to-t from-secondary/80 to-transparent"></div>
                                    </div>
                                    <div className="text-center text-[10px] text-[#9D4EDD] mt-1 opacity-70 group-hover:opacity-100">
                                      Click to expand
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {isDownloading && downloadInfo && (
                              <div className="mt-1.5 w-full">
                                <Progress 
                                  value={normalizeProgress((downloadInfo.progress || 0) * 100)} 
                                  className="h-1.5"
                                  indicatorClassName="bg-[#9D4EDD]"
                                />
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-[10px] sm:text-xs text-[#9D4EDD]">
                                    {normalizeProgress((downloadInfo.progress || 0) * 100)}%
                                  </span>
                                  <span className="text-[10px] sm:text-xs text-muted-foreground">
                                    {((downloadInfo.downloadSpeed || 0) / 1024).toFixed(1)} KB/s
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {(!isDownloading || !downloadInfo) && (
                          <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                            {isPreviewable && !hasPreview && !file.isGeneratingPreview && file.size < MAX_PREVIEW_SIZE && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => previewBeforeDownload(file)}
                                disabled={!isClientReady}
                                className="bg-transparent border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10 px-2 h-8"
                              >
                                <Eye className="h-4 w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Preview</span>
                              </Button>
                            )}
                            <Button 
                              size="sm" 
                              onClick={() => downloadSharedFile(file.magnetURI)}
                              disabled={!isClientReady || isDownloading}
                              className="bg-[#9D4EDD] hover:bg-[#7B2CBF] px-2 h-8"
                            >
                              <DownloadCloud className="h-4 w-4 sm:mr-2" />
                              <span className="hidden sm:inline">Download</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center w-full p-8 border border-[#9D4EDD]/20 rounded-lg bg-secondary/10">
                  <div className="text-center">
                    <FileText className="h-8 w-8 text-[#9D4EDD]/50 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No files have been shared yet
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t border-[#9D4EDD]/10 pt-4 px-3">
          <div className="w-full space-y-2">
            <div className="flex justify-between text-sm">
              <div className="flex items-center gap-1 text-[#9D4EDD]">
                <UploadCloud className="h-4 w-4" />
                <span>{(uploadSpeed / 1024).toFixed(2)} KB/s</span>
              </div>
              <div className="flex items-center gap-1 text-[#9D4EDD]">
                <DownloadCloud className="h-4 w-4" />
                <span>{(downloadSpeed / 1024).toFixed(2)} KB/s</span>
              </div>
            </div>
            {downloadingFiles.length > 0 && (
              <div className="space-y-3 mt-2">
                <h4 className="text-sm font-medium text-[#9D4EDD]">Active Transfers:</h4>
                {downloadingFiles.map(file => (
                  <div key={file.id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="truncate max-w-[70%]">
                        {file.name || file.id.substring(0, 8)}
                      </span>
                      <span className="text-[#9D4EDD]">{normalizeProgress((file.progress || 0) * 100)}%</span>
                    </div>
                    <Progress 
                      value={normalizeProgress((file.progress || 0) * 100)} 
                      indicatorClassName="bg-[#9D4EDD]"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
} 