import WebTorrent from 'webtorrent';

declare global {
  interface Window {
    webTorrentClient?: WebTorrent.Instance;
  }
}

// This export is needed to make this a module
export {}; 