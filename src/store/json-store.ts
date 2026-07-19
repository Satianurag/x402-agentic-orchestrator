import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SpendLine, RunCheckpoint } from "../agent/run.js";
import type { ReportDocument } from "../agent/report-document.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

export interface RunRecord {
  id: string;
  goal: string;
  createdAt: string;
  status: "completed" | "failed" | "stopped" | "partial";
  totalUsdc: number;
  deliverable: string;
  document?: ReportDocument;
  spend: SpendLine[];
  uaTopUpTxId?: string;
  budgetUsdc?: number;
  /** Set when status is partial — resume without re-running paid steps. */
  checkpoint?: RunCheckpoint;
}

export interface CustomAgent {
  id: string;
  name: string;
  description: string;
  goal: string;
  suggestedBudget: number;
  createdAt: string;
}

interface UserStore {
  runs: RunRecord[];
  customAgents: CustomAgent[];
}

interface StoreFile {
  users: Record<string, UserStore>;
}

function emptyUser(): UserStore {
  return { runs: [], customAgents: [] };
}

function readStore(): StoreFile {
  if (!fs.existsSync(STORE_PATH)) {
    return { users: {} };
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    return JSON.parse(raw) as StoreFile;
  } catch {
    return { users: {} };
  }
}

function writeStore(data: StoreFile): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

function userKey(address: string): string {
  return address.toLowerCase();
}

function getUser(address: string): UserStore {
  const store = readStore();
  const key = userKey(address);
  if (!store.users[key]) store.users[key] = emptyUser();
  return store.users[key];
}

function saveUser(address: string, user: UserStore): void {
  const store = readStore();
  store.users[userKey(address)] = user;
  writeStore(store);
}

export function listRuns(address: string, limit = 50): RunRecord[] {
  const user = getUser(address);
  return [...user.runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export function getRun(address: string, runId: string): RunRecord | undefined {
  return getUser(address).runs.find((r) => r.id === runId);
}

export function saveRun(address: string, record: RunRecord): RunRecord {
  const user = getUser(address);
  const idx = user.runs.findIndex((r) => r.id === record.id);
  if (idx >= 0) user.runs[idx] = record;
  else user.runs.unshift(record);
  if (user.runs.length > 200) user.runs = user.runs.slice(0, 200);
  saveUser(address, user);
  return record;
}

export function deleteRun(address: string, runId: string): boolean {
  const user = getUser(address);
  const before = user.runs.length;
  user.runs = user.runs.filter((r) => r.id !== runId);
  if (user.runs.length === before) return false;
  saveUser(address, user);
  return true;
}

export function listCustomAgents(address: string): CustomAgent[] {
  return getUser(address).customAgents;
}

export function saveCustomAgent(address: string, agent: CustomAgent): CustomAgent {
  const user = getUser(address);
  const idx = user.customAgents.findIndex((a) => a.id === agent.id);
  if (idx >= 0) user.customAgents[idx] = agent;
  else user.customAgents.push(agent);
  saveUser(address, user);
  return agent;
}

export function deleteCustomAgent(address: string, agentId: string): boolean {
  const user = getUser(address);
  const before = user.customAgents.length;
  user.customAgents = user.customAgents.filter((a) => a.id !== agentId);
  if (user.customAgents.length === before) return false;
  saveUser(address, user);
  return true;
}

export function getAnalytics(address: string): {
  totalRuns: number;
  completedRuns: number;
  cumulativeSpend: number;
  byService: Record<string, number>;
  recentOverBudget: number;
} {
  const runs = getUser(address).runs;
  const byService: Record<string, number> = {};
  let cumulativeSpend = 0;
  let completedRuns = 0;
  let recentOverBudget = 0;

  for (const run of runs) {
    if (run.status === "completed") completedRuns++;
    cumulativeSpend += run.totalUsdc;
    for (const line of run.spend) {
      byService[line.service] = (byService[line.service] ?? 0) + line.usdc;
    }
    if (run.budgetUsdc && run.totalUsdc > run.budgetUsdc) recentOverBudget++;
  }

  return {
    totalRuns: runs.length,
    completedRuns,
    cumulativeSpend,
    byService,
    recentOverBudget,
  };
}

export function getLedger(address: string): Array<SpendLine & { runId: string; goal: string; createdAt: string }> {
  const runs = getUser(address).runs;
  const lines: Array<SpendLine & { runId: string; goal: string; createdAt: string }> = [];
  for (const run of runs) {
    for (const line of run.spend) {
      lines.push({ ...line, runId: run.id, goal: run.goal, createdAt: run.createdAt });
    }
  }
  return lines.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
