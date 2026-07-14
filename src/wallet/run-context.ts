import { AsyncLocalStorage } from "node:async_hooks";
import type { RunSigner } from "./signer.js";

export interface RunContext {
  eoaAddress: `0x${string}`;
  signer: RunSigner;
  magicVerified: boolean;
}

const storage = new AsyncLocalStorage<RunContext>();

export function runWithContext<T>(ctx: RunContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function getRunContext(): RunContext {
  const ctx = storage.getStore();
  if (!ctx) throw new Error("No active run context — call runWithContext first");
  return ctx;
}

export function tryGetRunContext(): RunContext | undefined {
  return storage.getStore();
}
