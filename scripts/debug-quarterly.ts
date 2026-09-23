// scripts/test-extract-IS.ts
import {
  fetchQuarterlyFinancials,
  closeBrowser,
} from "#scrapers/codal";

const SYMBOL = "شپنا";

async function main() {
  console.log(`=== ${SYMBOL} ===`);

  const result = await fetchQuarterlyFinancials(SYMBOL);

  if (!result) {
    console.log("❌ no quarterly data");
    await closeBrowser();
    return;
  }

  console.log("\n=== RESULT ===");
  console.log("latestPeriod:", result.latestPeriod);
  console.log("latestMargin:", result.latestMargin);
  console.log("periodEnds:  ", JSON.stringify(result.financials.periodEnds));
  console.log("margins:     ", JSON.stringify(result.financials.margins));

  await closeBrowser();
}

main().catch(async (e) => {
  console.error(e);
  await closeBrowser();
  process.exit(1);
});