"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import MainScreen from "./main-screen"
import { useWebTorrent } from "@/hooks/use-webtorrent"

// Simulated network users - In a real app, we'd implement network discovery
const MOCK_USERS = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
  { id: 3, name: "Charlie" },
]

export default function FileSharing() {
  const { toast } = useToast()
  const [connectedUsers] = useState(MOCK_USERS)
  const [isCopied, setIsCopied] = useState(false)
  const [currentMagnetLink, setCurrentMagnetLink] = useState<string>("")
  
  // Initialize WebTorrent hook
  const { 
    isClientReady,
    sharedFiles, 
    downloadingFiles,
    createTorrent, 
    createTextTorrent, 
    downloadTorrent 
  } = useWebTorrent()

  // All files (shared + downloading)
  const allFiles = [...sharedFiles, ...downloadingFiles]

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
      const newFile = await createTorrent(file, "You")
      
      // Show and copy magnet link
      setCurrentMagnetLink(newFile.magnetURI)
      
      toast({
        title: "File shared successfully",
        description: `${file.name} is now available to others. Share the magnet link to allow others to download.`,
      })
    } catch (err) {
      console.error("Error sharing file:", err)
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
      connectedUsers={connectedUsers}
      sharedFiles={allFiles}
      currentMagnetLink={currentMagnetLink}
      onCopyMagnetLink={handleCopyMagnetLink}
      isCopied={isCopied}
      isClientReady={isClientReady}
    />
  )
}
