#!/usr/bin/env node
/** Live 402 probe via Bazaar catalog + synthesize seller. */
import "dotenv/config";
import { discoverToolCatalog } from "../src/agent/tool-catalog.js";
import { probeToolForPlan } from "../src/agent/tool-probe.js";
import { synthesizeEstimateCost } from "../src/services/seller.js";

const SAMPLE_GOAL = process.env.PROBE_GOAL ?? "web search news about AI agents";

async function main() {
  console.log(`Probing Bazaar catalog for: "${SAMPLE_GOAL}"\n`);
  const catalog = await discoverToolCatalog(SAMPLE_GOAL, 5);

  for (const t of catalog.slice(0, 3)) {
    const outcome = await probeToolForPlan(t, t.exampleInput ?? { query: SAMPLE_GOAL });
    const price = outcome.probeUsdc ?? t.catalogUsdc;
    console.log(
      `${t.displayName}: health=${outcome.health} ${price != null ? `$${price.toFixed(6)}` : "no price"} — ${outcome.detail}`,
    );
  }

  const synth = await synthesizeEstimateCost();
  console.log(`\nSynthesize: $${synth.toFixed(6)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
