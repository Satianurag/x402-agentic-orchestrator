import { atomicToUsdc, usdcToAtomic } from "../config/chains.js";
import { getEoaBaseUsdcBalance } from "../wallet/eoa.js";
import { getUniversalAccountWallet } from "../wallet/ua.js";

export class BudgetOverflowError extends Error {
  constructor(
    message: string,
    readonly spentUsdc: number,
    readonly capUsdc: number,
    readonly quoteUsdc: number,
  ) {
    super(message);
    this.name = "BudgetOverflowError";
  }
}

export interface UaTopUpResult {
  transactionId: string;
  amountUsdc: number;
}

export class BudgetGuard {
  private readonly capAtomic: bigint;
  private spentAtomic: bigint = 0n;
  private funded = false;
  uaTopUp?: UaTopUpResult;

  constructor(private readonly capUsdc: number) {
    this.capAtomic = usdcToAtomic(capUsdc);
  }

  get cap(): number {
    return this.capUsdc;
  }

  get spent(): number {
    return atomicToUsdc(this.spentAtomic);
  }

  /**
   * Fund run wallet: UA → EOA on Base for paid Bazaar x402 tools.
   * Local Gemini compose is free and does not need USDC.
   */
  async fundRunWallet(): Promise<UaTopUpResult | undefined> {
    const ua = getUniversalAccountWallet();
    const current = await getEoaBaseUsdcBalance();

    if (current >= this.capAtomic) {
      this.funded = true;
      return undefined;
    }

    const uaAmountUsdc = atomicToUsdc(this.capAtomic - current);
    const eoa = ua.signer.address;

    let uaBalance: number;
    try {
      uaBalance = await ua.getUnifiedUsdcBalance();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Need more credit (~$${uaAmountUsdc.toFixed(2)}) before this run can start. ` +
          `Universal Account balance unavailable (${detail}). ` +
          `Deposit Primary Assets to your UA address, or send USDC on Base to ${eoa}.`,
      );
    }

    if (uaBalance < uaAmountUsdc) {
      throw new Error(
        `Not enough credit. Available ~$${uaBalance.toFixed(2)}, need ~$${uaAmountUsdc.toFixed(2)}. ` +
          `Deposit USDC into your Universal Account (see Add funds), then try again.`,
      );
    }

    console.log(
      `[budget] EOA Base USDC ${atomicToUsdc(current).toFixed(6)} < cap ${this.capUsdc.toFixed(6)} — ` +
        `firing UA cross-chain 7702 top-up of $${uaAmountUsdc.toFixed(6)}`,
    );

    let result: { transactionId: string };
    try {
      result = await ua.crossChainTopUpEoa(uaAmountUsdc.toFixed(6));
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Could not move credit from Universal Account to your spend wallet (${detail}). ` +
          `Send USDC on Base to ${eoa} and retry.`,
      );
    }
    this.uaTopUp = { transactionId: result.transactionId, amountUsdc: uaAmountUsdc };

    const after = await getEoaBaseUsdcBalance();
    if (after < this.capAtomic) {
      throw new Error(
        `Credit move finished but spend wallet is still short for this run. ` +
          `Send USDC on Base to ${eoa} and try again.`,
      );
    }

    this.funded = true;
    return this.uaTopUp;
  }

  async getRemaining(): Promise<number> {
    const onChain = atomicToUsdc(await getEoaBaseUsdcBalance());
    return Math.min(Math.max(0, this.capUsdc - this.spent), onChain);
  }

  async preCheck(quoteUsdc: number, _network?: string): Promise<void> {
    this.assertFunded();
    const quoteAtomic = usdcToAtomic(quoteUsdc);
    const projected = this.spentAtomic + quoteAtomic;
    if (projected > this.capAtomic) {
      throw new BudgetOverflowError(
        `Budget overflow: spent ${this.spent.toFixed(6)} + quote ${quoteUsdc.toFixed(6)} > cap ${this.capUsdc.toFixed(6)} USDC`,
        this.spent,
        this.capUsdc,
        quoteUsdc,
      );
    }

    const onChain = await getEoaBaseUsdcBalance();
    if (onChain < quoteAtomic) {
      throw new BudgetOverflowError(
        `On-chain insufficient: EOA has ${atomicToUsdc(onChain).toFixed(6)} USDC, need ${quoteUsdc.toFixed(6)}`,
        this.spent,
        this.capUsdc,
        quoteUsdc,
      );
    }
  }

  recordSpend(usdc: number): void {
    this.spentAtomic += usdcToAtomic(usdc);
  }

  /** Restore spend ledger when resuming a partially completed run. */
  seedSpent(usdc: number): void {
    this.spentAtomic = usdcToAtomic(usdc);
  }

  assertFunded(): void {
    if (!this.funded) {
      throw new Error("Run wallet not funded — call fundRunWallet() first");
    }
  }
}

export async function fundRunWallet(capUsdc: number): Promise<BudgetGuard> {
  const guard = new BudgetGuard(capUsdc);
  await guard.fundRunWallet();
  return guard;
}
