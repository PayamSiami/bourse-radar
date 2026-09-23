import type { FastifyInstance } from "fastify";
import { z } from "zod";

// ---------- Schemas ----------

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  min_confidence: z.enum(["high", "medium", "low"]).optional(),
  max_forward_pe: z.coerce.number().positive().optional(),
  min_attractiveness: z.coerce.number().min(0).max(100).optional(),
  sector: z.string().optional(),
  refresh: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => v === true || v === "true")
    .optional(),
});

type QueryInput = z.infer<typeof QuerySchema>;

// ---------- Cache helpers ----------

const CACHE_TTL_SECONDS = 900;
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;

interface CachedEnvelope<T> {
  data: T;
  _cachedAt: number;
}

async function readCache<T>(
  redis: FastifyInstance["redis"],
  key: string,
): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedEnvelope<T>;
    if (Date.now() - parsed._cachedAt < CACHE_TTL_MS) return parsed.data;
  } catch {
    // Corrupt cache entry — ignore and let caller regenerate.
  }
  return null;
}

async function writeCache<T>(
  redis: FastifyInstance["redis"],
  key: string,
  data: T,
): Promise<void> {
  const envelope: CachedEnvelope<T> = { data, _cachedAt: Date.now() };
  await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(envelope));
}

// ---------- Confidence mapping ----------

const CONFIDENCE_LEVELS: Record<
  NonNullable<QueryInput["min_confidence"]>,
  string[]
> = {
  high: ["high"],
  medium: ["high", "medium"],
  low: ["high", "medium", "low"],
};

// ---------- Routes ----------

export async function registerRankingsRoutes(
  server: FastifyInstance,
  opts: { prefix: string },
) {
  const base = opts.prefix.replace(/\/$/, "");

  // GET {prefix}/
  server.get(
    `${base}/`,
    {
      schema: {
        tags: ["rankings"],
        description: "Ranked list of stocks by quantitative attractiveness",
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
            min_confidence: { type: "string", enum: ["high", "medium", "low"] },
            max_forward_pe: { type: "number", exclusiveMinimum: 0 },
            min_attractiveness: { type: "number", minimum: 0, maximum: 100 },
            sector: { type: "string" },
            refresh: { type: "boolean" },
          },
        },
      },
    },
    async (req, reply) => {
      const parsed = QuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const q = parsed.data;

      const cacheKey = `rankings:${JSON.stringify(q)}`;

      if (!q.refresh) {
        const cached = await readCache<unknown>(server.redis, cacheKey);
        if (cached) return cached;
      }

      // ---- Build SQL ----
      const filters: string[] = [
        `fp.forward_pe IS NOT NULL`,
        `fp.forward_pe > 0`,
        `fp.confidence != 'non_calculable'`,
      ];
      const params: unknown[] = [];

      if (q.min_confidence) {
        const validConfs = CONFIDENCE_LEVELS[q.min_confidence];
        params.push(validConfs);
        filters.push(`fp.confidence = ANY($${params.length}::text[])`);
      }

      if (q.max_forward_pe !== undefined) {
        params.push(q.max_forward_pe);
        filters.push(`fp.forward_pe <= $${params.length}`);
      }

      if (q.min_attractiveness !== undefined) {
        params.push(q.min_attractiveness);
        filters.push(`fr.attractiveness_score >= $${params.length}`);
      } else {
        filters.push(`fr.attractiveness_score IS NOT NULL`);
      }

      if (q.sector) {
        params.push(q.sector);
        filters.push(`s.sector = $${params.length}`);
      }

      const limitPlaceholder = `$${params.length + 1}`;
      const sql = `
        SELECT
          s.symbol,
          s.name,
          s.sector,
          p.last_price        AS "currentPrice",
          p.volume            AS "dailyVolume",
          fp.forward_pe       AS "forwardPe",
          fp.estimated_annual_eps AS "estimatedAnnualEps",
          fp.confidence,
          fp.confidence_score AS "confidenceScore",
          fr.attractiveness_score AS "attractivenessScore",
          fr."rank"           AS "rank",
          p.change_percent    AS "priceChangePercent"
        FROM stock_rankings fr
        JOIN stocks s ON s.symbol = fr.symbol
        LEFT JOIN LATERAL (
          SELECT
            forward_pe, estimated_annual_eps,
            confidence, confidence_score
          FROM forward_pe
          WHERE symbol = s.symbol
          ORDER BY calculated_at DESC
          LIMIT 1
        ) fp ON TRUE
        LEFT JOIN LATERAL (
          SELECT last_price, volume, change_percent
          FROM prices
          WHERE symbol = s.symbol
          ORDER BY timestamp DESC
          LIMIT 1
        ) p ON TRUE
        WHERE ${filters.join(" AND ")}
        ORDER BY fr.attractiveness_score DESC
        LIMIT ${limitPlaceholder} OFFSET 0
      `;

      const rows = await server.db.unsafe(sql, [...params, q.limit] as never[]);

      const result = {
        data: rows,
        meta: {
          count: rows.length,
          filters: q,
          generatedAt: new Date().toISOString(),
          source: "materialized_view" as const,
        },
      };

      await writeCache(server.redis, cacheKey, result);

      return result;
    },
  );

  // GET {prefix}/sectors
  server.get(
    `${base}/sectors`,
    {
      schema: {
        tags: ["rankings"],
        description: "Rankings broken down by sector",
      },
    },
    async () => {
      const cacheKey = "rankings:sectors";

      const cached = await readCache<unknown>(server.redis, cacheKey);
      if (cached) return cached;

      const rows = await server.db`
        SELECT
          s.sector,
          COUNT(*)                          AS "stock_count",
          AVG(fp.forward_pe)                AS "avg_forward_pe",
          AVG(fp.confidence_score)          AS "avg_confidence",
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fp.forward_pe) AS "median_forward_pe",
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fr.attractiveness_score) AS "median_score"
        FROM stocks s
        JOIN stock_rankings fr ON fr.symbol = s.symbol
        JOIN LATERAL (
          SELECT
            forward_pe, confidence, confidence_score
          FROM forward_pe
          WHERE symbol = s.symbol
          ORDER BY calculated_at DESC
          LIMIT 1
        ) fp ON TRUE
        WHERE fp.confidence != 'non_calculable'
          AND fp.forward_pe IS NOT NULL
          AND fp.forward_pe > 0
        GROUP BY s.sector
        ORDER BY AVG(fr.attractiveness_score) DESC
      `;

      const result = {
        data: rows,
        generatedAt: new Date().toISOString(),
      };

      await writeCache(server.redis, cacheKey, result);

      return result;
    },
  );
}
