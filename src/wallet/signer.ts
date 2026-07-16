import { type Hex } from "viem";
import { Signature } from "ethers";
import { getRunEoaAccountFromKey } from "./eoa.js";
import {
  requestDelegatedSignAuthorization,
  requestDelegatedSignMessage,
} from "./sign-bridge.js";

export interface RunSigner {
  readonly mode: "cli" | "ui";
  readonly address: `0x${string}`;
  signMessage: (message: Hex) => Promise<`0x${string}`>;
  signAuthorization: (auth: {
    address: `0x${string}`;
    chainId: number;
    nonce: number;
  }) => Promise<string>;
}

async function serializeViemAuthorization(
  signed: Awaited<ReturnType<ReturnType<typeof getRunEoaAccountFromKey>["signAuthorization"]>>,
): Promise<string> {
  const yParity = (signed.yParity ?? Number(signed.v ?? 0)) as 0 | 1;
  return Signature.from({ r: signed.r, s: signed.s, yParity }).serialized;
}

export function createCliSigner(privateKey: Hex): RunSigner {
  const account = getRunEoaAccountFromKey(privateKey);
  return {
    mode: "cli",
    address: account.address,
    signMessage: (message) => account.signMessage({ message: { raw: message } }),
    signAuthorization: async (auth) => {
      const signed = await account.signAuthorization({
        address: auth.address,
        chainId: auth.chainId,
        nonce: auth.nonce,
      });
      return serializeViemAuthorization(signed);
    },
  };
}

export function createMagicDelegatedSigner(magicAddress: `0x${string}`): RunSigner {
  return {
    mode: "ui",
    address: magicAddress,
    signMessage: requestDelegatedSignMessage,
    signAuthorization: requestDelegatedSignAuthorization,
  };
}
