"use client"

import { useState } from 'react'

/**
 * Hook to fetch instant room from the server
 * @param callback Callback function called with instant room name passed as parameter
 * @returns [fetchRoom, { loading, error }] - Function to fetch room and state
 */
export function useInstantRoom(
  callback: (room: string) => void
): [() => Promise<void>, { loading: boolean, error: string }] {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchRoom = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/instant-room')
      const { room } = await res.json()
      callback(room)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create instant room')
    } finally {
      setLoading(false)
    }
  }

  return [
    fetchRoom,
    { loading, error }
  ]
}

export default useInstantRoom 