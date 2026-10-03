import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * NOTE (sandbox): `next dev` and `next build` can't run to completion here:
   *  - `next dev` forks its HMR worker  -> fork() blocked (EPERM)
   *  - `next build` compiles fine, then "Collecting page data using N workers"
   *    forks jest-workers            -> fork() blocked (EPERM)
   *  - `next build` also shells out to `tsc` -> spawn(pipe) blocked (EPERM)
   * All three are Next's own child_process usage; types are verified separately
   * via `tsc --noEmit` (clean). On a real host (Docker Desktop running), `npm run dev`
   * serves the frontend against the Fastify backend on :8000.
   */
};

export default nextConfig;
