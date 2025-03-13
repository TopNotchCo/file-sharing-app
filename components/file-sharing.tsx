"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import OnboardingScreen from "./onboarding-screen"
import MainScreen from "./main-screen"

// Simulated network users
const MOCK_USERS = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
  { id: 3, name: "Charlie" },
]

// Initial shared files without timestamps
const INITIAL_SHARED_FILES = [
  { id: 1, name: "Project Presentation.pdf", size: "2.4 MB", owner: "Alice" },
  { id: 2, name: "Meeting Notes.docx", size: "1.1 MB", owner: "Bob" },
]

export default function FileSharing() {
  const { toast } = useToast()
  const [userName, setUserName] = useState<string>("")
  const [userNameSet, setUserNameSet] = useState<boolean>(false)
  const [sharedFiles, setSharedFiles] = useState(INITIAL_SHARED_FILES)
  const [connectedUsers] = useState(MOCK_USERS)

  // Add timestamps to shared files after initial render
  useEffect(() => {
    setSharedFiles(files => 
      files.map(file => ({
        ...file,
        timestamp: file.id === 1 ? new Date().toISOString() : new Date(Date.now() - 300000).toISOString()
      }))
    )
  }, [])

  // Simulate connection to local network
  useEffect(() => {
    toast({
      title: "Connected to local network",
      description: "You can now share files with nearby devices",
    })
  }, [toast])

  const handleFileShare = (file: File) => {
    const newFile = {
      id: sharedFiles.length + 1,
      name: file.name,
      size: formatFileSize(file.size),
      owner: userName || "You",
      timestamp: new Date().toISOString(),
    }

    setSharedFiles([newFile, ...sharedFiles])
    toast({
      title: "File shared successfully",
      description: `${file.name} is now available to others`,
    })
  }

  const handleTextShare = (text: string) => {
    toast({
      title: "Text shared successfully",
      description: `"${text.slice(0, 30)}${text.length > 30 ? '...' : ''}" is now available to others`,
    })
  }

  const handleFileDownload = (fileId: number) => {
    const file = sharedFiles.find((f) => f.id === fileId)
    if (file) {
      toast({
        title: "Download started",
        description: `Downloading ${file.name}`,
      })
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B"
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB"
    else return (bytes / 1048576).toFixed(1) + " MB"
  }

  if (!userNameSet) {
    return (
      <OnboardingScreen
        userName={userName}
        onUserNameChange={setUserName}
        onComplete={() => {
          setUserNameSet(true)
          toast({
            title: "Name set successfully",
            description: `You'll appear as ${userName} to other users`,
          })
        }}
      />
    )
  }

  return (
    <MainScreen
      userName={userName}
      onFileShare={handleFileShare}
      onTextShare={handleTextShare}
      onFileDownload={handleFileDownload}
      connectedUsers={connectedUsers}
      sharedFiles={sharedFiles}
    />
  )
}
