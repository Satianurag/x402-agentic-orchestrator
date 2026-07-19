#!/usr/bin/env node
import { classifyProbeFailure, classifyVendorError } from "../src/agent/vendor-errors.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const down = classifyVendorError(new Error("Alephant failed (502): Bad Gateway"));
assert(down.kind === "vendor_down" && down.retryable, "502 is vendor_down + retryable");

const verify = classifyVendorError(new Error("x402_verify_failed on proxy"));
assert(verify.kind === "verify_failed" && !verify.retryable, "verify not retryable");

const probe502 = classifyProbeFailure(new Error("Expected HTTP 402 from Alephant, got 502"));
assert(probe502.userMessage.includes("blocked"), "probe failure blocks start");

console.log("=== vendor-errors tests passed ===");
