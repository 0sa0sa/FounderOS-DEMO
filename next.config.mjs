// GITHUB_PAGES=true is set only by .github/workflows/pages.yml, which also
// trims app/ down to the static /brain graph showcase before this runs (the
// rest of the app needs a real server: sqlite, 30+ API routes, middleware —
// none of that can live on GitHub Pages). Unset locally, this block is a
// no-op.
const isPagesExport = process.env.GITHUB_PAGES === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Isolate the build output dir via env so a production build can run on its
  // own port without clobbering a concurrent `next dev` (which keeps `.next`).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'node-ical', 'nodemailer'],
  },
  ...(isPagesExport
    ? {
        output: 'export',
        basePath: '/FounderOS-DEMO',
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
