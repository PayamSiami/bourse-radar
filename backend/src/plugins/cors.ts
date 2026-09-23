import type { FastifyInstance } from "fastify";
import fastifyCors from "@fastify/cors";
import { logger } from "#utils/logger";

export async function registerCors(server: FastifyInstance) {
  await server.register(fastifyCors, {
    origin: process.env.NODE_ENV === "production"
      ? ["https://bourse-radar.ir", "https://www.bourse-radar.ir"]
      : true,  // Allow all in development
    credentials: true,
    methods: ["GET", "POST"],
  });
  logger.info("✓ CORS registered");
}
