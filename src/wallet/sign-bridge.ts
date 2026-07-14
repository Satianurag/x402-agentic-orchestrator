import { type Hex } from "viem";

export type SignRequestKind = "message" | "authorization" | "typed_data";

export interface TypedDataSignPayload {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface SignRequest {
  id: string;
  kind: SignRequestKind;
  message?: Hex;
  authorization?: {
    address: `0x${string}`;
    chainId: number;
    nonce: number;
  };
  typedData?: TypedDataSignPayload;
}

const pending = new Map<
  string,
  {
    resolve: (value: string) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

let emitSignRequest: ((req: SignRequest) => void) | null = null;

export function setSignRequestEmitter(emitter: ((req: SignRequest) => void) | null): void {
  emitSignRequest = emitter;
}

export function fulfillSignRequest(id: string, signature: string): void {
  const entry = pending.get(id);
  if (!entry) throw new Error(`No pending sign request: ${id}`);
  clearTimeout(entry.timer);
  pending.delete(id);
  entry.resolve(signature);
}

export function rejectSignRequest(id: string, reason: string): void {
  const entry = pending.get(id);
  if (!entry) throw new Error(`No pending sign request: ${id}`);
  clearTimeout(entry.timer);
  pending.delete(id);
  entry.reject(new Error(reason));
}

function waitForSignature(req: SignRequest, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(req.id);
      reject(new Error(`Sign request timed out (${req.kind})`));
    }, timeoutMs);
    pending.set(req.id, { resolve, reject, timer });
    if (!emitSignRequest) {
      clearTimeout(timer);
      pending.delete(req.id);
      reject(new Error("No sign request emitter — Magic UI signing not wired for this run"));
      return;
    }
    emitSignRequest(req);
  });
}

export async function requestDelegatedSignMessage(message: Hex): Promise<`0x${string}`> {
  const id = crypto.randomUUID();
  const sig = await waitForSignature({ id, kind: "message", message });
  return sig as `0x${string}`;
}

export async function requestDelegatedSignAuthorization(auth: {
  address: `0x${string}`;
  chainId: number;
  nonce: number;
}): Promise<string> {
  const id = crypto.randomUUID();
  return waitForSignature({ id, kind: "authorization", authorization: auth });
}

export async function requestDelegatedSignTypedData(
  typedData: TypedDataSignPayload,
): Promise<`0x${string}`> {
  const id = crypto.randomUUID();
  const sig = await waitForSignature({ id, kind: "typed_data", typedData });
  return sig as `0x${string}`;
}
