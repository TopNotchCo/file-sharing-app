"use client"

import type React from "react"
import { useState, useRef, useCallback, useEffect } from "react"
import { Upload, Clipboard, Download, X, FileText, File as FileIcon, Clock } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface MainScreenProps {
  userName: string
  onFileShare: (file: File) => void
  onTextShare: (text: string) => void
  onFileDownload: (fileId: string) => void
  connectedUsers: Array<{ id: string; name: string; lastSeen: number }>
  sharedFiles: Array<{ id: string; name: string; size: string; owner: string }>
}

export default function MainScreen({
  userName,
  onFileShare,
  onTextShare,
  onFileDownload,
  connectedUsers,
  sharedFiles,
}: MainScreenProps) {
  const [clipboardText, setClipboardText] = useState<string>("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [shareMode, setShareMode] = useState<"file" | "text" | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
      setShareMode(null)
    }
  }

  const handleShareClipboard = () => {
    if (clipboardText.trim()) {
      onTextShare(clipboardText)
      setClipboardText("")
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

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B"
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB"
    else return (bytes / 1048576).toFixed(1) + " MB"
  }

  // Function to check if a user is currently active (within last 10 seconds)
  const isUserActive = (lastSeen: number) => {
    return Date.now() - lastSeen < 10000
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
      
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Unified sharing area - always visible */}
            <div className="flex-1 space-y-6">
              <div className="flex items-center justify-between pt-4">
                <h3 className="text-lg font-medium gradient-text">Share Content</h3>
                <Badge variant="outline" className="border-[#9D4EDD]/30 text-[#9D4EDD]">
                  {connectedUsers.length} {connectedUsers.length === 1 ? 'device' : 'devices'}
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
                      <p className="text-sm text-gray-400 mt-1">Instantly share with {connectedUsers.length} connected devices</p>
                    </div>
                    <div className="flex gap-3 justify-center">
                      <Button
                        onClick={() => {
                          setShareMode("file");
                          fileInputRef.current?.click();
                        }}
                        variant="outline"
                        className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
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
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Share Text
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
                      <p className="text-sm text-gray-400">{formatFileSize(selectedFile.size)}</p>
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

                {/* Close button for any share mode */}
                {shareMode && (
                  <Button
                    onClick={() => {
                      setShareMode(null);
                      setSelectedFile(null);
                      setClipboardText("");
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
                      className="flex items-center justify-between p-3 rounded-lg border border-[#9D4EDD]/30 bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    >
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
                          </div>
                        </div>
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onFileDownload(file.id)}
                              className="hover:bg-[#9D4EDD]/20"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Download file</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
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
              <div className="h-2 w-2 rounded-full bg-green-500" />
              Connected to local network
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
                      <p className="text-xs text-muted-foreground">
                        {isUserActive(user.lastSeen) ? 'Active now' : 'Recently active'}
                      </p>
                    </div>
                  </div>
                  <div className={`h-2 w-2 rounded-full ${
                    isUserActive(user.lastSeen) ? 'bg-green-500' : 'bg-yellow-500'
                  }`} />
                </div>
              ))}
              {connectedUsers.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 text-[#9D4EDD]/40" />
                  <p>No other users connected</p>
                  <p className="text-xs mt-1">Share this app with others on your network</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
