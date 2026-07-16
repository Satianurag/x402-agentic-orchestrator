import "dotenv/config";
import express from "express";
import {
  createPublicClient,
  createWalletClient,
  http,
  publicActions,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { x402Facilitator } from "@x402/core/facilitator";
import { registerExactEvmScheme } from "@x402/evm/exact/facilitator";
import { toFacilitatorEvmSigner, type FacilitatorEvmSigner } from "@x402/evm";
import { CAIP2 } from "../src/config/chains.js";

const PORT = Number(process.env.ARBITRUM_SEPOLIA_FACILITATOR_PORT ?? 4031);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

const privateKey = requireEnv("FACILITATOR_PRIVATE_KEY") as Hex;
const rpcUrl = requireEnv("ARBITRUM_RPC_URL");
const account = privateKeyToAccount(privateKey);

const publicClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(rpcUrl),
});

const walletClient = createWalletClient({
  account,
  chain: arbitrumSepolia,
  transport: http(rpcUrl),
}).extend(publicActions);

const baseSigner: Omit<FacilitatorEvmSigner, "getAddresses"> & { address: `0x${string}` } = {
  address: account.address,
  readContract: (args) => publicClient.readContract(args),
  verifyTypedData: (args) =>
    publicClient.verifyTypedData(
      args as Parameters<typeof publicClient.verifyTypedData>[0],
    ),
  writeContract: (args) => walletClient.writeContract(args),
  sendTransaction: (args) => walletClient.sendTransaction(args),
  waitForTransactionReceipt: (args) => publicClient.waitForTransactionReceipt(args),
  getCode: (args) => publicClient.getCode(args),
};

const evmSigner = toFacilitatorEvmSigner(baseSigner);

const facilitator = new x402Facilitator();
registerExactEvmScheme(facilitator, {
  signer: evmSigner,
  networks: CAIP2.arbitrumSepolia,
});

const app = express();
app.use(express.json());

app.get("/supported", (_req, res) => {
  try {
    res.json(facilitator.getSupported());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/verify", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: Parameters<typeof facilitator.verify>[0];
      paymentRequirements: Parameters<typeof facilitator.verify>[1];
    };
    const result = await facilitator.verify(paymentPayload, paymentRequirements);
    res.json(result);
  } catch (err) {
    res.status(400).json({
      isValid: false,
      invalidReason: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/settle", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: Parameters<typeof facilitator.settle>[0];
      paymentRequirements: Parameters<typeof facilitator.settle>[1];
    };
    const result = await facilitator.settle(paymentPayload, paymentRequirements);
    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      errorReason: err instanceof Error ? err.message : String(err),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Arbitrum Sepolia x402 facilitator listening on http://localhost:${PORT}`);
  console.log(`  Facilitator signer: ${account.address}`);
  console.log(`  Network: ${CAIP2.arbitrumSepolia}`);
});
