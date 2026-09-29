import { ingestArchiveForSymbol, ingestArchiveForSymbols, runFullIngest, WATCHLIST } from "#services/ingest";
import type { FastifyInstance } from "fastify";

/**
 * Merged ingest route. One endpoint, driven by query params:
 *
 *   GET /api/admin/ingest                        → full pipeline (fx → prices → quarterly → P/E)
 *   GET /api/admin/ingest?symbol=فسبزوار         → Codal archive for a single symbol
 *   GET /api/admin/ingest?symbols=all            → Codal archive for every symbol in the watchlist
 *   GET /api/admin/ingest?symbols=فولاد,فخوز    → Codal archive for selected symbols
 *
 * Optional &from=&to= Jalali bounds apply to the archive modes.
 *
 * Legacy GET /api/admin/archive/:symbol and /archive-all serve the same logic
 * in-place (with a Deprecation header) — no 3xx redirect needed.
 */
export function registerIngestRoutes(server: FastifyInstance): void {
  const isLocal = (ip: string) =>
    ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";

  const fullPipeline = async () => {
    const result = await runFullIngest(server.db);
    return { ok: true, ...result };
  };

  const archive = async (
    symbols: string[],
    from: string,
    to: string,
  ) => {
    if (symbols.length === 1) {
      const result = await ingestArchiveForSymbol(server.db, symbols[0]!, from, to);
      return { ok: true, symbol: symbols[0], ...result };
    }
    const results = await ingestArchiveForSymbols(server.db, symbols, from, to);
    const totals = results.reduce(
      (acc, r) => ({
        lettersFound: acc.lettersFound + r.lettersFound,
        reportsParsed: acc.reportsParsed + r.reportsParsed,
        rowsUpserted: acc.rowsUpserted + r.rowsUpserted,
        errors: acc.errors + r.errors.length,
      }),
      { lettersFound: 0, reportsParsed: 0, rowsUpserted: 0, errors: 0 },
    );
    return { ok: true, totals, symbols: results.length, results };
  };

  const parseArchiveTargets = (query: Record<string, unknown>): string[] | null => {
    // ?symbol=single  or  ?symbols=all  or  ?symbols=a,b,c
    const single = typeof query.symbol === "string" ? query.symbol.trim() : "";
    if (single) return [decodeURIComponent(single)];

    const raw = typeof query.symbols === "string" ? query.symbols.trim() : "";
    if (!raw) return null;
    if (raw.toLowerCase() === "all") return WATCHLIST.map((w) => w.sym);
    // Comma-separated list — decode each entry individually.
    const parts: string[] = [];
    for (const seg of raw.split(",")) {
      const t = seg.trim();
      if (!t) continue;
      try { parts.push(decodeURIComponent(t)); } catch { parts.push(t); }
    }
    return parts.length ? parts : null;
  };

  const deprecation = { Deprecation: "true", Sunset: "2026-12-31" } as const;

  // ── Primary (merged) route ────────────────────────────────────────
  server.get("/api/admin/ingest", async (req, reply) => {
    if (!isLocal(req.ip)) {
      return reply.code(403).send({ error: "Forbidden (localhost only)" });
    }

    try {
      const query = req.query as Record<string, unknown>;
      const targets = parseArchiveTargets(query);

      if (!targets) return reply.send(await fullPipeline());

      const from = typeof query.from === "string" ? query.from : "1402/01/01";
      const to = typeof query.to === "string" ? query.to : "1405/12/29";
      return reply.send(await archive(targets, from, to));
    } catch (e: unknown) {
      server.log.error(e);
      return reply.code(500).send({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  // ── Deprecated passthroughs — remove once frontend has migrated ───
  // Served in-place (no extra HTTP hop) so behaviour is identical and fetch
  // doesn't need to follow a redirect. Consumers migrate by pointing at /ingest.
  server.get("/api/admin/archive/:symbol", async (req, reply) => {
    if (!isLocal(req.ip)) {
      return reply.code(403).send({ error: "Forbidden (localhost only)" });
    }

    const { symbol } = req.params as { symbol: string };
    const { from, to } = req.query as { from?: string; to?: string };

    for (const [k, v] of Object.entries(deprecation)) reply.header(k, v);

    try {
      const result = await ingestArchiveForSymbol(
        server.db,
        decodeURIComponent(symbol),
        from ?? "1402/01/01",
        to ?? "1405/12/29",
      );
      return reply.send({ ok: true, ...result });
    } catch (e: unknown) {
      server.log.error(e);
      return reply.code(500).send({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  server.get("/api/admin/archive-all", async (req, reply) => {
    if (!isLocal(req.ip)) {
      return reply.code(403).send({ error: "Forbidden (localhost only)" });
    }

    const { from, to } = req.query as { from?: string; to?: string };

    for (const [k, v] of Object.entries(deprecation)) reply.header(k, v);

    try {
      const symbols = WATCHLIST.map((w) => w.sym);
      const results = await ingestArchiveForSymbols(
        server.db,
        symbols,
        from ?? "1402/01/01",
        to ?? "1405/12/29",
      );

      const totals = results.reduce(
        (acc, r) => ({
          lettersFound: acc.lettersFound + r.lettersFound,
          reportsParsed: acc.reportsParsed + r.reportsParsed,
          rowsUpserted: acc.rowsUpserted + r.rowsUpserted,
          errors: acc.errors + r.errors.length,
        }),
        { lettersFound: 0, reportsParsed: 0, rowsUpserted: 0, errors: 0 },
      );

      return reply.send({ ok: true, totals, symbols: results.length, results });
    } catch (e: unknown) {
      server.log.error(e);
      return reply.code(500).send({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });
}
