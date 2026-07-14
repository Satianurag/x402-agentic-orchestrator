import { atomicToUsdc, usdcToAtomic } from "../config/chains.js";
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

export class BudgetGuard {
  private capAtomic: bigint = 0n;
  private spentAtomic: bigint = 0n;
  private funded = false;

  constructor(private readonly capUsdc: number) {
    this.capAtomic = usdcToAtomic(capUsdc);
  }

  get cap(): number {
    return this.capUsdc;
  }

  get spent(): number {
    return atomicToUsdc(this.spentAtomic);
  }

  get remaining(): number {
    return Math.max(0, this.capUsdc - this.spent);
  }

  /** Fund the run wallet with exactly the budget cap via UA transfer to self. */
  async fundRunWallet(): Promise<void> {
    const wallet = getUniversalAccountWallet();
    const address = await wallet.getAddress();

    // Ensure UA holds at least cap USDC on Arbitrum for hard on-chain limit
    const onChain = await wallet.getOnChainUsdcBalance();
    if (onChain < this.capAtomic) {
      const needed = this.capUsdc - atomicToUsdc(onChain);
      if (needed > 0) {
        console.log(`[budget] Funding run wallet with ${needed.toFixed(6)} USDC to ${address}`);
        await wallet.transferUsdc(needed.toFixed(6), address);
      }
    }
    this.funded = true;
  }

  async getRemaining(): Promise<number> {
    const wallet = getUniversalAccountWallet();
    const onChain = await wallet.getOnChainUsdcBalance();
    const chainRemaining = atomicToUsdc(onChain);
    const trackedRemaining = this.remaining;
    return Math.min(chainRemaining, trackedRemaining);
  }

  preCheck(quoteUsdc: number): void {
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

export function getRemaining(guard: BudgetGuard): Promise<number> {
  return guard.getRemaining();
}

export function preCheck(guard: BudgetGuard, quoteUsdc: number): void {
  guard.preCheck(quoteUsdc);
}
