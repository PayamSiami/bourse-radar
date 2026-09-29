import type { FastifyInstance } from "fastify";
import { registerStocksRoutes } from "#routes/stocks";
import { registerRankingsRoutes } from "#routes/rankings";
import { registerSuggestionsRoutes } from "#routes/suggestions";
import { registerHealthRoute } from "#routes/health";
import { registerSalesTrendsRoutes } from "#routes/sales-trends";
import { registerIngestRoutes } from "#routes/registerIngestRoutes";
import { registerSectorAssetsRoutes } from "#routes/sector-assets";
import { registerSectorsRoutes } from "#routes/sectors";
import { registerPriceHistoryRoutes } from "#routes/price-history";
import { registerQuarterlyRoutes } from "#routes/quarterly";
import { registerEarningsRoutes } from "#routes/earnings";
import { registerMcapRoutes } from "#routes/mcap-series";

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
    await registerSalesTrendsRoutes(server, "/api/sales-trends");
    console.log("  ✓ Sales trends routes registered");
  } catch (e) {
    console.error("  ✗ Sales trends routes failed:", e);
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

  try {
    await registerSectorAssetsRoutes(server, "/api/sectors");
    console.log("  ✓ Sector assets routes registered");
  } catch (e) {
    console.error("  ✗ Sector assets routes failed:", e);
  }

  // inside registerRoutes():
  try {
    await registerSectorsRoutes(server, "/api/sectors");
    console.log("  ✓ Sectors routes registered");
  } catch (e) {
    console.error("  ✗ Sectors routes failed:", e);
  }

  try {
    await registerPriceHistoryRoutes(server, "/api/prices");
    console.log("  ✓ Price history routes registered");
  } catch (e) {
    console.error("  ✗ Price history routes failed:", e);
  }

  try {
    await registerMcapRoutes(server, "/api/mcap-series");
    console.log("  ✓ Market-cap series routes registered");
  } catch (e) {
    console.error("  ✗ Market-cap routes failed:", e);
  }

  // inside registerRoutes():
  try {
    await registerQuarterlyRoutes(server, "/api/quarterly");
    console.log("  ✓ Quarterly routes registered");
  } catch (e) {
    console.error("  ✗ Quarterly routes failed:", e);
  }

  // inside registerRoutes():
  try {
    await registerEarningsRoutes(server, "/api/earnings");
    console.log("  ✓ Earnings routes registered");
  } catch (e) {
    console.error("  ✗ Earnings routes failed:", e);
  }

  server.get("/", async () => ({
    name: "Bourse Radar API",
    version: "0.1.0",
    status: "ok",
  }));

  console.log("✓ Routes registered");
}
