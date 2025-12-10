/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/notiflow',
  assetPrefix: '/notiflow/',
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  swcMinify: true,
};

module.exports = nextConfig;
