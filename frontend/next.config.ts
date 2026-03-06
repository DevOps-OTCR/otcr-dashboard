import type { NextConfig } from "next";

const isGitHubPagesBuild = process.env.GITHUB_PAGES === 'true';
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  basePath: isGitHubPagesBuild ? basePath : undefined,
  assetPrefix: isGitHubPagesBuild && basePath ? `${basePath}/` : undefined,
  trailingSlash: isGitHubPagesBuild,
  images: {
    unoptimized: isGitHubPagesBuild,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
      },
    ],
  },
  // Production optimizations
  compress: true,
  poweredByHeader: false,

  // Standalone output for Docker
  output: isGitHubPagesBuild
    ? 'export'
    : process.env.DOCKER_BUILD
      ? 'standalone'
      : undefined,

  // Performance optimizations
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion'],
  },

  // Security headers
  async headers() {
    if (isGitHubPagesBuild) {
      return [];
    }

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
        ],
      },
    ]
  },
};

export default nextConfig;
