import { getNetworkMode } from "../config/chains.js";

export interface ServiceHealth {
  id: string;
  name: string;
  status: "ok" | "degraded" | "unconfigured";
  detail: string;
}

function hasEnv(...names: string[]): boolean {
  return names.every((n) => Boolean(process.env[n]?.trim()));
}

export function getServicesHealth(): ServiceHealth[] {
  const network = getNetworkMode();

  const magic: ServiceHealth = {
    id: "magic",
    name: "Magic",
    status: hasEnv("MAGIC_SECRET_KEY", "MAGIC_PUBLISHABLE_KEY") ? "ok" : "unconfigured",
    detail: hasEnv("MAGIC_SECRET_KEY", "MAGIC_PUBLISHABLE_KEY")
      ? "Embedded wallet auth configured"
      : "Missing MAGIC_SECRET_KEY or MAGIC_PUBLISHABLE_KEY",
  };

  const particle: ServiceHealth = {
    id: "particle",
    name: "Particle UA",
    status: hasEnv("PARTICLE_PROJECT_ID", "PARTICLE_CLIENT_KEY", "PARTICLE_APP_ID")
      ? "ok"
      : "unconfigured",
    detail: hasEnv("PARTICLE_PROJECT_ID", "PARTICLE_CLIENT_KEY", "PARTICLE_APP_ID")
      ? "Universal Account cross-chain top-up ready"
      : "Missing PARTICLE_* credentials",
  };

  const cdp: ServiceHealth = {
    id: "cdp",
    name: "CDP x402",
    status: hasEnv("CDP_API_KEY_ID", "CDP_API_KEY_SECRET") ? "ok" : "unconfigured",
    detail: hasEnv("CDP_API_KEY_ID", "CDP_API_KEY_SECRET")
      ? `Facilitator configured (${network})`
      : "Missing CDP_API_KEY_ID or CDP_API_KEY_SECRET",
  };

  const gemini: ServiceHealth = {
    id: "gemini",
    name: "Gemini",
    status: hasEnv("GEMINI_API_KEY") ? "ok" : "unconfigured",
    detail: hasEnv("GEMINI_API_KEY")
      ? "Synthesis LLM configured"
      : "Missing GEMINI_API_KEY — deliverable synthesis unavailable",
  };

  const rpc: ServiceHealth = {
    id: "rpc",
    name: "RPC",
    status: network === "mainnet"
      ? hasEnv("BASE_RPC_URL", "ARBITRUM_MAINNET_RPC_URL") ? "ok" : "degraded"
      : hasEnv("BASE_RPC_URL", "ARBITRUM_RPC_URL") ? "ok" : "degraded",
    detail: network === "mainnet"
      ? "Base + Arbitrum mainnet RPC"
      : "Base + Arbitrum Sepolia RPC",
  };

  return [magic, particle, cdp, gemini, rpc];
}
