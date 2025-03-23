/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Completely disable source maps in production
  productionBrowserSourceMaps: false,
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // Client-side polyfills
      config.resolve.fallback = {
        ...config.resolve.fallback,
        dgram: false,
        dns: false,
        fs: false,
        net: false,
        tls: false,
        'buffer': false,
        'process': false,
      }
      
      // Add global polyfill for WebTorrent
      config.plugins.push(
        new webpack.ProvidePlugin({
          global: ['globalThis'],
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser',
        })
      )
    } else {
      // For server-side rendering, we need to handle browser-only modules
      config.resolve.alias = {
        ...config.resolve.alias,
        'webtorrent': false,
        'webtorrent/dist/webtorrent.min.js': false
      }
    }
    
    // Disable source maps for WebTorrent to prevent server-side errors
    if (config.module && config.module.rules) {
      const jsRule = config.module.rules.find(
        rule => rule.test && rule.test.toString().includes('js')
      );
      
      if (jsRule && jsRule.use && jsRule.use.options) {
        const originalSourceMaps = jsRule.use.options.sourceMap;
        jsRule.use.options.sourceMap = function(filename) {
          if (filename.includes('webtorrent')) {
            return false;
          }
          return typeof originalSourceMaps === 'function' 
            ? originalSourceMaps(filename) 
            : originalSourceMaps;
        };
      }
    }
    
    // Disable source maps generation for WebTorrent
    if (config.optimization && config.optimization.minimizer) {
      config.optimization.minimizer.forEach(minimizer => {
        if (minimizer.constructor.name === 'TerserPlugin') {
          minimizer.options.sourceMap = false;
        }
      });
    }
    
    return config
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    }
  },
  serverExternalPackages: ['ws']
}

export default nextConfig
