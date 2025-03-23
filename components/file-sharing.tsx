"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import MainScreen from "./main-screen"
import { useWebTorrent } from "@/hooks/use-webtorrent"
import { CheckCircle2, Share2, Shield, Zap, Users, ChevronDown } from "lucide-react"

// Simulated network users
const MOCK_USERS = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
  { id: 3, name: "Charlie" },
]

const FEATURES = [
  {
    icon: <Share2 className="h-6 w-6 text-[#9D4EDD]" />,
    title: "Instant Sharing",
    description: "Share files instantly with nearby devices with just a few clicks"
  },
  {
    icon: <Shield className="h-6 w-6 text-[#9D4EDD]" />,
    title: "End-to-End Encryption",
    description: "Your files are protected with state-of-the-art encryption"
  },
  {
    icon: <Zap className="h-6 w-6 text-[#9D4EDD]" />,
    title: "Lightning Fast",
    description: "Transfer files at maximum speed over your local network"
  },
  {
    icon: <Users className="h-6 w-6 text-[#9D4EDD]" />,
    title: "Multiple Devices",
    description: "Connect and share with multiple devices simultaneously"
  }
]

const TESTIMONIALS = [
  {
    name: "Sarah K.",
    role: "Designer",
    quote: "AirShare has completely transformed how I share design files with my team. So simple and fast!"
  },
  {
    name: "Michael T.",
    role: "Developer",
    quote: "I use AirShare daily to transfer files between my devices. It's become an essential tool in my workflow."
  },
  {
    name: "Jessica L.",
    role: "Photographer",
    quote: "Sharing high-resolution photos has never been easier. AirShare is a game-changer for my business."
  }
]

const FAQ_ITEMS = [
  {
    icon: "🔒",
    question: "Is my data secure?",
    answer: "Yes, all file transfers are end-to-end encrypted and happen directly between devices on your local network. We never store your files on any servers."
  },
  {
    icon: "💰",
    question: "Do you sell my data?",
    answer: "No, we do not collect or sell any of your personal data. AirShare operates completely locally on your network."
  },
  {
    icon: "🔥",
    question: "If I delete my data, is it truly gone?",
    answer: "Yes, since files are only shared temporarily during the session and aren't stored on any servers, once deleted they are permanently removed."
  }
]

// Update MainScreen props by removing userName requirement
interface MainScreenProps {
  onFileShare: (file: File) => Promise<void>
  onTextShare: (text: string) => Promise<void>
  onFileDownload: (magnetURI: string) => Promise<void>
  connectedUsers: Array<{ id: number; name: string }>
  sharedFiles: any[]
  currentMagnetLink: string
  onCopyMagnetLink: () => void
  isCopied: boolean
  isClientReady: boolean
}

export default function FileSharing() {
  const { toast } = useToast()
  const [connectedUsers] = useState(MOCK_USERS)
  const [isCopied, setIsCopied] = useState(false)
  const [currentMagnetLink, setCurrentMagnetLink] = useState<string>("")
  const [activeTestimonial, setActiveTestimonial] = useState(0)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)
  
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

  useEffect(() => {
    // Rotate testimonials every 5 seconds
    const interval = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % TESTIMONIALS.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

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
      const newFile = await createTorrent(file, "Anonymous")
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
      const newFile = await createTextTorrent(text, "Anonymous")
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
    <div className="min-h-screen flex flex-col items-center py-10 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-background to-background/80">
      {/* Hero Section with File Sharing */}
      <div className="w-full max-w-4xl mb-16">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-[#9D4EDD] to-[#7B2CBF] text-transparent bg-clip-text mb-4">
            Share Files Instantly
          </h1>
          <p className="text-xl text-muted-foreground">
            No cloud, no uploads, just instant transfers between devices.
          </p>
        </div>

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
      </div>

      {/* Features Grid */}
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        {FEATURES.map((feature, index) => (
          <Card key={index} className="bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
            <CardHeader className="pb-2">
              <div className="bg-[#9D4EDD]/10 p-2 rounded-lg w-fit">
                {feature.icon}
              </div>
            </CardHeader>
            <CardContent>
              <h3 className="font-medium mb-1">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Testimonials and FAQ */}
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
        {/* Testimonials */}
        <Card className="bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
          <CardHeader>
            <CardTitle>What People Say</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative h-48">
              {TESTIMONIALS.map((testimonial, index) => (
                <div
                  key={index}
                  className={`absolute top-0 left-0 w-full transition-opacity duration-500 ease-in-out ${
                    activeTestimonial === index ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  <blockquote className="italic text-lg mb-4">&ldquo;{testimonial.quote}&rdquo;</blockquote>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-r from-[#9D4EDD] to-[#7B2CBF] flex items-center justify-center text-white font-medium">
                      {testimonial.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium">{testimonial.name}</p>
                      <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card className="bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
          <CardHeader>
            <CardTitle>FAQ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {FAQ_ITEMS.map((faq, index) => (
              <div
                key={index}
                className="border border-[#9D4EDD]/20 rounded-lg"
              >
                <button
                  className="w-full text-left px-4 py-3 flex items-center justify-between"
                  onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                >
                  <div className="flex items-center gap-2">
                    <span>{faq.icon}</span>
                    <span className="font-medium">{faq.question}</span>
                  </div>
                  <ChevronDown
                    className={`w-5 h-5 transition-transform ${
                      expandedFaq === index ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {expandedFaq === index && (
                  <div className="px-4 pb-3 text-sm text-muted-foreground">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <footer className="text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} AirShare. All rights reserved.</p>
        <p className="mt-1">Secure, fast, and private file sharing for everyone.</p>
      </footer>
    </div>
  )
}
