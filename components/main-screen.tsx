"use client"

import type React from "react"
import { useState, useRef, useCallback } from "react"
import { Upload, Clipboard, Download } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

interface MainScreenProps {
  userName: string
  onFileShare: (file: File) => void
  onTextShare: (text: string) => void
  onFileDownload: (fileId: number) => void
  connectedUsers: Array<{ id: number; name: string }>
  sharedFiles: Array<{ id: number; name: string; size: string; owner: string }>
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
  const [activeTab, setActiveTab] = useState("share")
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0])
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

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
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
    }
  }, [])

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B"
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB"
    else return (bytes / 1048576).toFixed(1) + " MB"
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
        <CardHeader>
          <CardTitle className="gradient-text">Share Files & Text</CardTitle>
          <CardDescription>Share files or clipboard text with devices on your network</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 bg-secondary">
              <TabsTrigger value="share">Share</TabsTrigger>
              <TabsTrigger value="receive">Receive</TabsTrigger>
            </TabsList>
            <TabsContent value="share" className="space-y-4 pt-4">
              <div className="space-y-4">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="file">Upload File</Label>
                    <div
                      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
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

                      {selectedFile ? (
                        <div className="space-y-4">
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
                              onClick={() => setSelectedFile(null)}
                              variant="outline"
                              className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                            >
                              Change
                            </Button>
                            <Button onClick={handleFileUpload} className="bg-[#9D4EDD] hover:bg-[#7B2CBF]">
                              Share File
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center justify-center">
                            <div className="bg-[#9D4EDD]/20 p-3 rounded-full">
                              <Upload className="h-6 w-6 text-[#9D4EDD]" />
                            </div>
                          </div>
                          <div>
                            <p className="font-medium">Drag and drop your file here</p>
                            <p className="text-sm text-gray-400">or click to browse</p>
                          </div>
                          <Button
                            onClick={() => fileInputRef.current?.click()}
                            variant="outline"
                            className="border-[#9D4EDD]/30 hover:bg-[#9D4EDD]/10"
                          >
                            Select File
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clipboard">Share Text</Label>
                    <div className="flex gap-2">
                      <Textarea
                        id="clipboard"
                        placeholder="Paste text to share"
                        value={clipboardText}
                        onChange={(e) => setClipboardText(e.target.value)}
                        className="flex-1 bg-secondary/50 border-[#9D4EDD]/30"
                      />
                      <Button
                        onClick={handleShareClipboard}
                        disabled={!clipboardText.trim()}
                        size="icon"
                        className="self-start bg-[#9D4EDD] hover:bg-[#7B2CBF]"
                      >
                        <Clipboard className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="receive" className="space-y-4 pt-4">
              <div className="space-y-4">
                <h3 className="text-lg font-medium gradient-text">Available Files</h3>
                {sharedFiles.length > 0 ? (
                  <div className="space-y-2">
                    {sharedFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-[#9D4EDD]/30 bg-secondary/30"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{file.name}</span>
                          <div className="flex items-center gap-2 text-sm text-gray-400">
                            <span>{file.size}</span>
                            <span>•</span>
                            <span>From: {file.owner}</span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onFileDownload(file.id)}
                          className="hover:bg-[#9D4EDD]/20"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">No files have been shared yet</div>
                )}
              </div>
            </TabsContent>
          </Tabs>
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
    </div>
  )
}
