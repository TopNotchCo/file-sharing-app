/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable server-side functionality since we're hosting the frontend only
  output: 'export',
  
  // Enable image optimization 
  images: {
    unoptimized: true,
  },
  
  // Support trailing slashes for better compatibility
  trailingSlash: true,
  
  // Environment variables for the frontend
  env: {
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL || 'https://file-sharing-app-23eq.onrender.com',
  },
  
  // Transpile specific modules (add any that need it here)
  transpilePackages: ['webtorrent'],
};

export default nextConfig; 