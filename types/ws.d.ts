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