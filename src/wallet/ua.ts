import {
  SUPPORTED_TOKEN_TYPE,
  UniversalAccount,
  type EIP7702Authorization,
  type ITransaction,
  type IUserOpEVM,
  type IUserOpWithChain,
} from "@particle-network/universal-account-sdk";
import { Magic } from "@magic-sdk/admin";
import { type Hex } from "viem";
import {
  getPaymentUsdc,
  getUaTopUpChainId,
} from "../config/chains.js";
import { getRunContext } from "./run-context.js";
import type { RunSigner } from "./signer.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

let magicAdmin: Magic | null = null;

export async function getMagicAdmin(): Promise<Magic> {
  if (!magicAdmin) {
    magicAdmin = await Magic.init(requireEnv("MAGIC_SECRET_KEY"));
  }
  return magicAdmin;
}

export async function verifyMagicDidToken(didToken: string): Promise<string> {
  const admin = await getMagicAdmin();
  admin.token.validate(didToken);
  const meta = await admin.users.getMetadataByToken(didToken);
  const address =
    meta.publicAddress ??
    meta.wallets?.find((w) => w.network === "ethereum")?.publicAddress ??
    meta.wallets?.[0]?.publicAddress;
  if (!address) throw new Error("Magic user has no public address");
  return address;
}

export function humanizeUaError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Live probe via official UniversalAccount.getSmartAccountOptions(). */
export async function probeParticleUa(ownerAddress: string): Promise<{ ok: boolean; detail: string }> {
  if (!process.env.PARTICLE_PROJECT_ID || !process.env.PARTICLE_CLIENT_KEY || !process.env.PARTICLE_APP_ID) {
    return { ok: false, detail: "Missing PARTICLE_* credentials" };
  }
  try {
    const ua = new UniversalAccount({
      projectId: process.env.PARTICLE_PROJECT_ID,
      projectClientKey: process.env.PARTICLE_CLIENT_KEY,
      projectAppUuid: process.env.PARTICLE_APP_ID,
      // SDK 2.0.3: top-level ownerAddress removed — use smartAccountOptions.
      smartAccountOptions: {
        // SDK 2.0.3 default account name is UNIVERSAL (not "particle").
        // Official quickstart passes ownerAddress; 2.0.3 stores it under smartAccountOptions.
        name: "UNIVERSAL",
        version: "2.0.1",
        ownerAddress,
        useEIP7702: true,
      },
      ...(process.env.UNIVERSALX_RPC_URL ? { rpcUrl: process.env.UNIVERSALX_RPC_URL } : {}),
    });
    const opts = await ua.getSmartAccountOptions();
    const addr = opts.smartAccountAddress ?? opts.ownerAddress;
    return { ok: true, detail: `EIP-7702 UA ready · ${String(addr).slice(0, 6)}…${String(addr).slice(-4)}` };
  } catch (err) {
    return { ok: false, detail: humanizeUaError(err) };
  }
}

export class UniversalAccountWallet {
  readonly ua: UniversalAccount;
  readonly signer: RunSigner;

  constructor(signer: RunSigner) {
    this.signer = signer;
    const rpcUrl = process.env.UNIVERSALX_RPC_URL;
    this.ua = new UniversalAccount({
      projectId: requireEnv("PARTICLE_PROJECT_ID"),
      projectClientKey: requireEnv("PARTICLE_CLIENT_KEY"),
      projectAppUuid: requireEnv("PARTICLE_APP_ID"),
      smartAccountOptions: {
        // SDK 2.0.3 default: name UNIVERSAL. Docs quickstart uses top-level ownerAddress;
        // that field was removed in 2.0.3 — pass owner via smartAccountOptions instead.
        name: "UNIVERSAL",
        version: "2.0.1",
        ownerAddress: signer.address,
        useEIP7702: true,
      },
      // SDK 2.0.2 removed universalGas; keep mild slippage for routing.
      tradeConfig: {
        slippageBps: 100,
      },
      ...(rpcUrl ? { rpcUrl } : {}),
    });
  }

  async getAddress(): Promise<`0x${string}`> {
    const opts = await this.ua.getSmartAccountOptions();
    return (opts.smartAccountAddress ?? opts.ownerAddress) as `0x${string}`;
  }

  async getUnifiedUsdcBalance(): Promise<number> {
    const assets = await this.ua.getPrimaryAssets();
    let total = 0;
    for (const asset of assets.assets) {
      if (asset.tokenType === SUPPORTED_TOKEN_TYPE.USDC) total += asset.amountInUSD;
    }
    return total;
  }

  private async collect7702Authorizations(tx: ITransaction): Promise<EIP7702Authorization[]> {
    const authorizations: EIP7702Authorization[] = [];
    const nonceMap = new Map<number, string>();

    for (const chainOp of tx.userOps) {
      const auth = this.resolve7702Auth(chainOp);
      if (!auth || this.is7702Delegated(chainOp)) continue;

      let signature = nonceMap.get(auth.nonce);
      if (!signature) {
        signature = await this.signer.signAuthorization({
          address: auth.address as `0x${string}`,
          chainId: auth.chainId,
          nonce: auth.nonce,
        });
        nonceMap.set(auth.nonce, signature);
      }
      authorizations.push({ userOpHash: chainOp.userOpHash, signature });
    }
    return authorizations;
  }

  private resolve7702Auth(chainOp: IUserOpWithChain) {
    if (chainOp.eip7702Auth) return chainOp.eip7702Auth;
    const evm = chainOp.userOp as IUserOpEVM;
    return evm.eip7702Auth;
  }

  private is7702Delegated(chainOp: IUserOpWithChain): boolean {
    const evm = chainOp.userOp as IUserOpEVM;
    return Boolean(evm.eip7702Delegated);
  }

  async sendUaTransaction(tx: ITransaction): Promise<{ transactionId: string }> {
    const rootHash = tx.rootHash as Hex;
    const signature = await this.signer.signMessage(rootHash);
    const authorizations = await this.collect7702Authorizations(tx);
    const result = await this.ua.sendTransaction(tx, signature, authorizations);
    console.log(`[ua] 7702 transaction broadcast id=${result.transactionId}`);
    return result;
  }

  /** Cross-chain UA transfer: unified balance → run EOA on Base (7702 + value move). */
  async crossChainTopUpEoa(amountUsdc: string): Promise<{ transactionId: string }> {
    const receiver = this.signer.address;
    const tx = await this.ua.createTransferTransaction({
      token: {
        chainId: getUaTopUpChainId(),
        address: getPaymentUsdc(),
      },
      amount: amountUsdc,
      receiver,
    });
    return this.sendUaTransaction(tx);
  }
}

export function getUniversalAccountWallet(): UniversalAccountWallet {
  const { signer } = getRunContext();
  return new UniversalAccountWallet(signer);
}
