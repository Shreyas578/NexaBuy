import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazon.com' },
      { protocol: 'https', hostname: '**.media-amazon.com' },
      { protocol: 'https', hostname: '**.bestbuy.com' },
      { protocol: 'https', hostname: '**.walmart.com' },
      { protocol: 'https', hostname: '**.target.com' },
      { protocol: 'https', hostname: '**' }, // broad fallback for scraped images
    ],
  },
  // Allow large API responses (scraper can return big HTML)
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },
};

export default nextConfig;
