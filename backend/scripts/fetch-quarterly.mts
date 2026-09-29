import "dotenv/config";
import { syncQuarterlyFinancials } from "../src/services/ingest.ts";

const sql = (await import("postgres")).default(process.env.DATABASE_URL, { max: 1 });
const count = await syncQuarterlyFinancials(sql, ["فسبزوار"], { from: "1399/01/01", to: "1410/12/30" });
console.log(`✓ Synced ${count} quarterly financials`);
await sql.end();
