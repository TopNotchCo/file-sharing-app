/**
 * This handler upgrades the HTTP connection to a WebSocket connection
 * For WebSocket support, we need to use a custom server setup 
 */
export function GET() {
  return new Response('WebSocket endpoint', {
    status: 426, // Upgrade Required
    headers: {
      'Upgrade': 'websocket',
    },
  })
}

/**
 * This is a workaround to handle WebSockets in Next.js App Router
 * Since App Router doesn't have native WebSocket support yet
 */
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store' 