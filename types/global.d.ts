import WebTorrent from 'webtorrent';

declare global {
  interface Window {
    webTorrentClient?: WebTorrent.Instance;
  }
}

// This export is needed to make this a module
export {};

declare module 'webtorrent' {
  // Use the declaration we created in webtorrent.d.ts
}

declare module 'ws' {
  // Use the declaration we created in ws.d.ts
}

declare module 'express' {
  // Use the declaration we created in express.d.ts
} 