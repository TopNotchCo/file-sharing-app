"use client"

import { useState, useEffect } from "react"
import { Upload, Clipboard, Download } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

// Simulated network users
const MOCK_USERS = [
  { id: 1, name: "Alice", avatar: "/placeholder.svg?height=40&width=40" },
  { id: 2, name: "Bob", avatar: "/placeholder.svg?height=40&width=40" },
  { id: 3, name: "Charlie", avatar: "/placeholder.svg?height=40&width=40" },
]

// Simulated shared files
const MOCK_SHARED_FILES = [
  { id: 1, name: "Project Presentation.pdf", size: "2.4 MB", owner: "Alice", timestamp: new Date().toISOString() },
  {
    id: 2,
    name: "Meeting Notes.docx",
    size: "1.1 MB",
    owner: "Bob",
    timestamp: new Date(Date.now() - 300000).toISOString(),
  },
]

export default function FileSharing() {
  const { toast } = useToast()
  const [userName, setUserName] = useState<string>("")
  const [userNameSet, setUserNameSet] = useState<boolean>(false)
  const [clipboardText, setClipboardText] = useState<string>("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [connectedUsers, setConnectedUsers] = useState(MOCK_USERS)
  const [sharedFiles, setSharedFiles] = useState(MOCK_SHARED_FILES)
  const [activeTab, setActiveTab] = useState("share")

  // Simulate connection to local network
  useEffect(() => {
    toast({
      title: "Connected to local network",
      description: "You can now share files with nearby devices",
    })
  }, [toast])

  const handleSetUserName = () => {
    if (userName.trim()) {
      setUserNameSet(true)
      toast({
        title: "Name set successfully",
        description: `You'll appear as ${userName} to other users`,
      })
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0])
    }
  }

  const handleFileUpload = () => {
    if (selectedFile) {
      const newFile = {
        id: sharedFiles.length + 1,
        name: selectedFile.name,
        size: formatFileSize(selectedFile.size),
        owner: userName || "You",
        timestamp: new Date().toISOString(),
      }

      setSharedFiles([newFile, ...sharedFiles])
      toast({
        title: "File shared successfully",
        description: `${selectedFile.name} is now available to others`,
      })
      setSelectedFile(null)
    }
  }

  const handleShareClipboard = () => {
    if (clipboardText.trim()) {
      toast({
        title: "Text shared successfully",
        description: "Your clipboard text is now available to others",
      })
      setClipboardText("")
    }
  }

  const handleDownloadFile = (fileId: number) => {
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
      <Card className="max-w-md mx-auto bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
        <CardHeader>
          <CardTitle className="gradient-text">Welcome to AirShare</CardTitle>
          <CardDescription>Set your name to start sharing files</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                placeholder="Enter your name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="bg-secondary/50 border-[#9D4EDD]/30"
              />
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSetUserName} className="w-full bg-[#9D4EDD] hover:bg-[#7B2CBF]">
            Continue
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Card className="md:col-span-2 bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
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
                    <div className="flex gap-2">
                      <Input
                        id="file"
                        type="file"
                        onChange={handleFileChange}
                        className="flex-1 bg-secondary/50 border-[#9D4EDD]/30"
                      />
                      <Button
                        onClick={handleFileUpload}
                        disabled={!selectedFile}
                        size="icon"
                        className="bg-[#9D4EDD] hover:bg-[#7B2CBF]"
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                    </div>
                    {selectedFile && (
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <span>{selectedFile.name}</span>
                        <span>({formatFileSize(selectedFile.size)})</span>
                      </div>
                    )}
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
                          onClick={() => handleDownloadFile(file.id)}
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
      <div className="space-y-6">
        <Card className="bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
          <CardHeader>
            <CardTitle className="gradient-text">Your Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12 border-2 border-[#9D4EDD]/50">
                <AvatarImage src="/placeholder.svg?height=48&width=48" alt={userName} />
                <AvatarFallback className="bg-[#7B2CBF]">{userName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{userName}</p>
                <p className="text-sm text-gray-400">Connected to local network</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
          <CardHeader>
            <CardTitle className="gradient-text">Connected Users</CardTitle>
            <CardDescription>{connectedUsers.length} users on your network</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {connectedUsers.map((user) => (
                <div key={user.id} className="flex items-center gap-3">
                  <Avatar className="h-8 w-8 border border-[#9D4EDD]/50">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className="bg-[#7B2CBF]">{user.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span>{user.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
