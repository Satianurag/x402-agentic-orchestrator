declare module "@particle-network/universal-account-sdk" {
  export enum CHAIN_ID {
    SOLANA_MAINNET = 101,
    ETHEREUM_MAINNET = 1,
    BSC_MAINNET = 56,
    BASE_MAINNET = 8453,
    XLAYER_MAINNET = 196,
    ARBITRUM_MAINNET_ONE = 42161,
  }

  export interface EIP7702Authorization {
    userOpHash: string;
    signature: string;
  }

  export interface IUserOp {
    userOpHash: string;
    eip7702Auth?: { address: string; chainId: number; nonce: number };
    eip7702Delegated?: boolean;
  }

  export interface ITransaction {
    rootHash: string;
    userOps?: IUserOp[];
  }

  export interface ISmartAccountOptions {
    smartAccountAddress?: string;
    ownerAddress: string;
  }

  export interface IAsset {
    tokenType: string;
    amountInUSD: number;
  }

  export interface IAssetsResponse {
    assets: IAsset[];
    totalAmountInUSD: number;
  }

  export class UniversalAccount {
    constructor(config: {
      projectId: string;
      projectClientKey: string;
      projectAppUuid: string;
      smartAccountOptions?: {
        name: string;
        version: string;
        ownerAddress: string;
        useEIP7702?: boolean;
      };
      rpcUrl?: string;
    });
    getPrimaryAssets(): Promise<IAssetsResponse>;
    getSmartAccountOptions(): Promise<ISmartAccountOptions>;
    createTransferTransaction(payload: {
      token: { chainId: number; address: string };
      amount: string;
      receiver: string;
    }): Promise<ITransaction>;
    sendTransaction(
      transaction: ITransaction,
      signature: string,
      authorizations?: EIP7702Authorization[],
    ): Promise<{ transactionId: string }>;
  }
}
