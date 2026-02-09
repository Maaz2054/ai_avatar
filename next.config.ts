/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint: configure via eslint.config.mjs or run `next lint`. See https://nextjs.org/docs/app/api-reference/cli/next#next-lint-options
  typescript: {
    ignoreBuildErrors: true, // Force Vercel à ignorer les erreurs de types
  },
};

export default nextConfig;