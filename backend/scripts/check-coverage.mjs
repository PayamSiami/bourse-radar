import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

// How many months of sales data exist per symbol?
const counts = await sql`
  SELECT symbol, COUNT(*)::int AS months,
         MIN(month_end)::text AS first, MAX(month_end)::text AS last
  FROM monthly_sales
  GROUP BY symbol
  ORDER BY months DESC
`;
console.log("=== months of monthly_sales per symbol ===");
for (const c of counts) {
  console.log(`${c.symbol}: ${c.months} months (${c.first} → ${c.last})`);
}

// Check migration registration
const migs = await sql`SELECT name, applied_at FROM schema_migrations ORDER BY name`;
console.log("\n=== schema_migrations ===");
for (const m of migs) console.log(`  ${m.name}: applied at ${m.applied_at}`);

// Check forward_pe for فسبزوار
const pe = await sql`
  SELECT forward_pe, estimated_annual_eps, method, margin_used, calculation_json
  FROM forward_pe WHERE symbol = 'فسبزوار' ORDER BY calculated_at DESC LIMIT 1
`;
if (pe[0]) {
  console.log("\n=== فسبزوار forward_pe ===");
  console.log(`  PE: ${pe[0].forward_pe}, EPS: ${pe[0].estimated_annual_eps}`);
  console.log(`  Method: ${pe[0].method}, Margin: ${(Number(pe[0].margin_used)*100).toFixed(2)}%`);
  console.log(`  Calc: ${JSON.stringify(pe[0].calculation_json)}`);
}

await sql.end();
