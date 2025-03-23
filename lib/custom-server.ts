import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import SignalingServer from './server'

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)

// Initialize Next.js
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  // Create HTTP server
  const server = createServer(async (req, res) => {
    try {
      // Parse URL
      const parsedUrl = parse(req.url || '/', true)
      
      // Let Next.js handle the request
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling request:', err)
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  })

  // Initialize the WebSocket signaling server with our HTTP server
  const signalingServer = SignalingServer.getInstance()
  signalingServer.initialize(server)

  server.once('error', (err) => {
    console.error('Server error:', err)
    process.exit(1)
  })

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
  })
}) 