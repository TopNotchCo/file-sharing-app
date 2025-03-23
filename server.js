#!/usr/bin/env node

/**
 * Custom server that integrates Next.js with WebSocket support
 * This is needed for our peer-to-peer WebRTC signaling
 * 
 * This file uses CommonJS module system since it's a direct Node.js script
 * ESLint can be disabled for this specific file
 */

/* eslint-disable */
// Register TypeScript compiler
require('ts-node').register({
  compilerOptions: {
    module: 'commonjs',
    target: 'es2017',
  },
})

// Load and run our custom server implementation
require('./lib/custom-server') 