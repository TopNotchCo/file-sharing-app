"use client"

import type WebTorrent from "webtorrent"
import { TORRENT_CONFIG } from './webtorrent-config'

// Define a type for the WebTorrent instance
export interface WebTorrentInstance {
  peerId?: string
  ready?: boolean
  on(event: string, callback: (arg?: unknown) => void): void
  once(event: string, callback: (arg?: unknown) => void): void
  off(event: string, callback: (arg?: unknown) => void): void
  destroy(callback?: (err: Error | null) => void): void
  seed(files: File[], opts?: object, callback?: (torrent: unknown) => void): void
  add(torrentId: string, opts?: object, callback?: (torrent: unknown) => void): void
}

// Type for our client factory
type WebTorrentFactory = () => Promise<WebTorrentInstance>

/**
 * Create a WebTorrent client with the proper configuration 
 * This is wrapped in a factory function to ensure it's only loaded in the browser
 */
export const createWebTorrentClient: WebTorrentFactory = async () => {
  // Server-side guard
  if (typeof window === 'undefined') {
    throw new Error('WebTorrent can only be used in browser environments')
  }
  
  // Dynamically import WebTorrent to prevent SSR issues
  const WebTorrentModule = await import('webtorrent/dist/webtorrent.min.js')
  const WebTorrentClass = WebTorrentModule.default as typeof WebTorrent
  
  return new WebTorrentClass(TORRENT_CONFIG) as unknown as WebTorrentInstance
}
