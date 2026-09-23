/**
 * Bourse Radar — Background Job Scheduler
 * Tehran Stock Exchange data ingestion via node-cron
 *
 * Schedules:
 *   - Daily symbol + sector refresh (before market open)
 *   - Price scraping every 5 min (during market hours)
 *   - Monthly sales + quarterly financials (daily after market close)
 *   - Forward P/E recalculation (daily + every 4 hours)
 *   - Ranking refresh (daily + every 4 hours)
 *   - LLM narrative generation (daily for top-20 stocks)
 */

import cron from "node-cron";
import type { FastifyInstance } from "fastify";
import { logger } from "#utils/logger";
import {
  scrapeAllSymbols,
  upsertStocks,
  insertPrices,
  syncMonthlySales,
  recomputeForwardPe,
  refreshRankings,
  WATCHLIST,
} from "#services/ingest";

// Iranian TSE market hours: Sunday 9:00 AM – Thursday 12:30 PM (IRST)
// Cron uses local time (Asia/Tehran) — server must be TZ=Asia/Tehran

interface JobConfig {
  name: string;
  schedule: string;  // cron expression
  task: () => Promise<void>;
}

export async function initializeJobs(server: FastifyInstance): Promise<void> {
  const jobs: JobConfig[] = [
    // ── Market data ingestion ──
    {
      name: "ingest-symbols",
      schedule: "0 6 * * 0",  // Daily at 6:00 AM (before market open)
      task: async () => {
        logger.info("[job] ingesting symbol list from TSETMC");
        const symbols = await scrapeAllSymbols();
        const n = await upsertStocks(server.db, symbols);
        logger.info(`[job] upserted ${n} stocks`);
      },
    },
    {
      name: "ingest-prices",
      schedule: "*/5 9-12 * * 0-4",  // Every 5 min, Sun-Thu, 9:00-12:30 IRST
      task: async () => {
        logger.info("[job] ingesting real-time prices from TSETMC");
        const symbols = await scrapeAllSymbols();
        const n = await insertPrices(server.db, symbols);
        logger.info(`[job] inserted ${n} price ticks`);
      },
    },
    {
      name: "ingest-monthly-sales",
      schedule: "0 14 * * 0-4",  // Daily at 2:00 PM (after Codal publications)
      task: async () => {
        logger.info("[job] ingesting monthly sales from Codal.ir");
        const n = await syncMonthlySales(server.db, WATCHLIST.map((w) => w.sym));
        logger.info(`[job] synced ${n} monthly sales records`);
      },
    },
    {
      name: "ingest-quarterly-financials",
      schedule: "0 15 * * 0-4",  // Daily at 3:00 PM
      task: async () => {
        logger.info("[job] ingesting quarterly financials from Codal.ir");
        // Quarterly financials come from the same decision.aspx reports;
        // a dedicated parser for quarterly letters can be added later.
        logger.info("[job] quarterly financials: no dedicated source yet — skipped");
      },
    },

    // ── Processing ──
    {
      name: "compute-forward-pe",
      schedule: "0 20 * * *",  // Daily at 8:00 PM (after market close)
      task: async () => {
        logger.info("[job] computing Forward P/E for all stocks");
        const n = await recomputeForwardPe(server.db);
        logger.info(`[job] computed Forward P/E for ${n} stocks`);
      },
    },
    {
      name: "compute-forward-pe-intraday",
      schedule: "0 11,15 * * 0-4",  // Every 4 hours during market
      task: async () => {
        logger.info("[job] re-computing Forward P/E (intraday)");
        const n = await recomputeForwardPe(server.db);
        logger.info(`[job] recomputed ${n} stocks`);
      },
    },
    {
      name: "compute-rankings",
      schedule: "0 21 * * *",  // Daily at 9:00 PM
      task: async () => {
        logger.info("[job] refreshing rankings materialized view");
        await refreshRankings(server.db);
      },
    },
    {
      name: "generate-narratives",
      schedule: "0 22 * * *",  // Daily at 10:00 PM
      task: async () => {
        logger.info("[job] generating LLM narratives for top-20 stocks");
        // TODO: call LlmNarrator for top-20 ranked stocks
      },
    },
  ];

  for (const job of jobs) {
    cron.schedule(job.schedule, async () => {
      try {
        await job.task();
        logger.info(`[job] ${job.name} completed successfully`);
      } catch (err) {
        logger.error(err, `[job] ${job.name} failed`);
      }
    });
    logger.info(`[job] ${job.name} scheduled: ${job.schedule}`);
  }

  // Graceful shutdown: stop all cron jobs
  server.addHook("onClose", () => {
    cron.getTasks().forEach((t) => t.stop());
    logger.info("All cron jobs stopped");
  });
}
