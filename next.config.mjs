/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@google/genai', '@fal-ai/client'],
  turbopack: {
    ignoreIssue: [
      {
        path: '**/next.config.mjs',
        title: 'Encountered unexpected file in NFT list'
      }
    ]
  },
  experimental: {
    proxyClientMaxBodySize: '320mb' // videos cortos del autor (estudio local)
  }
};

export default nextConfig;
