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
   * Fund run wallet: UA cross-chain top-up → EOA on Base (7702 path), then verify
   * on-chain EOA balance covers the cap. Chain rejects payments when EOA is empty.
   */
  async fundRunWallet(): Promise<UaTopUpResult | undefined> {
    const ua = getUniversalAccountWallet();
    const current = await getEoaBaseUsdcBalance();

    if (current >= this.capAtomic) {
      this.funded = true;
      return undefined;
    }

    const uaAmountUsdc = atomicToUsdc(this.capAtomic - current);
    const uaBalance = await ua.getUnifiedUsdcBalance();
    if (uaBalance < uaAmountUsdc) {
      throw new Error(
        `Universal Account unified USDC $${uaBalance.toFixed(6)} < needed top-up $${uaAmountUsdc.toFixed(6)}. ` +
          `EOA Base balance is $${atomicToUsdc(current).toFixed(6)}; run cap is $${this.capUsdc.toFixed(6)}.`,
      );
    }

    console.log(
      `[budget] EOA Base USDC ${atomicToUsdc(current).toFixed(6)} < cap ${this.capUsdc.toFixed(6)} — ` +
        `firing UA cross-chain 7702 top-up of $${uaAmountUsdc.toFixed(6)}`,
    );
    const result = await ua.crossChainTopUpEoa(uaAmountUsdc.toFixed(6));
    this.uaTopUp = { transactionId: result.transactionId, amountUsdc: uaAmountUsdc };

    const after = await getEoaBaseUsdcBalance();
    if (after < this.capAtomic) {
      throw new Error(
        `EOA Base USDC ${atomicToUsdc(after).toFixed(6)} < run cap ${this.capUsdc.toFixed(6)} after UA top-up. ` +
          "Fund the Universal Account with USDC before starting a run.",
      );
    }

    this.funded = true;
    return this.uaTopUp;
  }

  async getRemaining(): Promise<number> {
    const onChain = atomicToUsdc(await getEoaBaseUsdcBalance());
    return Math.min(Math.max(0, this.capUsdc - this.spent), onChain);
  }

  async preCheck(quoteUsdc: number): Promise<void> {
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
