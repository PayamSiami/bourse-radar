#!/usr/bin/env node
/**
 * Bourse Radar API — Fastify server bootstrap
 * Tehran Stock Exchange quantitative ranking engine
 *
 * Entry point: `npm run dev` (tsx watch) or `npm start` (compiled JS)
 */

// Load .env FIRST — config Zod schema validates these at import time
import "dotenv/config";

import Fastify from "fastify";
import { config } from "#config";
import { registerPlugins } from "#plugins/index";
import { registerRoutes } from "#routes/index";

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});

async function buildServer() {
  const server = Fastify({
    logger: {
      level: config.app.logLevel,
    },
    ignoreTrailingSlash: true,   // /api/stocks == /api/stocks/
  });

  await registerPlugins(server);
  console.log("Plugins done, registering routes…");
  await registerRoutes(server);
  console.log("Routes done, starting server…");

  return server;
}

async function main() {
  const server = await buildServer();

  try {
    await server.listen({ port: config.app.port, host: "0.0.0.0" });
    console.log(`Bourse Radar API listening on http://0.0.0.0:${config.app.port}`);
  } catch (err) {
    console.error("Fatal startup error:", err);
    process.exit(1);
  }

  // Graceful shutdown
  process.on("SIGTERM", () => server.close(() => process.exit(0)));
  process.on("SIGINT", () => server.close(() => process.exit(0)));
}

void main();
