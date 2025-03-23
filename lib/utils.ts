import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number, decimals = 2) {
  if (!bytes) return '0 B'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

/**
 * Checks if the current browser fully supports the Web Crypto API
 * Verifies both basic crypto and subtle crypto support
 */
export function hasWebCryptoSupport(): boolean {
  // Skip check on server
  if (typeof window === 'undefined') return false
  
  try {
    const crypto = window.crypto || (window as any).msCrypto;
    
    // Check for basic crypto support
    if (!crypto) return false;

    // Check for getRandomValues support
    if (typeof crypto.getRandomValues !== 'function') return false;

    // Check for subtle crypto support (including prefixed versions)
    const subtle = crypto.subtle || (crypto as any).webkitSubtle || (window as any).crypto.webkitSubtle;
    if (!subtle) return false;

    // Check for specific required methods
    const requiredMethods = [
      'digest',
      'importKey',
      'sign',
      'verify'
    ];

    return requiredMethods.every(method => typeof subtle[method] === 'function');
  } catch (err) {
    console.error('Error checking for Web Crypto support:', err)
    return false
  }
}

/**
 * Polyfill for browsers without full Web Crypto API support
 * This is used as a fallback for basic crypto operations
 */
export function getPolyfillCrypto() {
  // Use native crypto if available
  if (hasWebCryptoSupport()) {
    return window.crypto;
  }

  // Basic polyfill for getRandomValues
  const polyfilledCrypto = {
    getRandomValues: function(buffer: Uint8Array): Uint8Array {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
      }
      return buffer;
    },
    // Minimal subtle crypto polyfill
    subtle: {
      digest: async (algorithm: string, data: ArrayBuffer) => {
        throw new Error('Subtle crypto not supported in this browser');
      }
    }
  };

  return polyfilledCrypto;
}

// Export polyfilled crypto for use in other modules
export const crypto = typeof window !== 'undefined' ? (window.crypto || getPolyfillCrypto()) : null;

/**
 * Creates a simple hash that can be used as a fallback when the Web Crypto API
 * is not available. Not cryptographically secure but works for basic use cases.
 * @param data String to hash
 * @returns A simple hash string
 */
export function createSimpleHash(data: string): string {
  let hash = 0;
  
  if (data.length === 0) return hash.toString(16);
  
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Create a hex string and ensure it's positive
  const hexHash = Math.abs(hash).toString(16).padStart(8, '0');
  
  // Add some uniqueness using timestamp
  const timestamp = Date.now().toString(16);
  
  return `${hexHash}-${timestamp}`;
}

/**
 * Creates a pseudo-random identifier that can be used when crypto.getRandomValues
 * is not available.
 * @param length Length of the random ID to generate
 * @returns A random-like string
 */
export function createPseudoRandomId(length: number = 40): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  // Add timestamp to make it more unique
  const timestamp = Date.now().toString(36);
  result += timestamp;
  
  // Fill the rest with pseudo-random chars
  const remainingLength = length - timestamp.length;
  for (let i = 0; i < remainingLength; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars.charAt(randomIndex);
  }
  
  return result;
}
