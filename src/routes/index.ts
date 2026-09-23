import type { FastifyInstance } from "fastify";
import { registerStocksRoutes } from "#routes/stocks";
import { registerRankingsRoutes } from "#routes/rankings";
import { registerSuggestionsRoutes } from "#routes/suggestions";
import { registerHealthRoute } from "#routes/health";
import { registerIngestRoutes } from "#services/ingest";

export async function registerRoutes(server: FastifyInstance) {
  console.log("→ Registering routes");

  await registerHealthRoute(server);
  console.log("  ✓ Health route registered");

  await registerStocksRoutes(server, "/api/stocks");
  console.log("  ✓ Stocks routes registered");

  try {
    await registerRankingsRoutes(server, { prefix: "/api/rankings" });
    console.log("  ✓ Rankings routes registered");
  } catch (e) {
    console.error("  ✗ Rankings routes failed:", e);
  }

  try {
    await registerSuggestionsRoutes(server, "/api/suggestions");
    console.log("  ✓ Suggestions routes registered");
  } catch (e) {
    console.error("  ✗ Suggestions routes failed:", e);
  }

  try {
    registerIngestRoutes(server);
    console.log("  ✓ Admin ingest route registered (localhost only)");
  } catch (e) {
    console.error("  ✗ Admin ingest route failed:", e);
  }

  server.get("/", async () => ({
    name: "Bourse Radar API",
    version: "0.1.0",
    status: "ok",
  }));

  console.log("✓ Routes registered");
}
