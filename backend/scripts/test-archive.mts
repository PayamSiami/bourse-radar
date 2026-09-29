import "dotenv/config";
import { ingestArchiveForSymbol } from "../src/services/ingest.ts";

const sql = (await import("postgres")).default(process.env.DATABASE_URL, { max: 1 });

console.log("=== Testing ingestArchiveForSymbol directly ===");
const result = await ingestArchiveForSymbol(
  sql,
  "فسبزوار",
  "1402/01/01",
  "1405/12/29",
);
console.log("Result:", JSON.stringify(result, null, 2));

await sql.end();
