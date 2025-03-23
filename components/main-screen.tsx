"use client"

import type React from "react"
import { useState, useRef, useCallback, useEffect } from "react"
import { Upload, Clipboard, Download, X, FileText, File as FileIcon, Clock, Copy, Check, Link } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { TorrentFile } from "@/hooks/use-webtorrent"

interface MainScreenProps {
  userName: string
  onFileShare: (file: File) => void
  onTextShare: (text: string) => void
  onFileDownload: (magnetURI: string) => void
  connectedUsers: Array<{ id: number; name: string }>
  sharedFiles: TorrentFile[]
  currentMagnetLink: string
  onCopyMagnetLink: () => void
  isCopied: boolean
  isClientReady: boolean
}

export default function MainScreen({
  userName,
  onFileShare,
  onTextShare,
  onFileDownload,
  connectedUsers,
  sharedFiles,
  currentMagnetLink,
  onCopyMagnetLink,
  isCopied,
  isClientReady,
}: MainScreenProps) {
  const [clipboardText, setClipboardText] = useState<string>("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [shareMode, setShareMode] = useState<"file" | "text" | "link" | null>(null)
  const [magnetLink, setMagnetLink] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const magnetInputRef = useRef<HTMLInputElement>(null)

  // Set current magnet link when provided
  useEffect(() => {
    if (currentMagnetLink) {
      setMagnetLink(currentMagnetLink)
      setShareMode("link")
    }
  }, [currentMagnetLink])

  // Auto-detect clipboard content when focused
  useEffect(() => {
    const handlePaste = async () => {
      try {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          // Check if clipboard has text
          if (item.types.includes('text/plain')) {
            const blob = await item.getType('text/plain');
            const text = await blob.text();
            if (text && !clipboardText) {
              setClipboardText(text);
              setShareMode("text");
            }
          }
        }
      } catch {
        // Clipboard API not available or permission denied
        console.log("Clipboard detection not available");
      }
    };

    // Try to detect clipboard content when textarea is focused
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.addEventListener('focus', handlePaste);
      return () => textarea.removeEventListener('focus', handlePaste);
    }
  }, [clipboardText]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0])
      setShareMode("file")
    }
  }

  const handleFileUpload = () => {
    if (selectedFile) {
      onFileShare(selectedFile)
      setSelectedFile(null)
    }
  }

  const handleShareClipboard = () => {
    if (clipboardText.trim()) {
      onTextShare(clipboardText)
      setClipboardText("")
    }
  }

  const handleDownloadFromMagnet = () => {
    if (magnetLink.trim()) {
      onFileDownload(magnetLink)
      setMagnetLink("")
      setShareMode(null)
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setShareMode("file")
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0])
      setShareMode("file")
    }
  }, [])

  const formatTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.round(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Unified sharing area - always visible */}
            <div className="flex-1 space-y-6">
              <div className="flex items-center justify-between pt-4">
                <h3 className="text-lg font-medium gradient-text">Share Content</h3>
                <Badge 
                  variant={isClientReady ? "outline" : "destructive"}
                  className={isClientReady ? "border-[#9D4EDD]/30 text-[#9D4EDD]" : ""}
                >
                  {isClientReady 
                    ? `${connectedUsers.length} ${connectedUsers.length === 1 ? 'device' : 'devices'}`
                    : "WebTorrent not ready"
                  }
                </Badge>
              </div>
              
              <div 
                className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors min-h-[200px] flex flex-col items-center justify-center ${
                  isDragging
                    ? "border-[#9D4EDD] bg-[#9D4EDD]/10"
                    : "border-[#9D4EDD]/30 hover:border-[#9D4EDD]/60"
                }`}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input id="file" type="file" onChange={handleFileChange} className="hidden" ref={fileInputRef} />
                
                {/* Share mode selector - only shown when nothing is being shared */}
                {!shareMode && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-center">
                      <div className="bg-[#9D4EDD]/20 p-4 rounded-full">
                        <Upload className="h-8 w-8 text-[#9D4EDD]" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium">Drop a file or paste text to share</h3>
                      <p className="text-sm text-gray-400 mt-1">Instantly share with P2P technology</p>
                    </div>
                    <div className="flex gap-3 justify-center flex-wrap">
                      <Button
                        onClick={() => {
                          setShareMode("file");
                          fileInputRef.current?.click();
                        }}
                        variant="outline"
                        className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                        disabled={!isClientReady}
                      >
                        <FileIcon className="h-4 w-4 mr-2" />
                        Select File
                      </Button>
                      <Button
                        onClick={() => {
                          setShareMode("text");
                          setTimeout(() => textareaRef.current?.focus(), 100);
                        }}
                        variant="outline"
                        className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                        disabled={!isClientReady}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Share Text
                      </Button>
                      <Button
                        onClick={() => {
                          setShareMode("link");
                          setTimeout(() => magnetInputRef.current?.focus(), 100);
                        }}
                        variant="outline"
                        className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                        disabled={!isClientReady}
                      >
                        <Link className="h-4 w-4 mr-2" />
                        Download from Magnet
                      </Button>
                    </div>
                  </div>
                )}

                {/* File sharing UI */}
                {shareMode === "file" && selectedFile && (
                  <div className="space-y-4 w-full max-w-md">
                    <div className="flex items-center justify-center">
                      <div className="bg-[#9D4EDD]/20 p-3 rounded-full">
                        <Upload className="h-6 w-6 text-[#9D4EDD]" />
                      </div>
                    </div>
                    <div>
                      <p className="font-medium text-white">{selectedFile.name}</p>
                      <p className="text-sm text-gray-400">
                        {selectedFile.size < 1024 
                          ? selectedFile.size + " B"
                          : selectedFile.size < 1048576 
                            ? (selectedFile.size / 1024).toFixed(1) + " KB"
                            : (selectedFile.size / 1048576).toFixed(1) + " MB"
                        }
                      </p>
                    </div>
                    <div className="flex gap-2 justify-center">
                      <Button
                        onClick={() => {
                          setSelectedFile(null);
                          setShareMode(null);
                        }}
                        variant="outline"
                        className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleFileUpload} 
                        className="bg-[#9D4EDD] hover:bg-[#7B2CBF]"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Share Now
                      </Button>
                    </div>
                  </div>
                )}

                {/* Text sharing UI */}
                {shareMode === "text" && (
                  <div className="space-y-4 w-full max-w-md">
                    <div className="flex items-center justify-center">
                      <div className="bg-[#9D4EDD]/20 p-3 rounded-full">
                        <FileText className="h-6 w-6 text-[#9D4EDD]" />
                      </div>
                    </div>
                    <Textarea
                      ref={textareaRef}
                      placeholder="Type or paste text to share"
                      value={clipboardText}
                      onChange={(e) => setClipboardText(e.target.value)}
                      className="min-h-[100px] bg-secondary/50 border-[#9D4EDD]/30"
                      autoFocus
                    />
                    <div className="flex gap-2 justify-center">
                      <Button
                        onClick={() => {
                          setClipboardText("");
                          setShareMode(null);
                        }}
                        variant="outline"
                        className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                      <Button
                        onClick={handleShareClipboard}
                        disabled={!clipboardText.trim()}
                        className="bg-[#9D4EDD] hover:bg-[#7B2CBF]"
                      >
                        <Clipboard className="h-4 w-4 mr-2" />
                        Share Text
                      </Button>
                    </div>
                  </div>
                )}

                {/* Magnet link (download) UI */}
                {shareMode === "link" && (
                  <div className="space-y-4 w-full max-w-md">
                    <div className="flex items-center justify-center">
                      <div className="bg-[#9D4EDD]/20 p-3 rounded-full">
                        <Link className="h-6 w-6 text-[#9D4EDD]" />
                      </div>
                    </div>
                    <Input
                      ref={magnetInputRef}
                      placeholder="Paste magnet URI here"
                      value={magnetLink}
                      onChange={(e) => setMagnetLink(e.target.value)}
                      className="bg-secondary/50 border-[#9D4EDD]/30"
                      autoFocus
                    />
                    
                    {currentMagnetLink && (
                      <div className="flex flex-col items-center">
                        <p className="text-sm text-center text-muted-foreground mb-2">
                          Share this magnet link with others so they can download your file:
                        </p>
                        <Button
                          onClick={onCopyMagnetLink}
                          variant="outline"
                          className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                        >
                          {isCopied ? (
                            <>
                              <Check className="h-4 w-4 mr-2" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Magnet Link
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                    
                    <div className="flex gap-2 justify-center">
                      <Button
                        onClick={() => {
                          setMagnetLink("");
                          setShareMode(null);
                        }}
                        variant="outline"
                        className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                      
                      {!currentMagnetLink && (
                        <Button
                          onClick={handleDownloadFromMagnet}
                          disabled={!magnetLink.trim() || !magnetLink.startsWith('magnet:')}
                          className="bg-[#9D4EDD] hover:bg-[#7B2CBF]"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Close button for any share mode */}
                {shareMode && (
                  <Button
                    onClick={() => {
                      setShareMode(null);
                      setSelectedFile(null);
                      setClipboardText("");
                      setMagnetLink("");
                    }}
                    size="icon"
                    variant="ghost"
                    className="absolute top-2 right-2 h-8 w-8 rounded-full hover:bg-[#9D4EDD]/10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Available files - always visible */}
            <div className="flex-1 space-y-6">
              <div className="flex items-center justify-between pt-4">
                <h3 className="text-lg font-medium gradient-text">Available Files</h3>
                <Badge variant="outline" className="border-[#9D4EDD]/30 text-[#9D4EDD]">
                  {sharedFiles.length} {sharedFiles.length === 1 ? 'item' : 'items'}
                </Badge>
              </div>
              
              {sharedFiles.length > 0 ? (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {sharedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex flex-col p-3 rounded-lg border border-[#9D4EDD]/30 bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="bg-[#9D4EDD]/10 p-2 rounded-full">
                            <FileIcon className="h-5 w-5 text-[#9D4EDD]" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium">{file.name}</span>
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                              <span>{file.size}</span>
                              <span>•</span>
                              <span>From: {file.owner}</span>
                              <span>•</span>
                              <span>{file.timestamp ? formatTimeAgo(file.timestamp) : 'Unknown'}</span>
                            </div>
                          </div>
                        </div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  // Copy the magnet link to clipboard
                                  if (file.magnetURI) {
                                    navigator.clipboard.writeText(file.magnetURI);
                                    
                                    // Show notification 
                                    const toast = document.getElementById('toast');
                                    if (toast) {
                                      toast.classList.remove('hidden');
                                      setTimeout(() => toast.classList.add('hidden'), 2000);
                                    }
                                  }
                                }}
                                className="hover:bg-[#9D4EDD]/20"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Copy magnet link</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      
                      {/* Progress bar for downloading files */}
                      {file.downloading && typeof file.progress === 'number' && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs mb-1">
                            <span>Downloading</span>
                            <span>{file.progress}%</span>
                          </div>
                          <Progress 
                            value={file.progress} 
                            className="h-2"
                            indicatorClassName="bg-[#9D4EDD]"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-[#9D4EDD]/20 rounded-lg bg-secondary/10">
                  <Clock className="h-10 w-10 text-[#9D4EDD]/40 mb-3" />
                  <p className="text-center text-gray-500">No files have been shared yet</p>
                  <p className="text-center text-xs text-gray-400 mt-1">
                    Files shared by others will appear here
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="h-14 w-14 border-2 border-[#9D4EDD]/50 bg-[#7B2CBF]">
                  <AvatarFallback>{userName.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-green-500 border-2 border-background" />
              </div>
              <div>
                <CardTitle className="gradient-text text-xl">{userName}</CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {connectedUsers.map((user) => (
                      <Avatar key={user.id} className="h-6 w-6 border-2 border-background bg-[#7B2CBF]">
                        <AvatarFallback className="text-xs">{user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <span>{connectedUsers.length} users connected</span>
                </CardDescription>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              <div className={`h-2 w-2 rounded-full ${isClientReady ? 'bg-green-500' : 'bg-red-500'}`} />
              {isClientReady ? 'Connected to P2P network' : 'Connecting to P2P network...'}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-lg border border-[#9D4EDD]/20 bg-card/30">
            <div className="px-4 py-3 border-b border-[#9D4EDD]/20">
              <h3 className="text-sm font-medium text-muted-foreground">Connected Users</h3>
            </div>
            <div className="divide-y divide-[#9D4EDD]/20">
              {connectedUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between px-4 py-3 hover:bg-[#9D4EDD]/5 transition-colors">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 border border-[#9D4EDD]/50 bg-[#7B2CBF]">
                      <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">Active now</p>
                    </div>
                  </div>
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Toast notification for copied links */}
      <div 
        id="toast" 
        className="hidden fixed bottom-4 right-4 bg-[#9D4EDD] text-white px-4 py-2 rounded-md shadow-lg"
      >
        Magnet link copied to clipboard
      </div>
    </div>
  )
}
