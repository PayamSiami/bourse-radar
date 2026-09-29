import "dotenv/config";
import { recomputeForwardPe } from "../src/services/ingest.ts";

const sql = (await import("postgres")).default(process.env.DATABASE_URL, { max: 1 });
const n = await recomputeForwardPe(sql);
console.log(`✓ Recomputed forward P/E for ${n} symbols`);
await sql.end();
