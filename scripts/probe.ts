#!/usr/bin/env node
/** Live 402 probe via Bazaar catalog + synthesize seller. */
import "dotenv/config";
import { discoverToolCatalog, probeSelectedTools } from "../src/agent/tool-catalog.js";
import { synthesizeEstimateCost } from "../src/services/seller.js";

const SAMPLE_GOAL = process.env.PROBE_GOAL ?? "web search news about AI agents";

async function main() {
  console.log(`Probing Bazaar catalog for: "${SAMPLE_GOAL}"\n`);
  const catalog = await discoverToolCatalog(SAMPLE_GOAL, 5);
  const probed = await probeSelectedTools(catalog.slice(0, 3), SAMPLE_GOAL);

  for (const t of probed) {
    const price = t.probeUsdc ?? t.catalogUsdc;
    console.log(`${t.displayName}: ${price != null ? `$${price.toFixed(6)}` : "no price"} (${t.mcpToolName.slice(0, 48)}…)`);
  }

  const synth = await synthesizeEstimateCost();
  console.log(`\nSynthesize: $${synth.toFixed(6)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
