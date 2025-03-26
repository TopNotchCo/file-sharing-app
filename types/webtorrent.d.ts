declare module 'webtorrent' {
  interface TorrentFile {
    name: string;
    length: number;
    createReadStream(opts?: { start?: number; end?: number }): NodeJS.ReadableStream;
  }

  interface Torrent {
    files: TorrentFile[];
    downloaded: number;
    on(event: string, callback: (...args: unknown[]) => void): this;
    once(event: string, callback: (...args: unknown[]) => void): this;
    removeListener(event: string, callback: (...args: unknown[]) => void): this;
    destroy(): void;
  }

  interface WebTorrentInstance {
    add(torrentId: string, opts?: unknown): Promise<Torrent>;
  }

  export default function WebTorrent(opts?: unknown): WebTorrentInstance;
} 