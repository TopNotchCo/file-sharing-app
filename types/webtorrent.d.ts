declare module 'webtorrent' {
  interface Wire {
    peerId: Buffer
    type: string
  }

  interface TorrentOptions {
    announce?: string[]
    getAnnounceOpts?: () => Record<string, unknown>
    path?: string
    store?: unknown
  }

  interface TrackerConfig {
    rtcConfig?: RTCConfiguration
    announce?: string[]
    getAnnounceOpts?: () => Record<string, unknown>
  }

  interface WebTorrentOptions {
    tracker?: {
      rtcConfig?: RTCConfiguration
      announce?: string[]
      getAnnounceOpts?: () => Record<string, unknown>
    }
    maxConns?: number
    nodeId?: string | Buffer
    peerId?: string | Buffer
    tracker?: boolean | TrackerConfig
    dht?: boolean
    webSeeds?: boolean
  }

  interface Instance {
    ready: boolean
    on(event: 'error', callback: (err: Error | string) => void): void
    on(event: 'torrent', callback: (torrent: Torrent) => void): void
    once(event: 'ready', callback: () => void): void
    destroy(callback?: () => void): void
    seed(
      input: File | File[],
      opts: TorrentOptions,
      callback: (torrent: Torrent) => void
    ): void
    add(
      torrentId: string,
      opts: TorrentOptions,
      callback: (torrent: Torrent) => void
    ): void
  }

  interface Torrent {
    infoHash: string
    magnetURI: string
    files: TorrentFile[]
    on(event: 'done', callback: () => void): void
    on(event: 'error', callback: (err: Error) => void): void
    on(event: 'wire', callback: (wire: Wire) => void): void
  }

  interface TorrentFile {
    name: string
    path: string
    length: number
    getBuffer(callback: (err: Error | null, buffer?: Buffer) => void): void
  }

  class WebTorrent implements Instance {
    constructor(opts?: WebTorrentOptions)
    static WEBRTC_SUPPORT: boolean
    ready: boolean
    on(event: 'error', callback: (err: Error | string) => void): void
    on(event: 'torrent', callback: (torrent: Torrent) => void): void
    once(event: 'ready', callback: () => void): void
    destroy(callback?: () => void): void
    seed(
      input: File | File[],
      opts: TorrentOptions,
      callback: (torrent: Torrent) => void
    ): void
    add(
      torrentId: string,
      opts: TorrentOptions,
      callback: (torrent: Torrent) => void
    ): void
  }

  export = WebTorrent
} 