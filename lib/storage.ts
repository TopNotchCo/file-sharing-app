"use client"

// Simple wrapper for localStorage with type safety and error handling
export const storage = {
  get: (key: string, defaultValue?: string): string | undefined => {
    if (typeof window === 'undefined') return defaultValue
    
    try {
      const item = window.localStorage.getItem(key)
      return item !== null ? item : defaultValue
    } catch (error) {
      console.warn(`Error reading ${key} from localStorage:`, error)
      return defaultValue
    }
  },
  
  set: (key: string, value: string): boolean => {
    if (typeof window === 'undefined') return false
    
    try {
      window.localStorage.setItem(key, value)
      return true
    } catch (error) {
      console.warn(`Error saving ${key} to localStorage:`, error)
      return false
    }
  },
  
  remove: (key: string): boolean => {
    if (typeof window === 'undefined') return false
    
    try {
      window.localStorage.removeItem(key)
      return true
    } catch (error) {
      console.warn(`Error removing ${key} from localStorage:`, error)
      return false
    }
  }
}

// Keys used in the application
export const STORAGE_KEYS = {
  USER_NAME: 'airshare-username'
} 