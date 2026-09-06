import { createHash } from "node:crypto";

export const INTERVIEW_STATE = "solar-interview-state-v2";
export const INTERVIEW_REVIEW_STATE = "solar-interview-review-state-v2";
export const INTERVIEW_CLOSURE_STATE = "solar-interview-closure-v2";

const LEGACY_INTERVIEW_STATE = "solar-interview-state-v1";
const LEGACY_INTERVIEW_REVIEW_STATE = "solar-interview-review-state-v1";
const LEGACY_INTERVIEW_CLOSURE_STATE = "solar-interview-closure-v1";

export type InterviewDimension = {
  score: number;
  evidence: string[];
  gap: string;
};

export type DeferredChoice = {
  topic: string;
  evidence: string[];
  reason: string;
};

export type ReadinessGap = {
  id: string;
  issue: string;
  evidenceIds: string[];
  researchable: boolean;
};

export type ReadinessContradiction = {
  id: string;
  issue: string;
  evidenceIds: string[];
};

export type InterviewReadiness = {
  status: "not_ready" | "ready";
  goalSentence?: string;
  materialGaps: ReadinessGap[];
  contradictions: ReadinessContradiction[];
};

export type MaterialTopic = {
  topicId: string;
  kind: "decision" | "correction" | "constraint" | "success";
  normalizedValue: string;
  sourceContentHashes: string[];
};

export type MaterialGap = {
  gapId: string;
  status: "open" | "narrowed" | "resolved";
  normalizedSummary: string;
};

export type MaterialClaim = {
  gapId: string;
  normalizedClaim: string;
  sourceContentHashes: string[];
};

export type MaterialState = {
  topics: MaterialTopic[];
  gaps: MaterialGap[];
  claims: MaterialClaim[];
};

export type InterviewStrategy = "question" | "reframe" | "research" | "ready" | "blocked";

export type InterviewRoundV2 = {
  goal: InterviewDimension;
  constraints: InterviewDimension;
  success: InterviewDimension;
  context?: InterviewDimension;
  blockers: string[];
  deferred?: DeferredChoice[];
  intent: string;
  changeReason: string;
  question?: string | null;
  strategy: InterviewStrategy;
  currentGapId?: string;
  materialState: MaterialState;
  readiness: InterviewReadiness;
};

export type InterviewAnswer = {
  id: string;
  text: string;
  question?: string;
  [key: string]: unknown;
};

export type InterviewProgressReason =
  | { kind: "topic"; topicId: string; change: "new" | "changed" }
  | { kind: "gap"; gapId: string; change: "narrowed" | "resolved" }
  | { kind: "claim"; gapId: string; claim: string };

export type InterviewProgress = {
  comparable: boolean;
  progressed: boolean;
  reasons: InterviewProgressReason[];
  ignored: string[];
};

export type InterviewRecoveryChoice = {
  id: "answer_or_clarify" | "allow_public_research" | "finish_early";
  label: string;
};

export type InterviewRecovery = {
  status: "clear" | "strategy_required" | "recovering" | "paused";
  consecutiveNoProgress: number;
  gap?: { gapId: string; summary: string };
  requiredStrategies?: Array<"reframe" | "research">;
  selectedStrategy?: "reframe" | "research";
  blocker?: string;
  choices?: InterviewRecoveryChoice[];
  retained: {
    answerIds: string[];
    researchHeads: string[];
    artifactRefs: string[];
  };
  attempts: Array<{
    strategy: InterviewStrategy;
    gapId?: string;
    answerHead?: string;
    researchHead: string | null;
    progressed: boolean;
    reasons: InterviewProgressReason[];
  }>;
};

export type InterviewStateV2 = {
  version: 2;
  anchorId: string;
  answerHead: string;
  researchHead: string | null;
  round: number;
  status: "interviewing" | "awaiting_choice" | "awaiting_research" | "awaiting_goal_confirmation" | "paused";
  raw: number;
  ambiguity: number;
  delta: number | null;
  scorePolicy: "advisory";
  proposal: InterviewRoundV2;
  materialState: MaterialState;
  strategy: InterviewStrategy;
  currentGapId?: string;
  progress: InterviewProgress;
  recovery: InterviewRecovery;
  goalRevision?: string;
  goalToken?: string;
  assessmentKind?: "review" | "research_return";
  questionFormatting?: { question: string; original: string; deferred: string[] };
  history: Array<{
    answerHead: string;
    researchHead: string | null;
    ambiguity: number;
    reason: string;
    materialProgress: boolean;
    strategy: InterviewStrategy;
    action?: "review" | "research_return";
  }>;
};

export type InterviewClosureV2 = {
  version: 2;
  anchorId: string;
  answerHead: string;
  researchHead: string | null;
  status: "user_finished";
  mode: "normal" | "early";
  completionAuthority: "user_confirmation" | "user_explicit_finish";
  request: string;
  answers: InterviewAnswer[];
  assessment: InterviewStateV2 | unknown | null;
  assessmentCurrent: boolean;
  unresolved: ReadinessGap[];
  blockers: string[];
  contradictions: ReadinessContradiction[];
  deferred: DeferredChoice[];
  artifactRefs: string[];
  unconfirmedGoal?: { sentence: string; revision?: string };
  confirmedGoal?: { sentence: string; revision: string; token: string };
  planningOnly: boolean;
  executionAuthority: "none";
};

export type AssessInterviewOptions = {
  reassess?: boolean;
  researchHead?: string | null;
  researchContentHashes?: string[];
  artifactRefs?: string[];
};

export type ConfirmInterviewOptions = {
  researchHead: string | null;
  reviewPending?: boolean;
  request?: string;
  planOnly?: boolean;
};

export type FinishInterviewOptions = {
  researchHead?: string | null;
  planOnly?: boolean;
  artifactRefs?: string[];
};

export type InterviewRecoveryContext = {
  currentGap?: MaterialGap;
  answerHead?: string;
  answerIds?: string[];
  researchHead?: string | null;
  researchHeads?: string[];
  artifactRefs?: string[];
  nextStrategy?: InterviewStrategy;
};

export type RecoveredInterview = {
  active: boolean;
  anchorId?: string;
  state?: InterviewStateV2;
  answers: InterviewAnswer[];
  reviewing: boolean;
  closure?: InterviewClosureV2 | unknown;
  researchHead: string | null;
  goalCurrent: boolean;
  invalidatedGoal?: { revision: string; reason: string };
  unsupportedState?: unknown;
  pause?: {
    reason: string;
    retainedAnswerIds: string[];
    choices: InterviewRecoveryChoice[];
  };
};

const FINISH_CHOICES: InterviewRecoveryChoice[] = [
  { id: "answer_or_clarify", label: "Answer or clarify the named material gap." },
  { id: "allow_public_research", label: "Permit targeted public research for the named gap." },
  { id: "finish_early", label: "Explicitly finish early with /solar-interview finish." },
];

function requiredText(value: unknown, label: string, maximum = 2_000): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Supply ${label}.`);
  const text = value.trim();
  if (text.length > maximum) throw new Error(`${label} must be at most ${maximum} characters.`);
  return text;
}

function recordId(value: unknown, label: string): string {
  const id = requiredText(value, label, 200);
  if (/\r|\n/u.test(id)) throw new Error(`${label} must be one line.`);
  return id;
}

function currentResearchHead(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return recordId(value, "the current research revision");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function mergeRetained(previous: InterviewRecovery | undefined, context: InterviewRecoveryContext) {
  return {
    answerIds: unique([...(previous?.retained.answerIds ?? []), ...(context.answerIds ?? [])]),
    researchHeads: unique([...(previous?.retained.researchHeads ?? []), ...(context.researchHeads ?? []), ...(context.researchHead ? [context.researchHead] : [])]),
    artifactRefs: unique([...(previous?.retained.artifactRefs ?? []), ...(context.artifactRefs ?? [])]),
  };
}

function validateAnswers(answers: InterviewAnswer[]): InterviewAnswer[] {
  if (!Array.isArray(answers) || !answers.length) throw new Error("No saved user answer is available for this assessment.");
  const ids = new Set<string>();
  return answers.map(answer => {
    if (!answer || typeof answer !== "object") throw new Error("Saved interview answers are invalid.");
    const id = recordId(answer.id, "each saved-answer ID");
    if (ids.has(id)) throw new Error(`Duplicate saved-answer ID: ${id}.`);
    ids.add(id);
    if (typeof answer.text !== "string" || !answer.text.trim()) throw new Error(`Saved answer ${id} has no text.`);
    const preserved = structuredClone(answer);
    return { ...preserved, id, text: answer.text, ...(typeof answer.question === "string" ? { question: answer.question } : {}) };
  });
}

function goalSentence(value: unknown): string {
  const sentence = requiredText(value, "one goal sentence", 500);
  if (/\r|\n/u.test(sentence)) throw new Error("The confirmed goal must be exactly one sentence on one line.");
  const parts = sentence.split(/(?<=[.!?。！？])\s+(?=[\p{L}\p{N}])/u).filter(Boolean);
  if (parts.length !== 1) throw new Error("The confirmed goal must be exactly one sentence.");
  return sentence;
}

function hashList(value: unknown, label: string, allowed?: Set<string>): string[] {
  if (!Array.isArray(value) || !value.length) throw new Error(`${label} needs at least one exact source-content hash.`);
  const hashes = value.map(item => {
    if (typeof item !== "string" || !/^[a-f0-9]{64}$/iu.test(item)) throw new Error(`${label} contains an invalid SHA-256 content hash.`);
    const hash = item.toLowerCase();
    if (allowed && !allowed.has(hash)) throw new Error(`${label} cites source bytes that are not in the saved answers or supplied research evidence: ${hash}.`);
    return hash;
  });
  return unique(hashes).sort();
}

function listRecords(value: unknown, label: string, maximum = 200): any[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (value.length > maximum) throw new Error(`${label} may contain at most ${maximum} records.`);
  return value;
}

function activeStatus(status: unknown): boolean {
  return ["interviewing", "awaiting_choice", "awaiting_research", "awaiting_goal_confirmation"].includes(String(status));
}

function supportedState(value: any): value is InterviewStateV2 {
  return value?.version === 2
    && typeof value.anchorId === "string"
    && typeof value.answerHead === "string"
    && ["interviewing", "awaiting_choice", "awaiting_research", "awaiting_goal_confirmation", "paused"].includes(value.status)
    && ["question", "reframe", "research", "ready", "blocked"].includes(value.strategy)
    && ["not_ready", "ready"].includes(value.proposal?.readiness?.status)
    && Array.isArray(value.proposal.readiness.materialGaps)
    && Array.isArray(value.proposal.readiness.contradictions)
    && Array.isArray(value.materialState?.topics)
    && Array.isArray(value.materialState?.gaps)
    && Array.isArray(value.materialState?.claims)
    && ["clear", "strategy_required", "recovering", "paused"].includes(value.recovery?.status)
    && Array.isArray(value.recovery?.attempts)
    && Array.isArray(value.recovery?.retained?.answerIds)
    && Array.isArray(value.recovery?.retained?.researchHeads)
    && Array.isArray(value.recovery?.retained?.artifactRefs);
}

function inferResearchHead(entries: any[]): string | null {
  let head: string | null = null;
  for (const entry of entries) {
    if (entry?.type !== "custom" || !Object.prototype.hasOwnProperty.call(entry.data ?? {}, "researchArtifactRevision")) continue;
    try { head = currentResearchHead(entry.data.researchArtifactRevision); }
    catch { head = null; }
  }
  return head;
}

export function messageText(message: any): string {
  const content = message?.content;
  return typeof content === "string" ? content : (content ?? []).filter((block: any) => block.type === "text").map((block: any) => block.text).join("\n");
}

export function stripSkill(text: string): string {
  return text.replace(/<skill\b[^>]*>[\s\S]*?<\/skill>/g, "").trim();
}

export function invokedSkill(text: string): "research" | "interview" | "plan" | "execute" | undefined {
  return /^(?:\/skill:|<skill\s+name=["'])(?:lite|solar)-(research|interview|plan|execute)\b/.exec(text.trimStart())?.[1] as "research" | "interview" | "plan" | "execute" | undefined;
}

export function interviewContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function normalizeMaterialValue(value: string): string {
  return requiredText(value, "a normalized material value").normalize("NFKC")
    .replace(/[‘’]/gu, "'")
    .replace(/\s+/gu, " ")
    .replace(/[.!?。！？]+$/u, "")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function validateMaterialState(materialState: MaterialState, sourceContentHashes?: Iterable<string>): MaterialState {
  if (!materialState || typeof materialState !== "object") throw new Error("Supply the material decision, gap, and evidence state.");
  const allowed = sourceContentHashes === undefined ? undefined : new Set([...sourceContentHashes].map(hash => String(hash).toLowerCase()));
  const topicIds = new Set<string>();
  const topics = listRecords(materialState.topics, "Material topics").map(topic => {
    if (!topic || typeof topic !== "object") throw new Error("Each material topic must be an object.");
    const topicId = recordId(topic.topicId, "each material topic ID");
    if (topicIds.has(topicId)) throw new Error(`Duplicate material topic ID: ${topicId}.`);
    topicIds.add(topicId);
    if (!["decision", "correction", "constraint", "success"].includes(topic.kind)) throw new Error(`Invalid material topic kind for ${topicId}.`);
    return {
      topicId,
      kind: topic.kind,
      normalizedValue: normalizeMaterialValue(topic.normalizedValue),
      sourceContentHashes: hashList(topic.sourceContentHashes, `Material topic ${topicId}`, allowed),
    } as MaterialTopic;
  });
  const gapIds = new Set<string>();
  const gaps = listRecords(materialState.gaps, "Material gaps").map(gap => {
    if (!gap || typeof gap !== "object") throw new Error("Each material gap must be an object.");
    const gapId = recordId(gap.gapId, "each material gap ID");
    if (gapIds.has(gapId)) throw new Error(`Duplicate material gap ID: ${gapId}.`);
    gapIds.add(gapId);
    if (!["open", "narrowed", "resolved"].includes(gap.status)) throw new Error(`Invalid material gap status for ${gapId}.`);
    return { gapId, status: gap.status, normalizedSummary: normalizeMaterialValue(gap.normalizedSummary) } as MaterialGap;
  });
  const claimKeys = new Set<string>();
  const claims = listRecords(materialState.claims, "Material claims").map(claim => {
    if (!claim || typeof claim !== "object") throw new Error("Each material claim must be an object.");
    const gapId = recordId(claim.gapId, "each material claim gap ID");
    if (!gapIds.has(gapId)) throw new Error(`Material claim references unknown gap ${gapId}.`);
    const normalizedClaim = normalizeMaterialValue(claim.normalizedClaim);
    const key = `${gapId}\u0000${normalizedClaim}`;
    if (claimKeys.has(key)) throw new Error(`Duplicate material claim for gap ${gapId}.`);
    claimKeys.add(key);
    return { gapId, normalizedClaim, sourceContentHashes: hashList(claim.sourceContentHashes, `Material claim for ${gapId}`, allowed) } as MaterialClaim;
  });
  return { topics, gaps, claims };
}

export function validateReadiness(
  readiness: InterviewReadiness,
  context: { answers: InterviewAnswer[]; materialState: MaterialState; blockers?: string[] },
): InterviewReadiness {
  if (!readiness || typeof readiness !== "object" || !["not_ready", "ready"].includes(readiness.status)) throw new Error("Readiness status must be not_ready or ready.");
  const answers = validateAnswers(context.answers);
  const knownAnswers = new Set(answers.map(answer => answer.id));
  const evidenceIds = (value: unknown, label: string) => {
    if (!Array.isArray(value) || !value.length || value.some(id => typeof id !== "string" || !knownAnswers.has(id))) throw new Error(`${label} needs exact saved-answer evidence IDs.`);
    return unique(value as string[]);
  };
  const gapsById = new Map(context.materialState.gaps.map(gap => [gap.gapId, gap]));
  const readinessGapIds = new Set<string>();
  const materialGaps = listRecords(readiness.materialGaps, "Readiness material gaps").map(gap => {
    if (!gap || typeof gap !== "object") throw new Error("Each readiness material gap must be an object.");
    const id = recordId(gap.id, "each readiness material gap ID");
    if (readinessGapIds.has(id)) throw new Error(`Duplicate readiness material gap ID: ${id}.`);
    readinessGapIds.add(id);
    const ledgerGap = gapsById.get(id);
    if (!ledgerGap || ledgerGap.status === "resolved") throw new Error(`Readiness gap ${id} must reference a current open or narrowed material gap.`);
    if (typeof gap.researchable !== "boolean") throw new Error(`Readiness gap ${id} must state whether it is researchable.`);
    return { id, issue: requiredText(gap.issue, `the issue for readiness gap ${id}`), evidenceIds: evidenceIds(gap.evidenceIds, `Readiness gap ${id}`), researchable: gap.researchable };
  });
  for (const gap of context.materialState.gaps) {
    if (gap.status !== "resolved" && !readinessGapIds.has(gap.gapId)) throw new Error(`Readiness omits current material gap ${gap.gapId}.`);
  }
  const contradictionIds = new Set<string>();
  const contradictions = listRecords(readiness.contradictions, "Readiness contradictions").map(contradiction => {
    if (!contradiction || typeof contradiction !== "object") throw new Error("Each readiness contradiction must be an object.");
    const id = recordId(contradiction.id, "each readiness contradiction ID");
    if (contradictionIds.has(id)) throw new Error(`Duplicate readiness contradiction ID: ${id}.`);
    contradictionIds.add(id);
    return { id, issue: requiredText(contradiction.issue, `the issue for contradiction ${id}`), evidenceIds: evidenceIds(contradiction.evidenceIds, `Contradiction ${id}`) };
  });
  const blockers = context.blockers ?? [];
  let sentence: string | undefined;
  if (readiness.goalSentence !== undefined) sentence = goalSentence(readiness.goalSentence);
  if (readiness.status === "ready") {
    if (materialGaps.length || contradictions.length || blockers.length) throw new Error("Ready interviews cannot contain material gaps, contradictions, or blockers.");
    if (!context.materialState.topics.length) throw new Error("Ready interviews need at least one evidence-linked material decision, constraint, correction, or success outcome.");
    if (!sentence) throw new Error("Ready interviews need exactly one goal sentence.");
  } else if (!materialGaps.length && !contradictions.length && !blockers.length) {
    throw new Error("Mark the interview ready with one goal sentence, or identify a material gap, contradiction, or blocker.");
  }
  return { status: readiness.status, ...(sentence ? { goalSentence: sentence } : {}), materialGaps, contradictions };
}

function classifyInterviewProgressForGapTransition(
  before: MaterialState | undefined,
  after: MaterialState,
  currentGap?: string,
  nextGap: string | null | undefined = currentGap,
): InterviewProgress {
  const current = validateMaterialState(after);
  if (!before) return { comparable: false, progressed: false, reasons: [], ignored: ["Initial material state establishes a baseline; it does not claim progress."] };
  const previous = validateMaterialState(before);
  const reasons: InterviewProgressReason[] = [];
  const ignored: string[] = [];
  const previousTopics = new Map(previous.topics.map(topic => [topic.topicId, topic]));
  const previousSourceBytes = new Set([
    ...previous.topics.flatMap(topic => topic.sourceContentHashes),
    ...previous.claims.flatMap(claim => claim.sourceContentHashes),
  ]);
  const previousRelevantGap = currentGap ? previous.gaps.find(gap => gap.gapId === currentGap) : undefined;
  const nextRelevantGap = nextGap ? current.gaps.find(gap => gap.gapId === nextGap) : undefined;
  const retainedRelevantGap = currentGap ? current.gaps.find(gap => gap.gapId === currentGap) : undefined;
  const distinctRelevantGap = Boolean(
    currentGap
    && nextGap
    && currentGap !== nextGap
    && previousRelevantGap
    && nextRelevantGap
    && retainedRelevantGap?.normalizedSummary === previousRelevantGap.normalizedSummary
    && nextRelevantGap.normalizedSummary !== previousRelevantGap.normalizedSummary
  );
  for (const topic of current.topics) {
    const old = previousTopics.get(topic.topicId);
    if (!old) {
      const sameMaterial = previous.topics.find(candidate =>
        candidate.kind === topic.kind
        && candidate.normalizedValue === topic.normalizedValue
      );
      if (sameMaterial && !distinctRelevantGap) {
        ignored.push(`Topic ${topic.topicId} only replaces or repeats ${sameMaterial.topicId} with the same material value without a distinct relevant gap; a fresh ID or provenance is not progress.`);
      } else if (!distinctRelevantGap && !topic.sourceContentHashes.some(hash => !previousSourceBytes.has(hash))) {
        ignored.push(`Topic ${topic.topicId} assigns a new identity or interpretation to source bytes already considered.`);
      } else {
        reasons.push({ kind: "topic", topicId: topic.topicId, change: "new" });
      }
    }
    else if (old.kind !== topic.kind || old.normalizedValue !== topic.normalizedValue) {
      if (topic.sourceContentHashes.some(hash => !old.sourceContentHashes.includes(hash))) reasons.push({ kind: "topic", topicId: topic.topicId, change: "changed" });
      else ignored.push(`Topic ${topic.topicId} changed interpretation without different source bytes.`);
    }
    else if (old.sourceContentHashes.join("\u0000") !== topic.sourceContentHashes.join("\u0000")) ignored.push(`Topic ${topic.topicId} only changed provenance; its material value is unchanged.`);
  }
  const previousGaps = new Map(previous.gaps.map(gap => [gap.gapId, gap]));
  const rank = { open: 0, narrowed: 1, resolved: 2 } as const;
  for (const gap of current.gaps) {
    const old = previousGaps.get(gap.gapId);
    if (old && rank[gap.status] > rank[old.status]) reasons.push({ kind: "gap", gapId: gap.gapId, change: gap.status === "resolved" ? "resolved" : "narrowed" });
    else if (old && (old.status !== gap.status || old.normalizedSummary !== gap.normalizedSummary)) ignored.push(`Gap ${gap.gapId} changed wording or regressed without narrowing or resolution.`);
  }
  const previousClaims = new Set(previous.claims.map(claim => `${claim.gapId}\u0000${claim.normalizedClaim}`));
  for (const claim of current.claims) {
    if (currentGap && claim.gapId !== currentGap) continue;
    const key = `${claim.gapId}\u0000${claim.normalizedClaim}`;
    if (previousClaims.has(key)) {
      if (claim.sourceContentHashes.some(hash => !previousSourceBytes.has(hash))) ignored.push(`Claim for ${claim.gapId} repeats the same normalized information with different provenance.`);
      continue;
    }
    if (!claim.sourceContentHashes.some(hash => !previousSourceBytes.has(hash))) {
      ignored.push(`Claim for ${claim.gapId} reuses source bytes already considered.`);
      continue;
    }
    reasons.push({ kind: "claim", gapId: claim.gapId, claim: claim.normalizedClaim });
  }
  if (!reasons.length && !ignored.length) ignored.push("Only record identities, scores, rounds, or unchanged material state differ.");
  return { comparable: true, progressed: reasons.length > 0, reasons, ignored };
}

export function classifyInterviewProgress(before: MaterialState | undefined, after: MaterialState, currentGap?: string): InterviewProgress {
  return classifyInterviewProgressForGapTransition(before, after, currentGap, currentGap);
}

export function advanceInterviewRecovery(
  previous: InterviewRecovery | undefined,
  classification: InterviewProgress,
  attemptedStrategy: InterviewStrategy,
  context: InterviewRecoveryContext = {},
): InterviewRecovery {
  const retained = mergeRetained(previous, context);
  const attempts = [...(previous?.attempts ?? [])];
  if (!classification.comparable) return { status: "clear", consecutiveNoProgress: 0, retained, attempts };
  attempts.push({
    strategy: attemptedStrategy,
    ...(context.currentGap ? { gapId: context.currentGap.gapId } : {}),
    ...(context.answerHead ? { answerHead: context.answerHead } : {}),
    researchHead: context.researchHead ?? null,
    progressed: classification.progressed,
    reasons: structuredClone(classification.reasons),
  });
  if (classification.progressed) return { status: "clear", consecutiveNoProgress: 0, retained, attempts };
  const gap = context.currentGap ? { gapId: context.currentGap.gapId, summary: context.currentGap.normalizedSummary } : previous?.gap;
  if (previous?.status === "recovering" && previous.consecutiveNoProgress >= 1) {
    return {
      status: "paused",
      consecutiveNoProgress: previous.consecutiveNoProgress + 1,
      ...(gap ? { gap } : {}),
      blocker: `No material information changed after ${previous.selectedStrategy ?? attemptedStrategy}; the named gap remains open.`,
      choices: structuredClone(FINISH_CHOICES),
      retained,
      attempts,
    };
  }
  const requiredStrategies = (["reframe", "research"] as const).filter(strategy => strategy !== attemptedStrategy);
  const next = context.nextStrategy;
  if (next === "reframe" || next === "research") {
    if (next !== attemptedStrategy) {
      return {
        status: "recovering",
        consecutiveNoProgress: 1,
        ...(gap ? { gap } : {}),
        selectedStrategy: next,
        retained,
        attempts,
      };
    }
  }
  return {
    status: "strategy_required",
    consecutiveNoProgress: 1,
    ...(gap ? { gap } : {}),
    requiredStrategies: [...requiredStrategies],
    blocker: "The latest answer added no material information. Reframe the named gap or use targeted research instead of repeating the same question strategy.",
    choices: structuredClone(FINISH_CHOICES),
    retained,
    attempts,
  };
}

export function interviewGoalRevision(input: {
  anchorId: string;
  answerHead: string;
  researchHead: string | null;
  goalSentence: string;
  readiness: InterviewReadiness;
}): string {
  return createHash("sha256").update(JSON.stringify({
    anchorId: recordId(input.anchorId, "the interview anchor"),
    answerHead: recordId(input.answerHead, "the current answer head"),
    researchHead: currentResearchHead(input.researchHead),
    goalSentence: goalSentence(input.goalSentence),
    readiness: input.readiness,
  })).digest("hex");
}

export function goalToken(state: InterviewStateV2): string {
  if (!supportedState(state) || state.status !== "awaiting_goal_confirmation" || !state.goalRevision || !state.goalToken) throw new Error("No current ready goal is available to confirm.");
  const sentence = state.proposal.readiness.goalSentence;
  if (!sentence) throw new Error("No current ready goal is available to confirm.");
  const revision = interviewGoalRevision({
    anchorId: state.anchorId,
    answerHead: state.answerHead,
    researchHead: state.researchHead,
    goalSentence: sentence,
    readiness: state.proposal.readiness,
  });
  if (revision !== state.goalRevision) throw new Error("The saved goal revision is stale or malformed; reassess current evidence.");
  if (state.goalToken !== revision.slice(0, 12)) throw new Error("The saved goal token is stale or malformed; reassess current evidence.");
  return state.goalToken;
}

export function isInterviewGoalCurrent(
  state: InterviewStateV2 | undefined,
  answers: InterviewAnswer[],
  anchorId: string | undefined,
  researchHead: string | null,
  reviewPending = false,
): boolean {
  if (!state || !supportedState(state) || reviewPending || state.status !== "awaiting_goal_confirmation") return false;
  const latest = answers.at(-1)?.id;
  if (!latest || state.anchorId !== anchorId || state.answerHead !== latest || state.researchHead !== currentResearchHead(researchHead)) return false;
  try { return goalToken(state) === state.goalRevision?.slice(0, 12); }
  catch { return false; }
}

export function recoverInterview(entries: any[], options: { researchHead?: string | null } = {}): RecoveredInterview {
  let anchor: string | undefined;
  let state: InterviewStateV2 | undefined;
  let active = false;
  let pendingReview: any;
  let closure: InterviewClosureV2 | unknown;
  let precedingQuestion = "";
  let unsupportedState: unknown;
  let unsupportedActive = false;
  const answers: InterviewAnswer[] = [];
  for (const entry of entries) {
    if (entry.type === "message" && entry.message?.role === "user") {
      const raw = messageText(entry.message);
      const stage = invokedSkill(raw);
      let continuation = false;
      if (stage) {
        active = stage === "interview";
        if (active) closure = undefined;
        const resuming = /\b(?:resume|continue)\b|이어|계속/i.test(stripSkill(raw));
        continuation = Boolean(active && anchor && resuming);
        if (active && (!anchor || !resuming)) {
          anchor = entry.id;
          state = undefined;
          pendingReview = undefined;
          unsupportedState = undefined;
          unsupportedActive = false;
          answers.length = 0;
          precedingQuestion = "";
        }
      }
      if (anchor && active && !continuation) answers.push({ id: entry.id, text: stripSkill(raw), question: precedingQuestion });
    }
    if (entry.type === "message" && entry.message?.role === "assistant") {
      const text = messageText(entry.message);
      if (text.trim()) precedingQuestion = text;
    }
    if (entry.type === "custom" && [INTERVIEW_STATE, LEGACY_INTERVIEW_STATE].includes(entry.customType)) {
      const candidate = entry.data;
      if (entry.customType === INTERVIEW_STATE && supportedState(candidate)) {
        state = candidate;
        unsupportedState = undefined;
        unsupportedActive = false;
        anchor = state.anchorId;
        active = state.status !== "paused";
        if (["interviewing", "awaiting_choice", "awaiting_research", "awaiting_goal_confirmation"].includes(state.status)) closure = undefined;
        precedingQuestion = state.status === "awaiting_goal_confirmation" ? state.proposal.intent : state.proposal.question ?? "";
        const reviewHead = pendingReview?.answerHead ?? pendingReview?.answerId;
        if (state.assessmentKind === "review" && state.anchorId === pendingReview?.anchorId && state.answerHead === reviewHead) pendingReview = undefined;
      } else {
        anchor = typeof candidate?.anchorId === "string" ? candidate.anchorId : anchor;
        state = undefined;
        unsupportedState = structuredClone(candidate);
        unsupportedActive = activeStatus(candidate?.status);
        active = unsupportedActive;
        precedingQuestion = candidate?.proposal?.question ?? precedingQuestion;
      }
    }
    if (entry.type === "custom" && [INTERVIEW_REVIEW_STATE, LEGACY_INTERVIEW_REVIEW_STATE].includes(entry.customType) && entry.data?.status === "pending") pendingReview = entry.data;
    if (entry.type === "custom" && [INTERVIEW_CLOSURE_STATE, LEGACY_INTERVIEW_CLOSURE_STATE].includes(entry.customType) && entry.data?.anchorId === anchor) {
      closure = entry.data;
      active = false;
      unsupportedActive = false;
      pendingReview = undefined;
    }
  }
  const savedAnswers = answers.filter(answer => answer.text);
  const researchHead = Object.prototype.hasOwnProperty.call(options, "researchHead") ? currentResearchHead(options.researchHead) : inferResearchHead(entries);
  const reviewHead = pendingReview?.answerHead ?? pendingReview?.answerId;
  const reviewing = Boolean(pendingReview && pendingReview.anchorId === anchor && reviewHead === savedAnswers.at(-1)?.id && state?.answerHead === reviewHead);
  const goalCurrent = isInterviewGoalCurrent(state, savedAnswers, anchor, researchHead, reviewing);
  const invalidatedGoal = state?.goalRevision && !goalCurrent ? {
    revision: state.goalRevision,
    reason: state.answerHead !== savedAnswers.at(-1)?.id
      ? "A newer saved answer invalidated the proposed goal."
      : state.researchHead !== researchHead
        ? "New or changed research invalidated the proposed goal."
        : "The readiness review or goal revision is no longer current.",
  } : undefined;
  const pause = unsupportedActive ? {
    reason: "This active interview state shape is unsupported. Saved history is preserved, but readiness and closure cannot be migrated or inferred. Start a fresh assessment or explicitly finish early.",
    retainedAnswerIds: savedAnswers.map(answer => answer.id),
    choices: structuredClone(FINISH_CHOICES),
  } : undefined;
  return {
    active: active && !unsupportedActive,
    anchorId: anchor,
    state,
    answers: savedAnswers,
    reviewing,
    closure,
    researchHead,
    goalCurrent,
    ...(invalidatedGoal ? { invalidatedGoal } : {}),
    ...(unsupportedState !== undefined ? { unsupportedState } : {}),
    ...(pause ? { pause } : {}),
  };
}

export function assessInterview(
  proposalInput: InterviewRoundV2,
  previous: InterviewStateV2 | undefined,
  answerInput: InterviewAnswer[],
  anchorId: string,
  { reassess = false, researchHead: researchRevision = null, researchContentHashes = [], artifactRefs = [] }: AssessInterviewOptions = {},
): InterviewStateV2 {
  const proposal = structuredClone(proposalInput);
  const answers = validateAnswers(answerInput);
  anchorId = recordId(anchorId, "the interview anchor");
  const researchHead = currentResearchHead(researchRevision);
  if (previous && !supportedState(previous)) throw new Error("The active interview state version is unsupported. Preserve its history and pause instead of migrating readiness.");
  if (previous && previous.anchorId !== anchorId) throw new Error("This assessment belongs to a different interview.");
  if (previous?.proposal && Boolean(previous.proposal.context) !== Boolean(proposal.context)) throw new Error("Keep the same assessment dimensions across rounds.");
  const dimensions: Array<["goal" | "constraints" | "success" | "context", number]> = proposal.context ? [["goal", 35], ["constraints", 25], ["success", 25], ["context", 15]] : [["goal", 40], ["constraints", 30], ["success", 30]];
  const known = new Set(answers.map(answer => answer.id));
  let clarity = 0;
  for (const [name, weight] of dimensions) {
    const dimension = proposal[name];
    if (!dimension || !Number.isFinite(dimension.score) || dimension.score < 0 || dimension.score > 1) throw new Error(`Invalid ${name} clarity: use 0..1.`);
    if (!Array.isArray(dimension.evidence)) throw new Error(`${name} evidence must be an array of answer IDs.`);
    dimension.evidence = dimension.evidence.map(reference => {
      if (known.has(reference)) return reference;
      const parts = String(reference).split(/[^a-zA-Z0-9-]+/);
      const matches = [...known].filter(id => parts.includes(id));
      if (matches.length === 1) return matches[0];
      throw new Error(`${name} evidence must use exact answer IDs only, without explanations. Available IDs: ${[...known].join(", ")}`);
    });
    if (dimension.score > 0 && !dimension.evidence.length) throw new Error(`${name} needs supporting answer IDs.`);
    if (typeof dimension.gap !== "string" || (dimension.score < 1 && !dimension.gap.trim())) throw new Error(`${name} needs its unresolved gap.`);
    clarity += dimension.score * weight;
  }
  if (!Array.isArray(proposal.blockers) || proposal.blockers.some(item => typeof item !== "string" || !item.trim())) throw new Error("List material blockers explicitly, or use an empty list.");
  proposal.blockers = proposal.blockers.map(item => item.trim());
  if (proposal.deferred !== undefined) {
    if (!Array.isArray(proposal.deferred)) throw new Error("Deferred choices must be an array.");
    for (const choice of proposal.deferred) {
      if (!choice || typeof choice.topic !== "string" || !choice.topic.trim() || typeof choice.reason !== "string" || !choice.reason.trim()) throw new Error("Each deferred choice needs a topic and reason.");
      if (!Array.isArray(choice.evidence) || !choice.evidence.length || choice.evidence.some(reference => !known.has(reference))) throw new Error("Deferred choices need exact saved-answer evidence IDs.");
      if (proposal.blockers.some(blocker => blocker.toLowerCase() === choice.topic.trim().toLowerCase())) throw new Error("A choice cannot be both deferred and a material blocker. Resolve its classification from the user's answers.");
    }
  }
  proposal.intent = requiredText(proposal.intent, "the evidence-linked intent");
  proposal.changeReason = requiredText(proposal.changeReason, "the evidence-backed explanation of score change");
  proposal.question ??= "";
  if (typeof proposal.question !== "string") throw new Error("The optional question must be text.");
  if (proposal.question.length > 500 || /\n/.test(proposal.question) || (proposal.question.match(/[?？]/g) ?? []).length > 1) throw new Error("Return ONE short question (<=500 characters, one line), or leave it empty. Keep explanations in changeReason.");
  if (!["question", "reframe", "research", "ready", "blocked"].includes(proposal.strategy)) throw new Error("Interview strategy must be question, reframe, research, ready, or blocked.");
  const suppliedHashes = new Set(answers.map(answer => interviewContentHash(answer.text)));
  for (const hash of researchContentHashes) {
    if (typeof hash !== "string" || !/^[a-f0-9]{64}$/iu.test(hash)) throw new Error("Research content hashes must be exact SHA-256 values.");
    suppliedHashes.add(hash.toLowerCase());
  }
  const materialState = validateMaterialState(proposal.materialState, suppliedHashes);
  proposal.materialState = materialState;
  const readiness = validateReadiness(proposal.readiness, { answers, materialState, blockers: proposal.blockers });
  proposal.readiness = readiness;
  const readinessItems = new Set([...readiness.materialGaps.map(gap => gap.id), ...readiness.contradictions.map(item => item.id)]);
  if (proposal.currentGapId !== undefined) proposal.currentGapId = recordId(proposal.currentGapId, "the current material gap ID");
  if (readiness.status === "ready") {
    if (proposal.strategy !== "ready") throw new Error("A ready assessment must use strategy: ready.");
    if (proposal.question.trim()) throw new Error("A ready assessment proposes goal confirmation, not another interview question.");
    if (proposal.currentGapId) throw new Error("A ready assessment cannot retain a current material gap.");
  } else {
    if (proposal.strategy === "ready") throw new Error("Resolve material gaps and contradictions before using strategy: ready.");
    if (!proposal.currentGapId || !readinessItems.has(proposal.currentGapId)) throw new Error("A not-ready assessment must name one current material gap or contradiction.");
    if (proposal.strategy === "reframe" && !proposal.question.trim()) throw new Error("A reframe strategy needs one useful next question.");
  }
  const ambiguity = Math.max(0, Math.min(100, 100 - clarity));
  const latestAnswer = answers.at(-1)!.id;
  const sameHeads = previous?.answerHead === latestAnswer && previous?.researchHead === researchHead;
  if (sameHeads && !reassess) throw new Error("This answer and research head already have an assessment; wait for new evidence or the user.");
  if (reassess && (!previous || !sameHeads)) throw new Error("A saved-answer review requires the current assessed answer and research head.");
  const progress = reassess
    ? { comparable: false, progressed: false, reasons: [], ignored: ["A report repair does not establish new material information."] } as InterviewProgress
    : classifyInterviewProgressForGapTransition(previous?.materialState, materialState, previous?.currentGapId, proposal.currentGapId ?? null);
  const attemptedStrategy = previous?.strategy ?? proposal.strategy;
  const attemptedGap = previous?.currentGapId ? previous.materialState.gaps.find(gap => gap.gapId === previous.currentGapId) : undefined;
  let recovery: InterviewRecovery = reassess && previous
    ? { ...structuredClone(previous.recovery), retained: mergeRetained(previous.recovery, { answerIds: answers.map(answer => answer.id), researchHead, artifactRefs }) }
    : advanceInterviewRecovery(previous?.recovery, progress, attemptedStrategy, {
      currentGap: attemptedGap,
      answerHead: latestAnswer,
      answerIds: answers.map(answer => answer.id),
      researchHead,
      artifactRefs,
      nextStrategy: proposal.strategy,
    });
  if (recovery.status === "strategy_required") throw new Error(`${recovery.blocker} Use strategy: ${recovery.requiredStrategies?.join(" or ")}. Saved answers and artifacts remain current.`);
  if (proposal.strategy === "blocked" && recovery.status !== "paused") {
    const named = materialState.gaps.find(gap => gap.gapId === proposal.currentGapId);
    recovery = {
      ...recovery,
      status: "paused",
      ...(named ? { gap: { gapId: named.gapId, summary: named.normalizedSummary } } : {}),
      blocker: `The current assessment is blocked on ${proposal.currentGapId}. Saved answers and artifacts remain available.`,
      choices: structuredClone(FINISH_CHOICES),
    };
  }
  let status: InterviewStateV2["status"];
  if (recovery.status === "paused" || proposal.strategy === "blocked") status = "paused";
  else if (readiness.status === "ready") status = "awaiting_goal_confirmation";
  else if (proposal.strategy === "research") status = "awaiting_research";
  else status = proposal.question.trim() ? "interviewing" : "awaiting_choice";
  const goalRevision = readiness.status === "ready" ? interviewGoalRevision({
    anchorId,
    answerHead: latestAnswer,
    researchHead,
    goalSentence: readiness.goalSentence!,
    readiness,
  }) : undefined;
  const action: InterviewStateV2["assessmentKind"] = reassess ? "review" : previous?.answerHead === latestAnswer && previous.researchHead !== researchHead ? "research_return" : undefined;
  return {
    version: 2,
    anchorId,
    answerHead: latestAnswer,
    researchHead,
    round: answers.length,
    status,
    raw: ambiguity,
    ambiguity,
    delta: previous && Number.isFinite(previous.raw ?? previous.ambiguity) ? ambiguity - (previous.raw ?? previous.ambiguity) : null,
    scorePolicy: "advisory",
    proposal,
    materialState,
    strategy: proposal.strategy,
    ...(proposal.currentGapId ? { currentGapId: proposal.currentGapId } : {}),
    progress,
    recovery,
    ...(goalRevision ? { goalRevision } : {}),
    ...(goalRevision ? { goalToken: goalRevision.slice(0, 12) } : {}),
    ...(action ? { assessmentKind: action } : {}),
    history: [
      ...(previous?.history ?? []),
      {
        answerHead: latestAnswer,
        researchHead,
        ambiguity,
        reason: proposal.changeReason,
        materialProgress: progress.progressed,
        strategy: proposal.strategy,
        ...(action ? { action } : {}),
      },
    ],
  };
}

export function renderInterview(state: InterviewStateV2 | any, korean = false): string {
  if (!state) return korean
    ? "모호성: 평가 대기 (참고 정보). 정상 종료에는 현재 준비도와 목표 토큰 확인이 필요합니다. /solar-interview finish는 명시적 조기 종료입니다."
    : "Ambiguity: awaiting assessment (informational). Normal closure requires current readiness and goal-token confirmation; /solar-interview finish is an explicit early finish.";
  const value = Number.isFinite(state.ambiguity) ? state.ambiguity.toFixed(1) : "unknown";
  const delta = state.delta === null || state.delta === undefined ? (korean ? "이전 검증 점수 없음" : "no prior verified score") : `${state.delta >= 0 ? "+" : ""}${state.delta.toFixed(1)} ${korean ? "%p" : "percentage points"}`;
  const heading = korean ? `모호성 ${value}% · 이전 대비 ${delta} · 참고 정보 · 질문 ${state.round}` : `Ambiguity ${value}% | change ${delta} | informational only | round ${state.round}`;
  const floor = Number.isFinite(state.raw) && state.ambiguity > state.raw
    ? korean ? `계산 모호성 ${state.raw.toFixed(1)}% (점수는 종료 조건이 아닙니다)` : `Raw ${state.raw.toFixed(1)}% (scores do not gate closure)`
    : undefined;
  const blockers = state.proposal?.blockers?.length
    ? (korean ? "계획에 넘길 미해결 사항: " : "Open issues to carry into planning: ") + state.proposal.blockers.map((item: string) => item.length > 180 ? item.slice(0, 180) + "…" : item).join(" | ")
    : undefined;
  const gaps = state.proposal?.readiness?.materialGaps?.length
    ? (korean ? "정상 종료 전 해결할 자료 공백: " : "Material gaps before normal closure: ") + state.proposal.readiness.materialGaps.map((item: ReadinessGap) => `${item.id}: ${item.issue}`).join(" | ")
    : undefined;
  const contradictions = state.proposal?.readiness?.contradictions?.length
    ? (korean ? "모순: " : "Contradictions: ") + state.proposal.readiness.contradictions.map((item: ReadinessContradiction) => `${item.id}: ${item.issue}`).join(" | ")
    : undefined;
  const deferred = state.proposal?.deferred?.length ? (korean ? "계획/실행에 위임: " : "Deferred to planning/execution: ") + state.proposal.deferred.map((item: DeferredChoice) => item.topic).join("; ") : undefined;
  const review = state.assessmentKind === "review" ? (korean ? "저장 답변 재검토 (새 답변에 의한 변화가 아님)" : "Saved-answer review (change is not from new information)") : state.assessmentKind === "research_return" ? (korean ? "연구 반환 평가" : "Research-return assessment") : undefined;
  let status: string;
  if (state.status === "awaiting_goal_confirmation") {
    try {
      const token = goalToken(state);
      status = korean
        ? `현재 증거에 연결된 목표: ${state.proposal.readiness.goalSentence}\n정상 종료: /solar-interview confirm ${token} · 답변이나 새 연구가 추가되면 토큰이 무효화됩니다. /solar-interview finish는 조기 종료로 기록됩니다.`
        : `Current evidence-linked goal: ${state.proposal.readiness.goalSentence}\nNormal closure: /solar-interview confirm ${token} | any new answer or research invalidates this token. /solar-interview finish remains an early finish.`;
    } catch {
      status = korean
        ? "저장된 목표 토큰이 오래되었거나 잘못되었습니다. 답변과 연구 기록을 보존한 채 현재 증거를 다시 평가하세요."
        : "The saved goal token is stale or malformed. Reassess current evidence while preserving answers and research.";
    }
  } else if (state.status === "paused") {
    const recovery = state.recovery;
    const exhausted = recovery?.consecutiveNoProgress >= 2;
    status = korean
      ? `${exhausted ? "두 가지 전략에서 정보 진전이 없어" : "현재 자료 공백 때문에"} 일시 중지되었습니다. ${recovery?.blocker ?? "현재 공백이 남아 있습니다."}\n선택: 답변/명확화 · 표적 공개 연구 허용 · /solar-interview finish로 명시적 조기 종료.`
      : `${exhausted ? "Paused without material-information progress after two strategies." : "Paused at a material blocker."} ${recovery?.blocker ?? "The current gap remains open."}\nChoices: answer/clarify | permit targeted public research | explicitly finish early with /solar-interview finish.`;
  } else if (state.status === "awaiting_research") {
    status = korean ? "현재 공백에 대한 표적 연구가 필요합니다. 저장된 답변과 자료는 유지됩니다. 명시적 조기 종료는 /solar-interview finish입니다." : "Targeted research is required for the current gap. Saved answers and artifacts are retained. /solar-interview finish remains an explicit early finish.";
  } else if (state.status === "awaiting_choice") {
    status = korean ? "정상 종료 준비가 아직 확인되지 않았습니다. 답변하거나 연구를 선택하세요. /solar-interview finish는 점수와 관계없는 명시적 조기 종료입니다." : "Normal readiness is not yet established. Answer or choose research; /solar-interview finish is an explicit early finish at any score.";
  } else {
    status = korean ? "질문에 답하거나 다른 전략을 선택하세요. 점수는 참고 정보일 뿐입니다. /solar-interview finish는 명시적 조기 종료입니다." : "Answer the question or choose another strategy. Scores are advisory only; /solar-interview finish is an explicit early finish.";
  }
  const tail = state.status === "interviewing" ? state.proposal?.question : ["awaiting_choice", "awaiting_goal_confirmation"].includes(state.status) ? state.proposal?.intent : undefined;
  return [heading, floor, review, state.proposal?.changeReason, blockers, gaps, contradictions, deferred, status, tail].filter(Boolean).join("\n");
}

export function confirmInterview(
  state: InterviewStateV2 | undefined,
  answerInput: InterviewAnswer[],
  anchorId: string,
  token: string,
  options: ConfirmInterviewOptions,
): InterviewClosureV2 {
  if (!options || !Object.prototype.hasOwnProperty.call(options, "researchHead")) throw new Error("Supply the current research head, including null, before confirming the goal.");
  const answers = validateAnswers(answerInput);
  const researchHead = currentResearchHead(options.researchHead);
  if (!state || !supportedState(state)) throw new Error("No supported current assessment is available to confirm.");
  if (options.reviewPending) throw new Error("The latest saved-answer review is still pending; reassess before confirming the goal.");
  if (!isInterviewGoalCurrent(state, answers, anchorId, researchHead, false)) throw new Error("This goal token is stale because the answer, research, readiness, or interview anchor changed.");
  const expected = goalToken(state);
  if (token !== expected) throw new Error(`Goal confirmation token is stale or incorrect. Confirm the current token ${expected}.`);
  const readiness = validateReadiness(state.proposal.readiness, { answers, materialState: state.materialState, blockers: state.proposal.blockers });
  if (readiness.status !== "ready" || !state.materialState.topics.length || readiness.materialGaps.length || readiness.contradictions.length || state.recovery.status === "paused") throw new Error("Normal closure requires current evidence-linked readiness with no material gaps, contradictions, or recovery pause.");
  return {
    version: 2,
    anchorId: state.anchorId,
    answerHead: state.answerHead,
    researchHead,
    status: "user_finished",
    mode: "normal",
    completionAuthority: "user_confirmation",
    request: options.request ?? `/solar-interview confirm ${token}`,
    answers: structuredClone(answers),
    assessment: structuredClone(state),
    assessmentCurrent: true,
    unresolved: [],
    blockers: [],
    contradictions: [],
    deferred: structuredClone(state.proposal.deferred ?? []),
    artifactRefs: structuredClone(state.recovery.retained.artifactRefs),
    confirmedGoal: { sentence: readiness.goalSentence!, revision: state.goalRevision!, token },
    planningOnly: Boolean(options.planOnly),
    executionAuthority: "none",
  };
}

export function finishInterview(
  state: InterviewStateV2 | unknown | undefined,
  answerInput: InterviewAnswer[],
  anchorId: string,
  request: string,
  reviewPending = false,
  options: FinishInterviewOptions = {},
): InterviewClosureV2 {
  const answers = validateAnswers(answerInput);
  anchorId = recordId(anchorId, "the interview anchor");
  request = requiredText(request, "the explicit early-finish request");
  if (!isInterviewFinishRequest(request)) throw new Error("Early closure requires an explicit finish-interview action; ordinary agreement, sufficiency, or planning language is not closure.");
  const currentState = supportedState(state) ? state : undefined;
  const researchHeadSupplied = Object.prototype.hasOwnProperty.call(options, "researchHead");
  const researchHead = researchHeadSupplied ? currentResearchHead(options.researchHead) : currentState?.researchHead ?? null;
  const readiness = currentState?.proposal.readiness;
  const assessmentCurrent = Boolean(researchHeadSupplied
    && !reviewPending
    && currentState
    && currentState.anchorId === anchorId
    && currentState.answerHead === answers.at(-1)!.id
    && currentState.researchHead === researchHead);
  return {
    version: 2,
    anchorId,
    answerHead: answers.at(-1)!.id,
    researchHead,
    status: "user_finished",
    mode: "early",
    completionAuthority: "user_explicit_finish",
    request,
    answers: structuredClone(answers),
    assessment: state ? structuredClone(state) : null,
    assessmentCurrent,
    unresolved: structuredClone(readiness?.materialGaps ?? []),
    blockers: structuredClone(currentState?.proposal.blockers ?? []),
    contradictions: structuredClone(readiness?.contradictions ?? []),
    deferred: structuredClone(currentState?.proposal.deferred ?? []),
    artifactRefs: unique([...(currentState?.recovery.retained.artifactRefs ?? []), ...(options.artifactRefs ?? [])]),
    ...(readiness?.goalSentence ? { unconfirmedGoal: { sentence: readiness.goalSentence, ...(currentState?.goalRevision ? { revision: currentState.goalRevision } : {}) } } : {}),
    planningOnly: Boolean(options.planOnly || /(?:^|\s)(?:--)?plan-only(?=\s|[.!]|$)|계획만/u.test(request)),
    executionAuthority: "none",
  };
}

export function interviewConfirmationToken(text: string): string | undefined {
  return /^\/solar-interview\s+confirm\s+([a-f0-9]{12})\s*[.!]?$/u.exec(text.trim())?.[1];
}

export function isInterviewFinishRequest(text: string): boolean {
  const input = text.trim();
  if (/^\/solar-interview\s+finish(?:\s+(?:(?:--)?plan-only|계획만))?\s*[.!]?$/iu.test(input)) return true;
  const english = /^(?:(?:please\s+)?(?:finish|end|stop)(?:\s+(?:the|this|my|our))?\s+interview(?:\s+(?:now|please))?|(?:please\s+)?(?:let(?:'s|\s+us)|i\s+(?:want|would\s+like)\s+to)\s+(?:finish|end|stop)(?:\s+(?:the|this|my|our))?\s+interview)(?:[.!]+)?$/iu;
  const korean = /^(?:이제\s*)?인터뷰(?:를|는)?\s*(?:종료|끝내|그만)(?:\s*(?:해\s*주세요|해주세요|주세요|해줘|하자|할게요|합니다|하겠습니다|하죠|할래요))?(?:[.!。]+)?$/u;
  return english.test(input) || korean.test(input);
}

export function renderInterviewClosure(closure: InterviewClosureV2 | any, korean = false): string {
  const normal = closure?.mode === "normal";
  const status = normal
    ? korean ? "인터뷰 정상 종료 — 현재 증거에 연결된 목표를 사용자가 확인했습니다." : "Interview normally closed — the user confirmed the current evidence-linked goal."
    : korean ? "인터뷰 조기 종료 — 사용자가 준비도와 관계없이 명시적으로 종료했습니다." : "Interview ended early at the user's explicit request, regardless of readiness score.";
  const assessment = closure?.assessmentCurrent
    ? korean ? "마지막 평가는 현재 답변·연구에 연결되어 있으며 점수는 참고 정보입니다." : "The last assessment is current for the saved answer and research heads; its score is advisory."
    : korean ? "최신 답변/연구에 대한 평가가 없거나 재검토가 중단되었습니다. 저장된 기록을 그대로 계획에 전달합니다." : "The latest answer/research is unassessed or its review was interrupted. Saved history is still included in the handoff.";
  const goal = normal && closure?.confirmedGoal
    ? (korean ? `확인된 목표: ${closure.confirmedGoal.sentence}` : `Confirmed goal: ${closure.confirmedGoal.sentence}`)
    : closure?.unconfirmedGoal
      ? (korean ? `확인되지 않은 제안 목표: ${closure.unconfirmedGoal.sentence}` : `Unconfirmed proposed goal: ${closure.unconfirmedGoal.sentence}`)
      : undefined;
  const open = [
    ...(closure?.blockers ?? []),
    ...(closure?.unresolved ?? []).map((item: ReadinessGap) => item.issue),
    ...(closure?.contradictions ?? []).map((item: ReadinessContradiction) => item.issue),
  ];
  const openText = open.length ? (korean ? `보존된 미해결/모순: ${open.join(" | ")}` : `Preserved unresolved/contradictory items: ${open.join(" | ")}`) : undefined;
  const deferredText = closure?.deferred?.length
    ? (korean ? `계획/실행에 위임된 선택: ${closure.deferred.map((item: DeferredChoice) => item.topic).join(" | ")}` : `Deferred planning/execution choices: ${closure.deferred.map((item: DeferredChoice) => item.topic).join(" | ")}`)
    : undefined;
  const boundary = closure?.planningOnly
    ? korean ? "계획 전용 종료입니다. 계획 검토 뒤에도 실행 권한을 만들지 않습니다." : "This is planning-only closure; it cannot create execution authority after planning review."
    : korean ? "이 종료는 계획 단계로만 넘기며 실행 권한을 부여하지 않습니다." : "This closure hands off to planning only and grants no execution authority.";
  const handoff = korean ? "저장된 답변·수정·연구·위임 사항을 보존했습니다. /skill:solar-plan으로 계획을 작성하세요. 구현은 시작하지 않았습니다." : "Saved answers, corrections, research, and deferred choices are preserved. Use /skill:solar-plan to write the plan. Implementation has not started.";
  return [status, assessment, goal, openText, deferredText, boundary, handoff].filter(Boolean).join("\n");
}
