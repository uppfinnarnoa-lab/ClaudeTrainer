/**
 * Backfill all missing descriptions via our own API endpoint.
 * The endpoint handles Strava auth, rate limits per call.
 *
 * Run: node scripts/backfill-all-descriptions.mjs
 *
 * Each API call fetches 30 activities with 300ms delay each = ~9s per batch.
 * We wait 16s between batches to stay safe under rate limits.
 */

const BASE_URL  = "http://localhost:3000";
const INTERVAL  = 20_000;  // 20s between batches

async function fetchCount() {
  const res = await fetch(`${BASE_URL}/api/strava/backfill-descriptions`);
  if (!res.ok) throw new Error(`GET failed: ${res.status}. Is the dev server running?`);
  return res.json();
}

async function runBatch() {
  const res = await fetch(`${BASE_URL}/api/strava/backfill-descriptions`, { method: "POST" });
  if (!res.ok) throw new Error(`POST failed: ${res.status}`);
  return res.json();
}

async function main() {
  const { total, missing } = await fetchCount();
  if (missing === 0) { console.log("✅ All descriptions already fetched!"); return; }

  console.log(`=== Backfill descriptions ===`);
  console.log(`Total activities: ${total}`);
  console.log(`Missing description: ${missing}`);
  console.log(`Batches needed: ~${Math.ceil(missing / 30)}`);
  console.log("");

  let totalUpdated = 0, batch = 0;
  const start = Date.now();

  while (true) {
    batch++;
    process.stdout.write(`Batch ${batch}: fetching 30... `);

    try {
      const result = await runBatch();
      totalUpdated += result.updated ?? 0;
      const remaining = result.remaining ?? 0;
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`✓ +${result.updated} updated | ${remaining} remaining | ${elapsed}s elapsed`);

      if (result.done || remaining === 0) {
        console.log(`\n✅ Done! Updated ${totalUpdated} activities in ${batch} batches.`);
        break;
      }

      // Wait between batches
      process.stdout.write(`  Waiting ${INTERVAL/1000}s... `);
      await new Promise(r => setTimeout(r, INTERVAL));
      console.log("continuing.");
    } catch (e) {
      console.error(`\n❌ Error: ${e.message}`);
      console.log("Retrying in 60s...");
      await new Promise(r => setTimeout(r, 60_000));
    }
  }
}

main().catch(console.error);
