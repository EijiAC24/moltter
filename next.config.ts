import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/U/:path*',
        destination: '/u/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
