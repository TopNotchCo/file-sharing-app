import { IncomingMessage } from 'http';
import { Request } from 'express';
import { networkInterfaces } from 'os';

const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

/**
 * Gets the IP address from request object
 * @param {IncomingMessage | Request} request - HTTP request object
 * @returns {string | undefined} IP address
 */
export function getIp(request: IncomingMessage | Request): string | undefined {
  let forwarded = request.headers['x-forwarded-for'] || '';
  if (Array.isArray(forwarded)) {
    forwarded = forwarded.join(',');
  }

  // For Express Request objects
  let ip = (request as Request).ip;
  
  // If not available or using standard http IncomingMessage
  if (!ip) {
    ip = TRUST_PROXY
      ? (forwarded as string).split(',').shift()
      : undefined;
    
    // Fall back to socket remote address
    ip = ip || request.socket.remoteAddress;
  }

  // Convert localhost IPv6 notation to IPv4
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '127.0.0.1';
  }

  return ip;
}

/**
 * Gets the local IP address of the machine
 * @returns {string} The first non-internal IPv4 address or fallback
 */
export function getLocalIpAddress(): string {
  const interfaces = networkInterfaces();
  
  // Try to find a non-internal IPv4 address
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  
  // If no non-internal IPv4 address is found, use 0.0.0.0
  console.warn('No non-internal IPv4 address found, using 0.0.0.0 (all interfaces)');
  return '0.0.0.0';
}

/**
 * Gets WebSocket URL for LAN server based on environment variables or current host
 * @returns {string} WebSocket URL for LAN server
 */
export function getWebSocketUrl(): string {
  // Use environment variables if available
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL;
  
  // If deployed server URL is provided, use that
  if (serverUrl) {
    // Determine protocol (wss for https, ws for http)
    const protocol = serverUrl.startsWith('https://') ? 'wss://' : 'ws://';
    const domain = serverUrl.replace(/^https?:\/\//, '');
    
    // Don't append port if it's a secure production environment
    if (protocol === 'wss://') {
      return `${protocol}${domain}`;
    }
    
    // For local non-secure environment, include the port
    const port = process.env.NEXT_PUBLIC_LAN_SERVER_PORT || '3005';
    return `${protocol}${domain}:${port}`;
  }
  
  // For local development
  const hostIp = process.env.NEXT_PUBLIC_HOST_IP;
  const port = process.env.NEXT_PUBLIC_LAN_SERVER_PORT || '3005';
  
  // Check if we're in browser context and if the page is secure
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const protocol = isSecure ? 'wss://' : 'ws://';
  
  let baseUrl = '';
  
  if (hostIp) {
    baseUrl = `${protocol}${hostIp}:${port}`;
  } else if (typeof window !== 'undefined') {
    // Fallback to using the current hostname from window.location
    const hostname = window.location.hostname;
    baseUrl = `${protocol}${hostname}:${port}`;
  } else {
    // Last resort fallback
    baseUrl = 'ws://localhost:3005';
  }
  
  return baseUrl;
} 