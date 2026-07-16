import { verifyMagicDidToken } from "./ua.js";
import { createCliSigner, createMagicDelegatedSigner, type RunSigner } from "./signer.js";
import type { Hex } from "viem";

export interface RunSession {
  eoaAddress: `0x${string}`;
  signer: RunSigner;
  magicVerified: boolean;
}

/** CLI: PRIVATE_KEY signer. UI: Magic embedded wallet is the EIP-7702 owner/signer (no PRIVATE_KEY match). */
export async function resolveRunSession(didToken?: string, requireMagic = false): Promise<RunSession> {
  if (requireMagic && !didToken) {
    throw new Error("Magic login required — provide didToken from the UI");
  }

  if (didToken) {
    const magicAddress = (await verifyMagicDidToken(didToken)) as `0x${string}`;
    const signer = createMagicDelegatedSigner(magicAddress);
    return { eoaAddress: magicAddress, signer, magicVerified: true };
  }

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY required for CLI runs (or provide Magic didToken for UI)");
  }
  const signer = createCliSigner(privateKey as Hex);
  return { eoaAddress: signer.address, signer, magicVerified: false };
}
