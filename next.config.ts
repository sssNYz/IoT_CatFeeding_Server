import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Type checking runs with `npm run typecheck` (TypeScript 7 has no JS API for Next to call).
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
