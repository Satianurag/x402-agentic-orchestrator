#!/usr/bin/env node
import { classifyVendorError, stripHtmlFromError } from "../src/agent/vendor-errors.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const down = classifyVendorError(new Error("Alephant failed (502): Bad Gateway"));
assert(down.kind === "vendor_down" && down.retryable, "502 is vendor_down + retryable");

const verify = classifyVendorError(new Error("x402_verify_failed on proxy"));
assert(verify.kind === "verify_failed" && !verify.retryable, "verify not retryable");

const html502 = classifyVendorError(
  new Error('pay_alephant failed (502): <!DOCTYPE html><html>Bad gateway</html>'),
);
assert(html502.kind === "vendor_down" && !html502.userMessage.includes("<html"), "strips HTML");

const stripped = stripHtmlFromError('failed (502): <!DOCTYPE html><title>502</title>');
assert(stripped.includes("502") && !stripped.includes("<!DOCTYPE"), "stripHtmlFromError");

console.log("=== vendor-errors tests passed ===");
