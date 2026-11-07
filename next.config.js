/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false, // 🆕 Ignora o 'fs' no navegador
        path: false, // 🆕 Ignora o 'path' no navegador também
      };
    }
    return config;
  },
}

module.exports = nextConfig