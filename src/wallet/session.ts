import { getRunEoaAddress } from "./eoa.js";
import { verifyMagicDidToken } from "./ua.js";

export interface RunSession {
  eoaAddress: `0x${string}`;
  magicVerified: boolean;
}

/** CLI: PRIVATE_KEY only. UI: Magic DID token must match the same EOA. */
export async function resolveRunSession(didToken?: string): Promise<RunSession> {
  const eoaAddress = getRunEoaAddress();

  if (!didToken) {
    return { eoaAddress, magicVerified: false };
  }

  const magicAddress = (await verifyMagicDidToken(didToken)) as `0x${string}`;
  if (magicAddress.toLowerCase() !== eoaAddress.toLowerCase()) {
    throw new Error(
      `Magic wallet ${magicAddress} does not match PRIVATE_KEY EOA ${eoaAddress}. ` +
        "Use the Magic-provisioned key as PRIVATE_KEY on the server.",
    );
  }

  return { eoaAddress, magicVerified: true };
}
