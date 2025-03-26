// Express module declaration
declare module 'express' {
  import * as http from 'http';
  
  interface Request extends http.IncomingMessage {
    ip: string;
  }
  
  interface Response extends http.ServerResponse {
    header(name: string, value: string): Response;
    json(body: unknown): Response;
    send(body: unknown): Response;
  }
  
  interface NextFunction {
    (err?: unknown): void;
  }
  
  interface Express {
    (): unknown;
    use: unknown;
    get: unknown;
  }
  
  const express: Express;
  export = express;
  export { Request, Response, NextFunction };
}

// WebSocket module declaration
declare module 'ws' {
  import * as http from 'http';
  
  export class WebSocket {
    static OPEN: number;
    readyState: number;
    send(data: string | ArrayBuffer | Buffer): void;
    close(): void;
    on(event: string, listener: (...args: unknown[]) => void): this;
    removeListener(event: string, listener: (...args: unknown[]) => void): this;
  }
  
  export class WebSocketServer {
    constructor(options: { server: http.Server; perMessageDeflate?: unknown });
    on(event: string, listener: (...args: unknown[]) => void): this;
  }
}

// WebTorrent module declaration
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

// Window extensions
interface Window {
  webTorrentClient?: unknown;
} 