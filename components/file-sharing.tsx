"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWebTorrent, SharedFile } from '@/hooks/use-webtorrent'
import { useToast } from '@/hooks/use-toast'
import { Progress } from '@/components/ui/progress'
import { formatBytes } from '@/lib/utils'
import OnboardingScreen from "./onboarding-screen"
import { storage, STORAGE_KEYS } from '@/lib/storage'
import dynamic from 'next/dynamic'

// Store generated magnet links
const MAGNET_STORAGE_KEY = 'airshare-magnet-links'

// Create a client-only component for the file sharing interface
const ClientFileSharing = () => {
  // State hooks
  const [userName, setUserName] = useState<string>("")
  const [userNameSet, setUserNameSet] = useState<boolean>(false)
  const [magnetURI, setMagnetURI] = useState('')
  const [savedMagnetLinks, setSavedMagnetLinks] = useState<{[key: string]: string}>({})
  const magnetLinksRef = useRef<{[key: string]: string}>({})
  const previousFilesRef = useRef<SharedFile[]>([]);
  const lastLogTimeRef = useRef<number>(0);
  const lastRenderTimeRef = useRef<number>(0);
  
  // Other hooks
  const { files, shareFiles, downloadFiles } = useWebTorrent()
  const { toast } = useToast()
  
  // Load saved data from storage
  useEffect(() => {
    // Load saved username from storage
    const savedUserName = storage.get(STORAGE_KEYS.USER_NAME)
    if (savedUserName) {
      setUserName(savedUserName)
      setUserNameSet(true)
    }
    
    // Load saved magnet links
    try {
      const savedLinks = storage.get(MAGNET_STORAGE_KEY)
      if (savedLinks) {
        const parsedLinks = JSON.parse(savedLinks)
        setSavedMagnetLinks(parsedLinks)
        magnetLinksRef.current = parsedLinks
        console.log('Loaded saved magnet links:', parsedLinks)
      }
    } catch (err) {
      console.error('Error loading saved magnet links:', err)
    }
  }, [])

  // Monitor for magnet URI changes or disappearances - with throttling
  useEffect(() => {
    // Only log every 2 seconds at most
    if (Date.now() - lastLogTimeRef.current < 2000) return;
    
    // Check if any magnetURIs have changed or disappeared
    files.forEach(file => {
      const prevFile = previousFilesRef.current.find(f => f.hash === file.hash);
      
      if (prevFile) {
        if (prevFile.magnetURI && !file.magnetURI) {
          console.warn(`[MAGNET DISAPPEARED] File: ${file.name}, Hash: ${file.hash}`);
          lastLogTimeRef.current = Date.now();
        } else if (prevFile.magnetURI !== file.magnetURI && file.magnetURI) {
          console.log(`[MAGNET CHANGED] File: ${file.name}, Hash: ${file.hash}`);
          lastLogTimeRef.current = Date.now();
        }
      }
    });
    
    // Save current state for next comparison
    previousFilesRef.current = [...files];
  }, [files]);

  // Update saved magnet links when files change - with optimization
  useEffect(() => {
    // Skip processing if no files
    if (files.length === 0) return;
    
    // Check if any file has a magnet URI that needs saving
    const hasUnsavedMagnetURI = files.some(file => 
      file.magnetURI && 
      file.hash && 
      magnetLinksRef.current[file.hash] !== file.magnetURI
    );
    
    if (!hasUnsavedMagnetURI) return;
    
    // Only update if we have files with magnet URIs
    const newMagnetLinks = {...magnetLinksRef.current}
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
      magnetLinksRef.current = newMagnetLinks
      setSavedMagnetLinks(newMagnetLinks)
      
      try {
        storage.set(MAGNET_STORAGE_KEY, JSON.stringify(newMagnetLinks))
        console.log('Saved magnet links to storage, count:', Object.keys(newMagnetLinks).length)
      } catch (err) {
        console.error('Error saving magnet links to storage:', err)
      }
    }
  }, [files])

  // Save username to storage
  const handleSetUserName = useCallback((name: string) => {
    setUserName(name)
    storage.set(STORAGE_KEYS.USER_NAME, name)
  }, [])

  const handleCompleteOnboarding = useCallback(() => {
    storage.set(STORAGE_KEYS.USER_NAME, userName)
    setUserNameSet(true)
  }, [userName])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return

    try {
      console.log('Attempting to share files:', acceptedFiles.map(f => f.name).join(', '))
      await shareFiles(acceptedFiles)
      
      toast({
        title: 'Files ready to share',
        description: 'Share the magnet link with others to start the transfer.',
      })
    } catch (err) {
      console.error('Error sharing files:', err)
      toast({
        title: 'Error',
        description: 'Failed to share files. Please try again.',
        variant: 'destructive',
      })
    }
  }, [shareFiles, toast])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: false,
    noKeyboard: false,
  })

  const handleDownload = useCallback(async () => {
    if (!magnetURI) {
      toast({
        title: 'Error',
        description: 'Please enter a magnet link to download files.',
        variant: 'destructive',
      })
      return
    }

    // Validate magnet link format
    if (!magnetURI.startsWith('magnet:?')) {
      toast({
        title: 'Invalid magnet link',
        description: 'Please enter a valid magnet link starting with "magnet:?"',
        variant: 'destructive',
      })
      return
    }
    
    console.log('Starting download with magnet:', magnetURI.substring(0, 30) + '...')

    try {
      await downloadFiles(magnetURI.trim())
      setMagnetURI('')
      toast({
        title: 'Download started',
        description: 'File download has been initiated.',
      })
    } catch (err) {
      console.error('Error downloading files:', err)
      toast({
        title: 'Error',
        description: 'Failed to download files. Please check the magnet link and try again.',
        variant: 'destructive',
      })
    }
  }, [magnetURI, downloadFiles, toast])

  // Helper to get magnet link from both file object and saved storage - memoized
  const getMagnetLink = useCallback((file: SharedFile) => {
    // First try to get it from the file object
    if (file.magnetURI) {
      // Avoid excessive logging
      if (Date.now() - lastLogTimeRef.current > 2000) {
        console.log(`Found magnetURI in file object: ${file.name}, URI: ${file.magnetURI.substring(0, 30)}...`)
        lastLogTimeRef.current = Date.now();
      }
      return file.magnetURI
    }
    
    // If not available (disappeared), try to get it from saved storage
    if (file.hash && savedMagnetLinks[file.hash]) {
      if (Date.now() - lastLogTimeRef.current > 2000) {
        console.log(`Found magnetURI in storage: ${file.name}, hash: ${file.hash}`)
        lastLogTimeRef.current = Date.now();
      }
      return savedMagnetLinks[file.hash]
    }
    
    return null
  }, [savedMagnetLinks])

  // Memoize the file rendering to prevent unnecessary re-renders
  const renderedFiles = useMemo(() => {
    return files.map((file: SharedFile, index: number) => {
      const magnet = getMagnetLink(file)
      
      // Only log when necessary
      const shouldLog = Date.now() - lastRenderTimeRef.current > 2000 && 
                       (index === 0 || file.status !== 'done' || file.progress < 100);
                       
      if (shouldLog) {
        console.log(`Rendering file in active transfers: ${file.name}, status: ${file.status}, progress: ${file.progress}`)
        lastRenderTimeRef.current = Date.now();
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
                    onClick={() => {
                      navigator.clipboard.writeText(magnet)
                      toast({
                        title: 'Copied!',
                        description: 'Magnet link copied to clipboard',
                      })
                      console.log('Copied magnet:', magnet)
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
  }, [files, getMagnetLink, toast])

  // If username is not set, show onboarding screen
  if (!userNameSet) {
    return (
      <OnboardingScreen
        userName={userName}
        onUserNameChange={handleSetUserName}
        onComplete={handleCompleteOnboarding}
      />
    )
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8 p-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">Welcome, {userName}!</h1>
        <p className="text-muted-foreground mt-2">Share files securely with P2P technology</p>
      </div>

      {/* File Drop Zone */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Upload Files</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Upload files to generate a magnet link you can share with others
        </p>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
        >
          <input {...getInputProps()} />
          <div className="space-y-4">
            <div className="text-2xl font-semibold">
              {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
            </div>
            <p className="text-muted-foreground">
              or click to select files
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
            value={magnetURI}
            onChange={(e) => setMagnetURI(e.target.value)}
          />
          <Button onClick={handleDownload}>
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

      {/* Debug Info */}
      <div className="mt-8 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
        <h3 className="text-sm font-medium mb-2">Debug Info (Saved Magnet Links)</h3>
        <div className="text-xs overflow-auto max-h-40">
          {Object.entries(savedMagnetLinks).map(([hash, link]) => (
            <div key={hash} className="mb-2">
              <div><strong>Hash:</strong> {hash}</div>
              <div className="break-all"><strong>Link:</strong> {link}</div>
            </div>
          ))}
        </div>
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
