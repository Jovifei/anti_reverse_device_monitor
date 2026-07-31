/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  // Allows acceptance builds to avoid a concurrently running local dev server.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  typescript: {
    // Capture runs use an isolated config so Next.js cannot rewrite the shared one.
    tsconfigPath: process.env.NEXT_TSCONFIG_PATH || 'tsconfig.json'
  }
}

export default nextConfig
