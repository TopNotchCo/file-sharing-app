"use client";

import { useState, useRef, useEffect } from "react";
import { useLANDiscovery } from "../hooks/use-lan-discovery";
import { useWebTorrent } from "../hooks/use-webtorrent";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { DownloadCloud, UploadCloud, FileText, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
}

// Custom type for the message event
interface LanMessageEvent extends CustomEvent {
  detail: {
    type: string;
    data: SharedFileInfo;
  };
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
      
      // Add to our own available files list
      setAvailableFiles(prev => [fileInfo, ...prev]);
      
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
    <div className="w-full max-w-4xl mx-auto p-4 space-y-6">
      {/* File share notifications */}
      {fileNotifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
          {fileNotifications.map(file => (
            <div key={file.id} className="bg-black/80 backdrop-blur-md border border-primary/30 rounded-lg p-3 shadow-lg flex items-center justify-between animate-in slide-in-from-right">
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback style={{ backgroundColor: file.sender.avatar || '#9D4EDD' }}>
                    {file.sender.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-white">{file.sender.name} shared a file</p>
                  <p className="text-xs text-white/70 truncate max-w-[200px]">{file.name}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10"
                  onClick={() => downloadSharedFile(file.magnetURI)}
                >
                  <DownloadCloud className="h-4 w-4" />
                </Button>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10"
                  onClick={() => dismissNotification(file.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <Card>
        <CardHeader>
          <CardTitle>Local Network</CardTitle>
          <CardDescription>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="outline" className={isDiscoveryActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                {isDiscoveryActive ? "Connected" : "Disconnected"}
              </Badge>
              
              {!isClientReady && (
                <Badge variant="destructive">Initializing</Badge>
              )}
              
              <Badge variant="outline" className="bg-blue-100 text-blue-800">
                {localUsers.length} Online Device{localUsers.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Network members */}
            <div className="mb-6">
              <h3 className="text-sm font-medium mb-3 text-muted-foreground uppercase">You and Others</h3>
              <div className="flex flex-wrap gap-3">
                {/* Current user */}
                <div className="flex flex-col items-center justify-center bg-primary/5 rounded-lg p-3 min-w-[80px]">
                  <Avatar className="h-12 w-12 mb-2">
                    <AvatarFallback style={{ backgroundColor: currentUser.avatar || '#9D4EDD' }}>
                      {currentUser.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{currentUser.name}</span>
                  <Badge variant="secondary" className="mt-1">You</Badge>
                </div>
                
                {/* Other users */}
                {localUsers.length > 0 ? (
                  localUsers.map(user => (
                    <div 
                      key={user.id}
                      className={`flex flex-col items-center justify-center border rounded-lg p-3 min-w-[80px] cursor-pointer transition-colors ${
                        selectedPeers.includes(user.peerId) ? 'border-primary bg-primary/5' : 'bg-background hover:bg-muted/50'
                      }`}
                      onClick={() => togglePeerSelection(user.peerId)}
                    >
                      <Avatar className="h-12 w-12 mb-2">
                        <AvatarFallback style={{ backgroundColor: user.avatar || '#9D4EDD' }}>
                          {user.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{user.name}</span>
                      <Badge 
                        variant="outline" 
                        className={`mt-1 ${selectedPeers.includes(user.peerId) ? 'bg-primary/20 text-primary' : ''}`}
                      >
                        {selectedPeers.includes(user.peerId) ? 'Selected' : 'Tap to select'}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-center w-full p-6 border rounded-lg bg-muted/10">
                    <p className="text-sm text-muted-foreground">
                      You&apos;re the only one here. Waiting for others to join...
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* File sharing section */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground uppercase">Share Files</h3>
              <div className="space-y-4">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange} 
                  multiple 
                  className="block w-full text-sm text-slate-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-md file:border-0
                    file:text-sm file:font-semibold
                    file:bg-primary/10 file:text-primary
                    hover:file:bg-primary/20"
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
                  className="w-full"
                >
                  {isSharing ? 'Sharing...' : 
                    selectedPeers.length 
                      ? `Share with ${selectedPeers.length} selected device${selectedPeers.length !== 1 ? 's' : ''}` 
                      : 'Select devices to share with'
                  }
                </Button>
              </div>
            </div>

            {/* Available files section */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground uppercase">Files Shared with You</h3>
              
              {availableFiles.length > 0 ? (
                <div className="space-y-3">
                  {availableFiles.map(file => {
                    // Check if this file is currently downloading
                    const isDownloading = downloadingFiles.some(df => 
                      df.magnetURI === file.magnetURI
                    );
                    
                    // Find download progress if available
                    const downloadInfo = downloadingFiles.find(df => 
                      df.magnetURI === file.magnetURI
                    );
                    
                    return (
                      <div key={file.id} className="flex items-center justify-between border rounded-lg p-3">
                        <div className="flex items-center space-x-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback style={{ backgroundColor: file.sender.avatar || '#9D4EDD' }}>
                              {file.sender.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium">{file.name}</p>
                              {downloadInfo?.progress === 1 && <Check className="h-3.5 w-3.5 text-green-500" />}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Shared by {file.sender.name} • {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                            {isDownloading && downloadInfo && (
                              <div className="mt-1.5 w-full max-w-[200px]">
                                <Progress value={(downloadInfo.progress || 0) * 100} className="h-1.5" />
                                <div className="flex justify-between mt-0.5">
                                  <span className="text-[10px] text-muted-foreground">
                                    {Math.round((downloadInfo.progress || 0) * 100)}%
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {((downloadInfo.downloadSpeed || 0) / 1024).toFixed(1)} KB/s
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {(!isDownloading || !downloadInfo) && (
                          <Button 
                            size="sm" 
                            onClick={() => downloadSharedFile(file.magnetURI)}
                            disabled={!isClientReady || isDownloading}
                          >
                            Download
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center w-full p-8 border rounded-lg bg-muted/10">
                  <div className="text-center">
                    <FileText className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No files have been shared yet
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t pt-4">
          <div className="w-full space-y-2">
            <div className="flex justify-between text-sm">
              <div className="flex items-center gap-1">
                <UploadCloud className="h-4 w-4" />
                <span>{(uploadSpeed / 1024).toFixed(2)} KB/s</span>
              </div>
              <div className="flex items-center gap-1">
                <DownloadCloud className="h-4 w-4" />
                <span>{(downloadSpeed / 1024).toFixed(2)} KB/s</span>
              </div>
            </div>
            {downloadingFiles.length > 0 && (
              <div className="space-y-3 mt-2">
                <h4 className="text-sm font-medium">Active Transfers:</h4>
                {downloadingFiles.map(file => (
                  <div key={file.id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="truncate max-w-[70%]">
                        {file.name || file.id.substring(0, 8)}
                      </span>
                      <span>{Math.round((file.progress || 0) * 100)}%</span>
                    </div>
                    <Progress value={(file.progress || 0) * 100} />
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