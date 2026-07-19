export class GoalRejectedError extends Error {
  constructor(
    message: string,
    readonly reason: string,
    readonly suggestion?: string,
  ) {
    super(message);
    this.name = "GoalRejectedError";
  }
}

const MIN_GOAL_CHARS = 12;

const COMMODITY_PATTERNS: Array<{ pattern: RegExp; reason: string; suggestion: string }> = [
  {
    pattern: /^(hi|hello|hey|test|thanks|thank you|ok|okay|yes|no|help)\.?$/i,
    reason: "Too generic — not an actionable agent goal.",
    suggestion: "Describe a concrete outcome, e.g. “Summarize BTC price trends with cited sources”.",
  },
  {
    pattern: /^what is x402\??$/i,
    reason: "Single-definition questions are better answered directly, not via a paid multi-tool run.",
    suggestion: "Try: “Research how x402 enables agent payments with primary sources and cost breakdown”.",
  },
];

/** Reject goals that cannot justify a paid multi-tool agent run. */
export function validateGoal(goal: string): void {
  const trimmed = goal.trim();
  if (!trimmed) {
    throw new GoalRejectedError("Goal is required", "empty", "Enter what you want the agent to accomplish.");
  }
  if (trimmed.length < MIN_GOAL_CHARS) {
    throw new GoalRejectedError(
      `Goal too short (${trimmed.length} chars, need ≥${MIN_GOAL_CHARS})`,
      "too_short",
      "Add specifics: topic, output format, sources, or constraints.",
    );
  }

  for (const { pattern, reason, suggestion } of COMMODITY_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new GoalRejectedError(`Goal rejected: ${reason}`, reason, suggestion);
    }
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 3 && !/\d/.test(trimmed)) {
    throw new GoalRejectedError(
      "Goal too vague for tool planning",
      "too_vague",
      "Use at least a few words describing the task and desired output.",
    );
  }
}
