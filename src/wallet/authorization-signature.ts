import { Signature } from "ethers";

export interface AuthorizationSignatureParts {
  r: string;
  s: string;
  v?: number | bigint;
  yParity?: number;
  y_parity?: number;
}

/** Normalize Magic Express decimal strings or hex into 32-byte hex. */
function normalizeSignatureComponent(value: string): string {
  if (value.startsWith("0x")) return value;
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

/**
 * Resolve EIP-7702 yParity from viem (yParity 0|1), Magic embedded (v 27|28),
 * or Magic Express (y_parity 0|1).
 */
export function resolveAuthorizationYParity(signed: AuthorizationSignatureParts): 0 | 1 {
  if (signed.yParity === 0 || signed.yParity === 1) return signed.yParity;
  if (signed.y_parity === 0 || signed.y_parity === 1) return signed.y_parity;

  const v = Number(signed.v ?? -1);
  if (v === 27) return 0;
  if (v === 28) return 1;
  if (v === 0 || v === 1) return v as 0 | 1;

  throw new Error(`Unsupported EIP-7702 authorization signature v/yParity: v=${String(signed.v)}`);
}

/** Serialize authorization signature for Particle UA `EIP7702Authorization.signature`. */
export function serializeAuthorizationSignature(signed: AuthorizationSignatureParts): string {
  const yParity = resolveAuthorizationYParity(signed);
  return Signature.from({
    r: normalizeSignatureComponent(signed.r),
    s: normalizeSignatureComponent(signed.s),
    yParity,
  }).serialized;
}
