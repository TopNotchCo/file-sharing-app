"use client"

import { useState, useEffect, useRef } from 'react'
import { PeerDiscovery, type PeerInfo } from '@/lib/peer-discovery'

export { type PeerInfo }

export function useLocalPeers(userName: string, clientId: string) {
  const [peers, setPeers] = useState<PeerInfo[]>([])
  const [isInitialized, setIsInitialized] = useState(false)
  const discoveryRef = useRef<PeerDiscovery | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !userName || !clientId) return

    // Initialize peer discovery
    discoveryRef.current = new PeerDiscovery(userName, clientId, (newPeers) => {
      setPeers(newPeers)
    })

    discoveryRef.current.connect()
    setIsInitialized(true)

    return () => {
      discoveryRef.current?.disconnect()
      discoveryRef.current = null
      setIsInitialized(false)
      setPeers([])
    }
  }, [userName, clientId])

  // Update username if it changes
  useEffect(() => {
    if (discoveryRef.current) {
      discoveryRef.current.updateUserName(userName)
    }
  }, [userName])

  return { peers, isInitialized }
} 