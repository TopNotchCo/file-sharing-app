"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "./use-toast";
import { nanoid } from "nanoid";
import { getWebSocketUrl } from "../lib/network-utils";

// Local network user interface
export interface LANUser {
  id: string;
  name: string;
  peerId: string;
  lastSeen: number;
  isOnline: boolean;
  isYou: boolean;
  avatar?: string;
}

// Raw peer data from server
interface RawPeerData {
  id: string;
  name: string;
  peerId: string;
  lastSeen: number;
  avatar?: string;
}

// Message interface
export interface LANMessage {
  type: string;
  data: Record<string, unknown>;
  recipient?: string;
}

// Hook return type
export interface LANDiscoveryReturn {
  localUsers: LANUser[];
  currentUser: LANUser;
  updateUserName: (name: string) => void;
  isDiscoveryActive: boolean;
  serverAddress: string | null;
  sendMessage: (message: LANMessage) => void;
}

// Helper to safely access localStorage
const getFromStorage = (key: string, defaultValue: string): string => {
  if (typeof window === 'undefined') {
    return defaultValue;
  }
  return localStorage.getItem(key) || defaultValue;
};

// Helper to safely set localStorage
const setToStorage = (key: string, value: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, value);
  }
};

export function useLANDiscovery(): LANDiscoveryReturn {
  const [localUsers, setLocalUsers] = useState<LANUser[]>([]);
  const [serverAddress, setServerAddress] = useState<string | null>(null);
  const [currentUser] = useState<LANUser>(() => {
    // Generate a random avatar color
    const colors = ["#9D4EDD", "#7B2CBF", "#5A189A", "#3C096C", "#FF5E78", "#FF9E7A", "#38B6FF", "#5CE1E6"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const randomId = nanoid();
    
    return {
      id: getFromStorage("lan-user-id", randomId),
      name: getFromStorage("lan-user-name", `You`),
      peerId: nanoid(),
      lastSeen: Date.now(),
      isOnline: true,
      isYou: true,
      avatar: getFromStorage("lan-user-avatar", randomColor)
    };
  });
  
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to send a message to a specific peer or broadcast to all peers
  const sendMessage = useCallback((message: LANMessage) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error("[LANDiscovery] WebSocket connection not open, cannot send message");
      return;
    }

    try {
      console.log("[LANDiscovery] Sending message:", message);
      
      wsRef.current.send(JSON.stringify({
        type: 'MESSAGE',
        userId: currentUser.id,
        peerId: currentUser.peerId,
        message: message
      }));
    } catch (error) {
      console.error("[LANDiscovery] Error sending message:", error);
    }
  }, [currentUser]);

  // Connect to the WebSocket server only in the browser
  useEffect(() => {
    // TESTING ONLY: Don't connect in production because we're using a local server
    if (typeof window === 'undefined' || process.env.NODE_ENV === 'production') return;
    
    // Get the correct WebSocket URL
    const wsUrl = getWebSocketUrl();
    setServerAddress(wsUrl);
    
    console.log(`Connecting to LAN server at ${wsUrl}`);
    wsRef.current = new WebSocket(wsUrl);
    
    // Show toast if connection fails
    const connectionTimeout = setTimeout(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        toast({
          title: "Connection Failed",
          description: `Could not connect to LAN server at ${wsUrl}. Check if server is running.`,
          variant: "destructive",
        });
      }
    }, 5000);
    
    const heartbeat = () => {
      wsRef.current?.send(JSON.stringify({
        type: 'HEARTBEAT',
        userId: currentUser.id,
        peerId: currentUser.peerId
      }));
    };

    wsRef.current.onopen = () => {
      clearTimeout(connectionTimeout);
      toast({
        title: "Connected to LAN",
        description: `Successfully connected to ${wsUrl}`,
      });
      
      wsRef.current?.send(JSON.stringify({
        type: 'JOIN',
        userId: currentUser.id,
        userName: currentUser.name,
        peerId: currentUser.peerId,
        avatar: currentUser.avatar
      }));
      heartbeatIntervalRef.current = setInterval(heartbeat, 10000);
    };

    wsRef.current.onmessage = (e) => {
      const message = JSON.parse(e.data);
      console.log(`[WebSocket] Received message: ${message.type}`, message);
      
      if (message.type === 'PEERS') {
        // Transform the peers to match our LANUser interface
        const transformedPeers = message.peers
          .filter((p: RawPeerData) => p.id !== currentUser.id)
          .map((p: RawPeerData) => ({
            ...p,
            // Make sure the name is always their ID for clarity
            name: `User ${p.id.substring(0, 4)}`,
            isOnline: (Date.now() - p.lastSeen) < 30000, // Consider online if seen in the last 30 seconds
            isYou: false,
            avatar: p.avatar || "#9D4EDD" // Default color if none provided
          }));
        
        setLocalUsers(transformedPeers);
      }
      else if (message.type === 'MESSAGE' && message.message) {
        console.log('[WebSocket] Received MESSAGE type with data:', message.message);
        
        // If the message has a recipient, only process if we're the recipient
        if (message.message.recipient && message.message.recipient !== currentUser.peerId) {
          console.log(`[WebSocket] Message has recipient ${message.message.recipient} but our peerId is ${currentUser.peerId}, ignoring`);
          return;
        }
        
        // Dispatch a custom event with the message data
        if (typeof window !== 'undefined') {
          console.log('[WebSocket] Dispatching lan-message event with data:', message.message);
          const event = new CustomEvent('lan-message', { 
            detail: message.message 
          });
          window.dispatchEvent(event);
        }
      }
    };
    
    wsRef.current.onerror = () => {
      toast({
        title: "Connection Error",
        description: `Error connecting to LAN server at ${wsUrl}`,
        variant: "destructive",
      });
    };

    return () => {
      clearTimeout(connectionTimeout);
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      wsRef.current?.close();
    };
  }, [currentUser, toast]);

  const updateUserName = useCallback((name: string) => {
    setToStorage("lan-user-name", name);
    // No need to broadcast - will update on next connection
  }, []);

  return {
    localUsers,
    currentUser,
    updateUserName,
    isDiscoveryActive: !!wsRef.current && wsRef.current.readyState === WebSocket.OPEN,
    serverAddress,
    sendMessage
  };
} 