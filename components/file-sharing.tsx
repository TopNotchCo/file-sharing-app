"use client"

// First all imports must come before any other code
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useWebTorrent, SharedFile } from '@/hooks/use-webtorrent'
import { useToast } from '@/hooks/use-toast'
import { Progress } from '@/components/ui/progress'
import { formatBytes, hasWebCryptoSupport } from '@/lib/utils'
import { storage } from '@/lib/storage'
import dynamic from 'next/dynamic'
import { Share2, Shield, Zap, Users, Wifi, AlertTriangle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// Then polyfill code after imports
// Polyfill for browser environment
if (typeof globalThis !== 'undefined') {
  // Add global and process for WebTorrent
  (globalThis as { global?: typeof globalThis }).global = globalThis;
  (globalThis as { process?: { env: Record<string, string> } }).process = 
    (globalThis as { process?: { env: Record<string, string> } }).process || { env: {} };
}

// Moved to shared constants
const MAGNET_STORAGE_KEY = 'airshare-magnet-links'

// Define connection status type
type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed';

// Simplified connection status display with proper typing
const CONNECTION_STATUS: Record<ConnectionStatus | 'default', { 
  icon: string; 
  text: string;
  color: string;
}> = {
  connecting: { icon: 'animate-pulse text-amber-500', text: 'Connecting...', color: 'text-amber-500' },
  connected: { icon: 'text-green-500', text: 'Connected', color: 'text-green-500' },
  failed: { icon: 'text-red-500', text: 'Connection failed', color: 'text-red-500' },
  idle: { icon: 'text-muted-foreground', text: 'Ready', color: 'text-muted-foreground' },
  default: { icon: 'text-muted-foreground', text: 'Ready', color: 'text-muted-foreground' }
}

// Testimonials data
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

// Features data
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

// FAQ data
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
  },
  {
    icon: "💸",
    question: "Does it cost money to use the app?",
    answer: "No, AirShare is completely free to use for local file sharing between devices."
  },
  {
    icon: "🔄",
    question: "How does file sharing work?",
    answer: "AirShare uses your local network to create direct connections between devices. Just drag and drop or select files to share them instantly with nearby devices."
  },
  {
    icon: "🔐",
    question: "Do you have access to my files?",
    answer: "No, we never have access to your files. All sharing happens directly between devices on your local network."
  },
  {
    icon: "📱",
    question: "Which browsers and devices are supported?",
    answer: "AirShare works best on Chrome, Firefox, and Edge browsers. Due to technical limitations with WebRTC and Web Crypto API, there may be issues with Safari on iOS. For the best experience on mobile, we recommend using Chrome on Android or Chrome/Firefox on iOS."
  }
]

// Add a reliable copy function
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Try to use the modern Clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    
    // Fallback to older execCommand method
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // Avoid scrolling to bottom
    textArea.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 2em;
      height: 2em;
      padding: 0;
      border: none;
      outline: none;
      boxShadow: none;
      background: transparent;
    `;

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand('copy');
      textArea.remove();
      return true;
    } catch (err) {
      console.error('Error using execCommand:', err);
      textArea.remove();
      return false;
    }
  } catch (err) {
    console.error('Error copying to clipboard:', err);
    return false;
  }
}

// Helper function to get connection status display
function getConnectionStatus(status: ConnectionStatus) {
  return CONNECTION_STATUS[status] || CONNECTION_STATUS.default;
}

const ClientFileSharing = () => {
  // Consolidated state hooks
  const [state, setState] = useState({
    magnetURI: '',
    savedMagnetLinks: {} as Record<string, string>,
    activeTestimonial: 0,
    expandedFaq: null as number | null,
    hasCryptoSupport: true
  })

  // Refs consolidation
  const refs = {
    magnetLinks: useRef<Record<string, string>>({}),
    previousFiles: useRef<SharedFile[]>([]),
    lastLog: useRef<number>(0),
    lastRender: useRef<number>(0)
  }

  const { files, shareFiles, downloadFiles, connectionStatus, peerConnectionIssue } = useWebTorrent()
  const { toast: componentToast } = useToast()

  // Unified useEffect for initial setup
  useEffect(() => {
    const loadMagnetLinks = () => {
      try {
        const saved = storage.get(MAGNET_STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved)
          setState(s => ({...s, savedMagnetLinks: parsed}))
          refs.magnetLinks.current = parsed
        }
      } catch (err) {
        console.error('Error loading magnets:', err)
      }
    }

    loadMagnetLinks()
    const interval = setInterval(() => 
      setState(s => ({...s, activeTestimonial: (s.activeTestimonial + 1) % TESTIMONIALS.length})), 
      5000
    )
    return () => clearInterval(interval)
  }, [])

  // Check for Web Crypto API support on component mount
  useEffect(() => {
    const cryptoSupported = hasWebCryptoSupport();
    setState(s => ({...s, hasCryptoSupport: cryptoSupported}));
    
    if (!cryptoSupported) {
      console.warn('Web Crypto API not fully supported in this browser');
      componentToast({
        title: "Limited Browser Support",
        description: "Your browser has limited support for secure file operations. Please use Chrome, Firefox, or Edge for full functionality.",
        variant: "destructive",
        duration: 10000 // Show for 10 seconds
      });
    }
  }, [componentToast]);

  // Consolidated file handling logic
  const handleFiles = {
    onDrop: async (files: File[]) => {
      if (!files.length) return;
      
      // Check crypto support before proceeding
      if (!state.hasCryptoSupport) {
        componentToast({
          title: "Browser Not Supported",
          description: "Your current browser doesn't support secure file operations. Please use Chrome, Firefox, or Edge.",
          variant: "destructive"
        });
        return;
      }
      
      try {
        await shareFiles(files);
        componentToast({ title: 'Files ready', description: 'Share magnet link to start transfer' });
      } catch (error) {
        console.error('Error sharing files:', error);
        componentToast({ 
          title: 'Error', 
          variant: 'destructive', 
          description: 'Failed to share files. Please try again or use a different browser.' 
        });
      }
    },
    
    download: async () => {
      if (!state.magnetURI?.startsWith('magnet:?')) {
        return componentToast({ title: 'Invalid magnet', variant: 'destructive' })
      }
      try {
        await downloadFiles(state.magnetURI.trim())
        setState(s => ({...s, magnetURI: ''}))
      } catch {
        componentToast({ title: 'Download failed', variant: 'destructive' })
      }
    }
  }

  // Optimized dropzone config
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFiles.onDrop,
    noClick: false,
    noKeyboard: false
  })

  // Monitor for magnet URI changes or disappearances - with throttling
  useEffect(() => {
    // Only log every 2 seconds at most
    if (Date.now() - refs.lastLog.current < 2000) return;
    
    // Check if any magnetURIs have changed or disappeared
    files.forEach(file => {
      const prevFile = refs.previousFiles.current.find(f => f.hash === file.hash);
      
      if (prevFile) {
        if (prevFile.magnetURI && !file.magnetURI) {
          console.warn(`[MAGNET DISAPPEARED] File: ${file.name}, Hash: ${file.hash}`);
          refs.lastLog.current = Date.now();
        } else if (prevFile.magnetURI !== file.magnetURI && file.magnetURI) {
          console.log(`[MAGNET CHANGED] File: ${file.name}, Hash: ${file.hash}`);
          refs.lastLog.current = Date.now();
        }
      }
    });
    
    // Save current state for next comparison
    refs.previousFiles.current = [...files];
  }, [files]);

  // Update saved magnet links when files change - with optimization
  useEffect(() => {
    // Skip processing if no files
    if (files.length === 0) return;
    
    // Check if any file has a magnet URI that needs saving
    const hasUnsavedMagnetURI = files.some(file => 
      file.magnetURI && 
      file.hash && 
      refs.magnetLinks.current[file.hash] !== file.magnetURI
    );
    
    if (!hasUnsavedMagnetURI) return;
    
    // Only update if we have files with magnet URIs
    const newMagnetLinks = {...refs.magnetLinks.current}
    let hasChanges = false
    
    files.forEach(file => {
      if (file.magnetURI && file.hash) {
        // Only log and update if the link has changed
        if (newMagnetLinks[file.hash] !== file.magnetURI) {
          console.log(`[MAGNET LOG] File: ${file.name}, Hash: ${file.hash}, Link: ${file.magnetURI.substring(0, 30)}...`)
          newMagnetLinks[file.hash] = file.magnetURI
          hasChanges = true
        }
      }
    })
    
    if (hasChanges) {
      refs.magnetLinks.current = newMagnetLinks
      setState(s => ({...s, savedMagnetLinks: newMagnetLinks}))
      
      try {
        storage.set(MAGNET_STORAGE_KEY, JSON.stringify(newMagnetLinks))
        console.log('Saved magnet links to storage, count:', Object.keys(newMagnetLinks).length)
      } catch (err) {
        console.error('Error saving magnet links to storage:', err)
      }
    }
  }, [files])

  // Helper to get magnet link from both file object and saved storage - memoized
  const getMagnetLink = useCallback((file: SharedFile) => {
    // First try to get it from the file object
    if (file.magnetURI) {
      // Avoid excessive logging
      if (Date.now() - refs.lastLog.current > 2000) {
        console.log(`Found magnetURI in file object: ${file.name}, URI: ${file.magnetURI.substring(0, 30)}...`)
        refs.lastLog.current = Date.now();
      }
      return file.magnetURI
    }
    
    // If not available (disappeared), try to get it from saved storage
    if (file.hash && state.savedMagnetLinks[file.hash]) {
      if (Date.now() - refs.lastLog.current > 2000) {
        console.log(`Found magnetURI in storage: ${file.name}, hash: ${file.hash}`)
        refs.lastLog.current = Date.now();
      }
      return state.savedMagnetLinks[file.hash]
    }
    
    return null
  }, [state.savedMagnetLinks])

  // Memoize the file rendering to prevent unnecessary re-renders
  const renderedFiles = useMemo(() => {
    return files.map((file: SharedFile, index: number) => {
      const magnet = getMagnetLink(file)
      
      // Only log when necessary
      const shouldLog = Date.now() - refs.lastRender.current > 2000 && 
                       (index === 0 || file.status !== 'done' || file.progress < 100);
                       
      if (shouldLog) {
        console.log(`Rendering file in active transfers: ${file.name}, status: ${file.status}, progress: ${file.progress}`)
        refs.lastRender.current = Date.now();
      }
      
      // Create a truly unique key based on file attributes
      const uniqueKey = file.hash ? 
        `${file.hash}-${file.status}` : 
        `file-${file.name}-${index}`
      
      return (
        <div key={uniqueKey} className="border rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">{file.name}</span>
            <span className="text-sm text-muted-foreground">
              {formatBytes(file.size)}
            </span>
          </div>
          <Progress value={file.progress} />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>
              {file.status === 'seeding' ? 'Upload' : 'Download'}:{' '}
              {formatBytes(file.status === 'seeding' ? file.uploadSpeed : file.downloadSpeed)}/s
            </span>
            <span>{file.progress.toFixed(1)}%</span>
          </div>
          
          {/* Show magnet section if hash exists and magnet is available */}
          {magnet && (
            <div className="pt-2 space-y-2">
              <p className="text-sm font-medium text-green-600">
                ✓ File ready to share! Copy and send this magnet link:
              </p>
              <div className="flex space-x-2">
                <Input
                  value={magnet || "Magnet link not available"}
                  readOnly
                  onClick={(e) => {
                    if (magnet) e.currentTarget.select()
                  }}
                />
                {magnet && (
                  <Button 
                    onClick={async () => {
                      if (!magnet) return;
                      
                      try {
                        const success = await copyToClipboard(magnet);
                        if (success) {
                          componentToast({
                            title: 'Copied!',
                            description: 'Magnet link copied to clipboard',
                          });
                        } else {
                          componentToast({
                            title: 'Copy failed',
                            description: 'Could not copy to clipboard. Try selecting and copying manually.',
                            variant: 'destructive',
                          });
                        }
                      } catch (err) {
                        console.error('Error in copy handler:', err);
                        componentToast({
                          title: 'Copy failed',
                          description: 'Could not copy to clipboard. Try selecting and copying manually.',
                          variant: 'destructive',
                        });
                      }
                    }}
                    size="sm"
                  >
                    Copy
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )
    })
  }, [files, getMagnetLink, componentToast])

  // Remove unused connectionDisplay variable
  const currentStatus = getConnectionStatus(connectionStatus as ConnectionStatus);

  // Check if we should show the WebRTC optimization banner (show for 7 days after implementation)
  const shouldShowOptimizationBanner = () => {
    const optimizationDate = new Date('2024-06-15').getTime(); // Date when optimization was implemented
    const currentDate = new Date().getTime();
    const daysSinceOptimization = Math.floor((currentDate - optimizationDate) / (1000 * 60 * 60 * 24));
    return daysSinceOptimization <= 7;
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-10 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-background to-background/80">
      {/* Simplified connection status */}
      <div className="w-full max-w-2xl mx-auto mb-4">
        <div className={`flex items-center justify-between px-4 py-2 rounded-md border ${
          connectionStatus === 'connected' ? 'border-green-200' :
          connectionStatus === 'failed' ? 'border-red-200' : 'border-amber-200'
        }`}>
          <div className="flex items-center space-x-2">
            <Wifi className={`h-4 w-4 ${currentStatus.icon}`} />
            <span className={currentStatus.color}>
              {currentStatus.text}
            </span>
          </div>
        </div>
      </div>

      {/* WebRTC Optimization Notice */}
      {shouldShowOptimizationBanner() && connectionStatus === 'connected' && (
        <div className="w-full max-w-2xl mx-auto mb-4">
          <div className="px-4 py-3 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-900/20 text-blue-800 dark:text-blue-100">
            <div className="flex">
              <div className="flex-shrink-0">
                <Zap className="h-5 w-5 text-blue-500" />
              </div>
              <div className="ml-3 text-sm">
                <p className="font-medium">Performance Update</p>
                <p className="mt-1">We&apos;ve optimized our WebRTC connection settings to improve connection speed and reliability. Peer discovery should now be faster!</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WebRTC error alert */}
      {peerConnectionIssue && (
        <Alert variant="destructive" className="w-full max-w-2xl mx-auto mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>WebRTC Connection Failed</AlertTitle>
          <AlertDescription>
            <p>We&apos;re having trouble establishing peer-to-peer connections. This may be due to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
              <li>Your network firewall blocking WebRTC connections</li>
              <li>Corporate network restrictions</li>
              <li>VPN settings interfering with peer connections</li>
            </ul>
            <div className="mt-3 p-2 bg-red-950/20 rounded-sm text-sm">
              <p className="font-medium mb-1">Troubleshooting steps:</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Try using a different browser (Chrome works best)</li>
                <li>Connect to a different network (mobile hotspot often works)</li>
                <li>Disable any VPN or privacy extensions</li>
                <li>Check if both devices are on the same network</li>
              </ol>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Browser support banner (we can keep this) */}
      {!state.hasCryptoSupport && (
        <div className="w-full max-w-2xl mx-auto mb-6 bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-400 text-blue-700 dark:text-blue-100 p-4 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm">
                For optimal performance, we recommend using Chrome, Firefox, or Edge.
                Your current browser will work with reduced functionality.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <div className="text-center mb-12 max-w-3xl">
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-[#9D4EDD] to-[#7B2CBF] opacity-75 blur"></div>
            <div className="relative bg-background rounded-full p-4">
              <Share2 className="h-12 w-12 text-[#9D4EDD]" />
            </div>
          </div>
        </div>
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-[#9D4EDD] to-[#7B2CBF] text-transparent bg-clip-text mb-4">
          AirShare
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          The fastest way to share files between your devices. No cloud, no uploads, just instant transfers.
        </p>
      </div>

      {/* File Sharing Container */}
      <div className="w-full max-w-2xl mx-auto space-y-8 p-4 mb-12">
        {/* File Drop Zone */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Upload Files</h3>
          <p className="text-sm text-muted-foreground mb-2">
            Upload files to generate a magnet link you can share with others
          </p>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}
              ${connectionStatus === 'failed' ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <input {...getInputProps()} disabled={connectionStatus === 'failed'} />
            <div className="space-y-4">
              <div className="text-2xl font-semibold">
                {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
              </div>
              <p className="text-muted-foreground">
                {connectionStatus === 'failed' 
                  ? 'Connection failed - reload page to try again' 
                  : 'or click to select files'}
              </p>
            </div>
          </div>
        </div>

        {/* Download Section */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Download Files</h3>
          <p className="text-sm text-muted-foreground mb-2">
            Paste a magnet link shared by someone else to download their files
          </p>
          <div className="flex space-x-2">
            <Input
              placeholder="Paste magnet link here to download files"
              value={state.magnetURI}
              onChange={(e) => setState(s => ({...s, magnetURI: e.target.value}))}
              disabled={connectionStatus === 'failed'}
            />
            <Button 
              onClick={handleFiles.download}
              disabled={connectionStatus === 'failed'}
            >
              Download
            </Button>
          </div>
        </div>

        {/* Active Transfers */}
        {files.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Active Transfers</h3>
            <div className="space-y-4">
              {renderedFiles}
            </div>
          </div>
        )}
      </div>

      {/* Features and Testimonials Section */}
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-5 gap-8 mb-12">
        {/* Testimonials */}
        <div className="lg:col-span-3">
          <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-muted-foreground">What people are saying</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative h-32">
                {TESTIMONIALS.map((testimonial, index) => (
                  <div
                    key={index}
                    className={`absolute top-0 left-0 w-full transition-opacity duration-500 ease-in-out ${
                      state.activeTestimonial === index ? 'opacity-100' : 'opacity-0 pointer-events-none'
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
              <div className="flex justify-center mt-4 gap-2">
                {TESTIMONIALS.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setState(s => ({...s, activeTestimonial: index}))}
                    className={`h-2 rounded-full transition-all ${
                      state.activeTestimonial === index ? 'w-8 bg-[#9D4EDD]' : 'w-2 bg-[#9D4EDD]/30'
                    }`}
                    aria-label={`View testimonial ${index + 1}`}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Features */}
        <div className="lg:col-span-2">
          <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Key Features</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {FEATURES.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3"
                >
                  <div className="mt-1 bg-[#9D4EDD]/10 p-2 rounded-lg">
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="font-medium">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="w-full max-w-3xl mb-12">
        <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Frequently Asked Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {FAQ_ITEMS.map((faq, index) => (
              <div
                key={index}
                className={`group border border-[#9D4EDD]/20 rounded-lg transition-all ${
                  state.expandedFaq === index ? 'bg-[#9D4EDD]/5' : ''
                }`}
              >
                <button
                  className="w-full text-left px-4 py-3 flex items-center justify-between"
                  onClick={() => setState(s => ({...s, expandedFaq: state.expandedFaq === index ? null : index}))}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{faq.icon}</span>
                    <h3 className="font-medium">{faq.question}</h3>
                  </div>
                  <div className={`transform transition-transform duration-200 ${
                    state.expandedFaq === index ? 'rotate-180' : ''
                  }`}>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    state.expandedFaq === index ? 'max-h-40' : 'max-h-0'
                  }`}
                >
                  <p className="px-4 pb-4 text-muted-foreground">{faq.answer}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="mt-auto text-center text-sm text-muted-foreground mb-8">
        <p>© {new Date().getFullYear()} AirShare. All rights reserved.</p>
        <p className="mt-1">Secure, fast, and private file sharing for everyone.</p>
      </div>
    </div>
  )
}

// Create a client-only version of the component with dynamic import
const FileSharingWrapper = dynamic(() => Promise.resolve(ClientFileSharing), {
  ssr: false,
  loading: () => (
    <div className="w-full max-w-2xl mx-auto p-4 text-center">
      <p>Loading file sharing...</p>
    </div>
  ),
})

// Main component that ensures we only render on the client side
export default function FileSharing() {
  return <FileSharingWrapper />
}
