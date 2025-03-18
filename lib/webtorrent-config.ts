"use client"

// High-performance WebRTC configuration
const WEBRTC_CONFIG: RTCConfiguration = typeof window === 'undefined' ? {} as RTCConfiguration : {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { 
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10
}

// Production-grade WebSocket trackers
export const TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.novage.com.ua'
]

export const TORRENT_CONFIG = typeof window === 'undefined' ? {} : {
  tracker: {
    rtcConfig: WEBRTC_CONFIG,
    announce: TRACKERS,
    getAnnounceOpts: () => ({
      numwant: 50,
      uploaded: 0,
      downloaded: 0,
      left: 0,
      websocket: true
    })
  },
  // Disable DHT since it's not fully supported in the browser
  dht: false,
  webSeeds: false,
  private: false,
  port: 0,
  destroyStoreOnDestroy: true
}

export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 // 2GB limit 