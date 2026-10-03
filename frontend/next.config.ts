import type { NextConfig } from "next";

const isDocker = process.env.DOCKER_BUILD === "1";
const nextConfig: NextConfig = {
  output: isDocker ? "standalone" : undefined,
  // Point Next's traces to the right root when building inside /app
  ...(isDocker ? { outputFileTracingRoot: "/app" } : {}),
};

export default nextConfig;
