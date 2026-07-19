#!/usr/bin/env node
import { readJsonBodySafe } from "../src/services/x402-client.js";

async function main() {
  const empty = new Response("", { status: 200, headers: { "content-type": "application/json" } });
  const parsed = await readJsonBodySafe(empty);
  if (parsed !== null) throw new Error("expected null for empty body");
  console.log("empty body -> null OK");

  const json = new Response('{"ok":true}', {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  const obj = await readJsonBodySafe(json);
  if (!(obj && typeof obj === "object" && (obj as { ok?: boolean }).ok)) {
    throw new Error("expected parsed JSON");
  }
  console.log("json body -> parsed OK");
  console.log("=== empty-json fix verified ===");
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
