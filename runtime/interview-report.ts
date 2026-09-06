import {
  assessInterview,
  renderInterview,
  type AssessInterviewOptions,
  type InterviewAnswer,
  type InterviewRoundV2,
  type InterviewStateV2,
} from "./interview.ts";

export function prepareInterviewReport(
  proposal: InterviewRoundV2,
  previous: InterviewStateV2 | undefined,
  answers: InterviewAnswer[],
  anchorId: string,
  options?: AssessInterviewOptions,
): InterviewStateV2 {
  const formatted = formatInterviewQuestion(proposal.question ?? "");
  const next = assessInterview({ ...proposal, question: formatted.question }, previous, answers, anchorId, options);
  if (formatted.question !== formatted.original) next.questionFormatting = formatted;
  return next;
}

export function formatInterviewQuestion(original: string): { question: string; original: string; deferred: string[] } {
  if (typeof original !== "string") throw new Error("Supply one question as text.");
  const stripLabel = (text: string) => text.replace(/^(?:[-*•]|\d+[.)])\s+/u, "").trim();
  const normalized = stripLabel(original.replace(/\s+/gu, " ").trim())
    .replace(/^(?:(?:(?:one|the|just one)\s+)?(?:last|final)(?:\s+(?:material|remaining))?\s+(?:question|unknown|detail)|(?:just\s+)?one more question|(?:wrap(?:ping)?[- ]?up|wrapper)\s+question)\s*[:.\u2014\u2013,-]\s*/iu, "")
    .replace(/^마지막(?:으로|\s*(?:질문|확인)(?:입니다)?)\s*[:.,\u2014\u2013-]\s*/u, "");
  const questionMarks = (normalized.match(/[?？]/gu) ?? []).length;
  if (questionMarks > 1 && /["“”]/u.test(normalized)) throw new Error("Supply one question; punctuation inside quotations cannot be split safely.");
  const parts = questionMarks > 1 ? normalized.split(/(?<=[?？])\s+/u).map(stripLabel) : [normalized];
  const question = parts[0];
  if (question.length > 500) throw new Error("Rewrite the question in at most 500 characters. Keep explanations in changeReason; do not ask the user to repeat the answer.");
  if ((question.match(/[?？]/gu) ?? []).length > 1) throw new Error("Supply one question with one question mark. Defer the other questions.");
  return { question, original, deferred: parts.slice(1) };
}

export function renderCurrentInterview(state: InterviewStateV2 | undefined, korean = false): string {
  const phase = state?.status === "interviewing"
    ? korean ? "[선택 차례] 질문에 답하거나 /solar-interview finish로 명시적 조기 종료할 수 있습니다." : "[Your choice] Answer the question, or explicitly finish early with /solar-interview finish."
    : state?.status === "awaiting_goal_confirmation"
      ? korean ? "[확인 차례] 현재 목표 토큰을 확인하거나 답변을 계속하세요." : "[Confirmation choice] Confirm the current goal token, or continue answering."
      : state?.status === "awaiting_research"
        ? korean ? "[연구 필요] 현재 공백에 대한 표적 연구 또는 다른 사용자 선택이 필요합니다." : "[Research needed] The current gap needs targeted research or another user choice."
        : state?.status === "paused"
          ? korean ? "[일시 중지] 저장된 기록과 선택 사항을 검토하세요." : "[Paused] Review the retained history and concrete choices."
          : undefined;
  return [phase, renderInterview(state, korean)].filter(Boolean).join("\n");
}

export function renderPendingInterview(
  state: InterviewStateV2 | undefined,
  korean = false,
  note?: string,
  phase: "processing" | "retrying" | "stopped" = "processing",
): string {
  const phases = korean ? {
    processing: "[답변 처리 중] 지금은 추가 답변이 필요하지 않습니다.",
    retrying: "[자동 수정 중] 저장된 답변으로 새 질문을 준비합니다. 추가 답변은 필요하지 않습니다.",
    stopped: "[처리 중단] 새 질문이 아직 없습니다. /solar-interview retry로 저장된 답변을 다시 평가할 수 있습니다.",
  } : {
    processing: "[Processing your answer] No additional reply needed.",
    retrying: "[Correcting automatically] Preparing the next question from your saved answer. No reply needed.",
    stopped: "[Processing stopped] No new question yet. Use /solar-interview retry on the saved answer; do not repeat it.",
  };
  const heading = state
    ? korean ? `이전 모호성 ${state.ambiguity.toFixed(1)}% (이번 답변의 점수가 아님) · 참고 정보` : `Previous ambiguity ${state.ambiguity.toFixed(1)}% (not the current assessment) | informational only`
    : korean ? "모호성 재평가 대기 · 참고 정보" : "Ambiguity awaiting assessment | informational only";
  const status = korean ? "새 질문 대기 중. 답변은 보존되어 있으며 다시 답할 필요가 없습니다." : "Waiting for a new question. Your answer is saved; no need to answer again.";
  const choice = korean ? "정상 종료에는 현재 준비도와 목표 토큰 확인이 필요합니다. /solar-interview finish는 점수와 관계없는 명시적 조기 종료입니다." : "Normal closure requires current readiness and goal-token confirmation. /solar-interview finish is an explicit early finish at any score.";
  return [phases[phase], heading, status, note, choice].filter(Boolean).join("\n");
}
