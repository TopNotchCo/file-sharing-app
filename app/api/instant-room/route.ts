import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'

/**
 * Generate a random room name
 * @returns Random room name
 */
function generateRoomName(): string {
  // Generate a short, URL-friendly random ID
  return nanoid(8)
}

/**
 * GET handler for instant room creation
 */
export async function GET() {
  const room = generateRoomName()
  
  return NextResponse.json({ 
    room,
    success: true 
  })
} 