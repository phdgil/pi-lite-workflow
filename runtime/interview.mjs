export const INTERVIEW_STATE = "solar-interview-state-v1";
export const INTERVIEW_REVIEW_STATE = "solar-interview-review-state-v1";
export const INTERVIEW_CLOSURE_STATE = "solar-interview-closure-v1";

export function messageText(message) {
  const content = message?.content;
  return typeof content === "string" ? content : (content ?? []).filter(block => block.type === "text").map(block => block.text).join("\n");
}

export function stripSkill(text) {
  return text.replace(/<skill\b[^>]*>[\s\S]*?<\/skill>/g, "").trim();
}

export function recoverInterview(entries) {
  let anchor;
  let state;
  let active = false;
  let pendingReview;
  let closure;
  let precedingQuestion = "";
  const answers = [];
  for (const entry of entries) {
    if (entry.type === "message" && entry.message?.role === "user") {
      const raw = messageText(entry.message);
      const match = /(?:\/skill:|<skill\s+name=["'])(solar-[\w-]+)/.exec(raw);
      if (match) {
        active = match[1] === "solar-interview";
        if (active) closure = undefined;
        const resuming = /\b(?:resume|continue)\b|이어|계속/i.test(stripSkill(raw));
        if (active && (!anchor || !resuming)) {
          anchor = entry.id;
          state = undefined;
          pendingReview = undefined;
          answers.length = 0;
          precedingQuestion = "";
        }
      }
      if (anchor) answers.push({ id: entry.id, text: stripSkill(raw), question: precedingQuestion });
    }
    if (entry.type === "message" && entry.message?.role === "assistant") {
      const text = messageText(entry.message);
      if (text.trim()) precedingQuestion = text;
    }
    if (entry.type === "custom" && entry.customType === INTERVIEW_STATE && entry.data?.version === 1) {
      state = entry.data;
      anchor = state.anchorId;
      active = !["paused", "confirmed"].includes(state.status);
      if (state.status === "interviewing" || state.status === "awaiting_choice") closure = undefined;
      precedingQuestion = state.status === "awaiting_confirmation" ? state.proposal.intent : state.proposal.question;
      if (state.assessmentKind === "review" && state.anchorId === pendingReview?.anchorId && state.answerId === pendingReview?.answerId) pendingReview = undefined;
    }
    if (entry.type === "custom" && entry.customType === INTERVIEW_REVIEW_STATE && entry.data?.status === "pending") pendingReview = entry.data;
    if (entry.type === "custom" && entry.customType === INTERVIEW_CLOSURE_STATE && entry.data?.anchorId === anchor) {
      closure = entry.data;
      active = false;
      pendingReview = undefined;
    }
  }
  const savedAnswers = answers.filter(answer => answer.text);
  const reviewing = Boolean(pendingReview && pendingReview.anchorId === anchor && pendingReview.answerId === savedAnswers.at(-1)?.id && state?.answerId === pendingReview.answerId);
  return { active, anchorId: anchor, state, answers: savedAnswers, reviewing, closure };
}

export function assessInterview(proposal, previous, answers, anchorId, { reassess = false } = {}) {
  proposal = structuredClone(proposal);
  if (previous && previous.anchorId !== anchorId) throw new Error("This assessment belongs to a different interview.");
  if (previous?.proposal && Boolean(previous.proposal.context) !== Boolean(proposal.context)) throw new Error("Keep the same assessment dimensions across rounds.");
  const dimensions = proposal.context ? [["goal", 35], ["constraints", 25], ["success", 25], ["context", 15]] : [["goal", 40], ["constraints", 30], ["success", 30]];
  const known = new Set(answers.map(answer => answer.id));
  if (!answers.length) throw new Error("No saved user answer is available for this assessment.");
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
  if (proposal.deferred !== undefined) {
    if (!Array.isArray(proposal.deferred)) throw new Error("Deferred choices must be an array.");
    for (const choice of proposal.deferred) {
      if (!choice || typeof choice.topic !== "string" || !choice.topic.trim() || typeof choice.reason !== "string" || !choice.reason.trim()) throw new Error("Each deferred choice needs a topic and reason.");
      if (!Array.isArray(choice.evidence) || !choice.evidence.length || choice.evidence.some(reference => !known.has(reference))) throw new Error("Deferred choices need exact saved-answer evidence IDs.");
      if (proposal.blockers.some(blocker => blocker.trim().toLowerCase() === choice.topic.trim().toLowerCase())) throw new Error("A choice cannot be both deferred and a material blocker. Resolve its classification from the user's answers.");
    }
  }
  if (!proposal.intent?.trim() || !proposal.changeReason?.trim()) throw new Error("Supply the intent and evidence-backed explanation of score change.");
  const raw = Math.max(0, Math.min(100, 100 - clarity));
  const ambiguity = raw;
  proposal.question ??= "";
  if (typeof proposal.question !== "string") throw new Error("The optional question must be text.");
  if (proposal.question.length > 500 || /\n/.test(proposal.question) || (proposal.question.match(/[?？]/g) ?? []).length > 1) throw new Error("Return ONE short question (<=500 characters, one line), or leave it empty. Keep explanations in changeReason.");
  const latestAnswer = answers.at(-1).id;
  if (previous?.answerId === latestAnswer && !reassess) throw new Error("This answer already has an assessment; wait for the user.");
  if (reassess && (!previous || previous.answerId !== latestAnswer)) throw new Error("A saved-answer review requires the current assessed answer.");
  return {
    version: 1, anchorId, answerId: latestAnswer, round: answers.length,
    status: proposal.question.trim() ? "interviewing" : "awaiting_choice",
    raw, ambiguity, delta: previous && Number.isFinite(previous.raw ?? previous.ambiguity) ? ambiguity - (previous.raw ?? previous.ambiguity) : null,
    scorePolicy: "advisory", proposal: structuredClone(proposal),
    ...(reassess ? { assessmentKind: "review" } : {}),
    history: [...(previous?.history ?? []), { answerId: latestAnswer, ambiguity, reason: proposal.changeReason, ...(reassess ? { action: "review" } : {}) }],
  };
}

export function renderInterview(state, korean = false) {
  if (!state) return korean ? "모호성: 평가 대기 (참고 정보). 충분하면 /solar-interview finish로 인터뷰를 끝내고 계획으로 이동할 수 있습니다." : "Ambiguity: awaiting assessment (informational). When you have given enough detail, /solar-interview finish ends the interview so you can move to planning.";
  const value = state.ambiguity.toFixed(1);
  const delta = state.delta === null ? (korean ? "이전 검증 점수 없음" : "no prior verified score") : `${state.delta >= 0 ? "+" : ""}${state.delta.toFixed(1)} ${korean ? "%p" : "percentage points"}`;
  const heading = korean ? `모호성 ${value}% · 이전 대비 ${delta} · 참고 정보 · 질문 ${state.round}` : `Ambiguity ${value}% | change ${delta} | informational only | round ${state.round}`;
  const status = state.status === "confirmed" ? (korean ? "사용자가 인터뷰를 종료했습니다. 실행은 시작하지 않았습니다." : "Interview ended by the user. Execution has not started.") : state.status === "paused" ? (korean ? "일시 중지." : "Paused.") : (korean ? "충분하면 /solar-interview finish로 종료하고 계획으로 이동하세요. 점수와 관계없이 종료할 수 있습니다. 계속하려면 답변하거나 /solar-interview continue를 사용하세요." : "Enough detail? /solar-interview finish ends the interview so you can move to planning, at ANY score. To continue, answer or use /solar-interview continue.");
  const floor = Number.isFinite(state.raw) && state.ambiguity > state.raw
    ? korean ? `계산 모호성 ${state.raw.toFixed(1)}% (위 수치는 이전 하한 규칙의 기록이며 종료를 막지 않습니다)` : `Raw ${state.raw.toFixed(1)}% (the stored score used a legacy floor; it does not prevent finishing)`
    : undefined;
  const blockers = state.proposal.blockers?.length
    ? (korean ? "계획에 넘길 미해결 사항: " : "Open issues to carry into planning: ") + state.proposal.blockers.map(item => item.length > 180 ? item.slice(0, 180) + "…" : item).join(" | ")
    : undefined;
  const deferred = state.proposal.deferred?.length ? (korean ? "계획/실행에 위임: " : "Deferred to planning/execution: ") + state.proposal.deferred.map(item => item.topic).join("; ") : undefined;
  const review = state.assessmentKind === "review" ? (korean ? "저장 답변 재검토 (새 답변에 의한 변화가 아님)" : "Saved-answer review (change is not from a new answer)") : undefined;
  return [heading, floor, review, state.proposal.changeReason, blockers, deferred, status, state.status === "awaiting_confirmation" || state.status === "awaiting_choice" || state.status === "confirmed" ? state.proposal.intent : state.proposal.question].filter(Boolean).join("\n");
}

export function confirmInterview(state) {
  if (!state) throw new Error("No assessment to confirm; finishing can still hand off saved answers.");
  return { ...state, status: "confirmed", completionAuthority: "user" };
}

export function finishInterview(state, answers, anchorId, request, reviewPending = false) {
  if (!anchorId || !answers.length) throw new Error("No saved interview answers are available to hand off.");
  return {
    version: 1, anchorId, answerId: answers.at(-1).id, status: "user_finished", request,
    answers: structuredClone(answers), assessment: state ? structuredClone(state) : null,
    assessmentCurrent: !reviewPending && state?.answerId === answers.at(-1).id,
  };
}

export function isInterviewFinishRequest(text) {
  return /^(?:please\s+)?(?:(?:stop|end|finish) (?:the |this )?interview|(?:that is|that's|this is) enough(?: detail(?:s)?)?|(?:i (?:have|think i have) (?:given|provided) |we have )?(?:enough|sufficient) details?(?: (?:have been|are) (?:given|provided))?|(?:move|go)(?: on)? to (?:the )?(?:plan|planning))(?:[.!]?\s*(?:please\s+)?(?:let'?s |and )?(?:move|go|proceed)(?: on)? to (?:the )?(?:plan|planning))?[.!]*$/iu.test(text.trim())
    || /^(?:(?:이\s*정도면|이제|설명은|내용은)\s*)?(?:충분(?:해요|합니다|하다)|인터뷰(?:를|는)?\s*(?:그만|종료|끝내)(?:해줘|하자|주세요|자)?)(?:[.!]?\s*(?:이제\s*)?계획(?:으로|을)?\s*(?:넘어가자|진행하자|세워줘))?[.!]*$/u.test(text.trim());
}

export function renderInterviewClosure(closure, korean = false) {
  const status = korean ? "인터뷰 종료 — 사용자 요청으로 종료했습니다. 추가 답변은 필요하지 않습니다." : "Interview ended at your request. No further answers needed.";
  const assessment = closure.assessmentCurrent ? (korean ? "마지막 점수는 참고 정보이며 완료 조건이 아닙니다." : "The last score is informational, not a completion condition.") : (korean ? "최신 답변에 대한 평가가 없거나 재검토가 중단되었습니다. 저장된 답변을 그대로 계획에 전달합니다." : "The latest answer is unassessed or its review was interrupted. Saved answers are still included in the handoff.");
  return [status, assessment, korean ? "미해결·위임 사항을 보존했습니다. /skill:solar-plan으로 이 대화의 의도와 답변을 검토하고 계획을 작성하세요. 구현은 시작하지 않았습니다." : "Open/deferred issues are preserved. Use /skill:solar-plan to review the intent and saved answers in this conversation and write a plan. Implementation has not started."].join("\n");
}
