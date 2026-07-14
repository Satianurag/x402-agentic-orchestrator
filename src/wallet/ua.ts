import {
  UniversalAccount,
  type EIP7702Authorization,
  type ITransaction,
} from "@particle-network/universal-account-sdk";
import { Magic } from "@magic-sdk/admin";
import { createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Signature } from "ethers";
import { getArbitrumChain, getArbitrumRpcUrl, getArbitrumUsdc, getNetworkMode } from "../config/chains.js";

export interface RunSigner {
  address: `0x${string}`;
  signMessage: (message: Hex) => Promise<`0x${string}`>;
  signAuthorization?: (auth: {
    address: `0x${string}`;
    chainId: number;
    nonce: number;
  }) => Promise<string>;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

/** Dev/CLI signer from PRIVATE_KEY (same EOA Magic would provision in production). */
export function createPrivateKeySigner(): RunSigner {
  const key = requireEnv("PRIVATE_KEY") as Hex;
  const account = privateKeyToAccount(key);
  return {
    address: account.address,
    signMessage: (message) => account.signMessage({ message: { raw: message } }),
    signAuthorization: async (auth) => {
      const signed = await account.signAuthorization({
        address: auth.address,
        chainId: auth.chainId,
        nonce: auth.nonce,
      });
      const yParity = (signed.yParity ?? Number(signed.v ?? 0)) as 0 | 1;
      return Signature.from({ r: signed.r, s: signed.s, yParity }).serialized;
    },
  };
}

let magicAdmin: Magic | null = null;

export function getMagicAdmin(): Magic | null {
  const secret = process.env.MAGIC_SECRET_KEY;
  if (!secret) return null;
  if (!magicAdmin) {
    magicAdmin = new Magic(secret);
  }
  return magicAdmin;
}

export async function verifyMagicDidToken(didToken: string): Promise<string> {
  const admin = getMagicAdmin();
  if (!admin) throw new Error("MAGIC_SECRET_KEY not configured");
  admin.token.validate(didToken);
  const meta = await admin.users.getMetadataByToken(didToken);
  if (!meta.publicAddress) throw new Error("Magic user has no public address");
  return meta.publicAddress;
}

export class UniversalAccountWallet {
  readonly ua: UniversalAccount;
  readonly signer: RunSigner;

  constructor(signer: RunSigner) {
    this.signer = signer;

    this.ua = new UniversalAccount({
      projectId: requireEnv("PARTICLE_PROJECT_ID"),
      projectClientKey: requireEnv("PARTICLE_CLIENT_KEY"),
      projectAppUuid: requireEnv("PARTICLE_APP_ID"),
      smartAccountOptions: {
        name: "particle",
        version: "2.0.1",
        ownerAddress: signer.address,
        useEIP7702: true,
      },
      rpcUrl: getArbitrumRpcUrl(),
    });
  }

  async getAddress(): Promise<`0x${string}`> {
    const opts = await this.ua.getSmartAccountOptions();
    return (opts.smartAccountAddress ?? opts.ownerAddress) as `0x${string}`;
  }

  async getUnifiedUsdcBalance(): Promise<number> {
    const assets = await this.ua.getPrimaryAssets();
    let total = 0;
    for (const asset of assets.assets ?? []) {
      if (asset.tokenType === "usdc") {
        total += asset.amountInUSD;
      }
    }
    return total;
  }

  private async collect7702Authorizations(tx: ITransaction): Promise<EIP7702Authorization[]> {
    const authorizations: EIP7702Authorization[] = [];
    const nonceMap = new Map<number, string>();

    for (const userOp of tx.userOps ?? []) {
      if (userOp.eip7702Auth && !userOp.eip7702Delegated && this.signer.signAuthorization) {
        let signature = nonceMap.get(userOp.eip7702Auth.nonce);
        if (!signature) {
          signature = await this.signer.signAuthorization({
            address: userOp.eip7702Auth.address as `0x${string}`,
            chainId: userOp.eip7702Auth.chainId,
            nonce: userOp.eip7702Auth.nonce,
          });
          nonceMap.set(userOp.eip7702Auth.nonce, signature);
        }
        authorizations.push({ userOpHash: userOp.userOpHash, signature });
      }
    }
    return authorizations;
  }

  async sendUaTransaction(tx: ITransaction): Promise<{ transactionId: string }> {
    const rootHash = tx.rootHash as Hex;
    const signature = await this.signer.signMessage(rootHash);
    const authorizations = await this.collect7702Authorizations(tx);
    return this.ua.sendTransaction(tx, signature, authorizations);
  }

  async transferUsdc(amountUsdc: string, receiver: `0x${string}`): Promise<{ transactionId: string }> {
    const mode = getNetworkMode();
    const chainId = mode === "mainnet" ? 42161 : 421614;

    const tx = await this.ua.createTransferTransaction({
      token: {
        chainId,
        address: getArbitrumUsdc(mode),
      },
      amount: amountUsdc,
      receiver,
    });
    return this.sendUaTransaction(tx);
  }

  /** On-chain USDC balance for the UA address on Arbitrum (hard cap enforcement). */
  async getOnChainUsdcBalance(): Promise<bigint> {
    const address = await this.getAddress();
    const client = createPublicClient({
      chain: getArbitrumChain(),
      transport: http(getArbitrumRpcUrl()),
    });
    const balance = await client.readContract({
      address: getArbitrumUsdc() as `0x${string}`,
      abi: [
        {
          name: "balanceOf",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "account", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
        },
      ] as const,
      functionName: "balanceOf",
      args: [address],
    });
    return balance;
  }
}

let walletInstance: UniversalAccountWallet | null = null;

export function getUniversalAccountWallet(): UniversalAccountWallet {
  if (!walletInstance) {
    walletInstance = new UniversalAccountWallet(createPrivateKeySigner());
  }
  return walletInstance;
}
