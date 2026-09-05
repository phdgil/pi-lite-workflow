import { renderCurrentInterview, renderPendingInterview } from "./interview-report.mjs";
import { renderInterview } from "./interview.mjs";

const ROUND_COLORS = ["accent", "syntaxKeyword", "syntaxString", "syntaxNumber"];

export function interviewRoundColor(round) {
  const index = Number.isSafeInteger(round) && round > 0 ? round - 1 : 0;
  return ROUND_COLORS[index % ROUND_COLORS.length];
}

export function interviewDisplayNote(state, korean = false) {
  if (!state?.questionFormatting?.deferred?.length) return "";
  return korean
    ? "다른 질문은 보류했습니다. 계속하려면 표시된 질문에만 답하세요. 충분하면 종료할 수 있습니다."
    : "Additional questions were deferred. If continuing, answer only the question shown; you may finish instead.";
}

export function renderStyledInterview(state, korean, theme) {
  const note = interviewDisplayNote(state, korean);
  if (state?.status !== "interviewing") {
    return [renderCurrentInterview(state, korean), note].filter(Boolean).join("\n");
  }
  const color = interviewRoundColor(state.round);
  const heading = korean ? `질문 ${state.round} · 선택 차례` : `QUESTION ${state.round} | YOUR CHOICE`;
  const details = renderInterview({ ...state, proposal: { ...state.proposal, question: "" } }, korean);
  return [
    theme.bold(theme.fg(color, heading)),
    "",
    theme.bold(theme.fg(color, state.proposal.question)),
    "",
    theme.fg("muted", [details, note].filter(Boolean).join("\n")),
  ].join("\n");
}

export function renderStyledPendingInterview(state, korean, theme, note, phase = "processing") {
  const [heading, ...details] = renderPendingInterview(state, korean, note, phase).split("\n");
  const color = phase === "processing" ? "muted" : "warning";
  return [theme.bold(theme.fg(color, heading)), "", theme.fg("muted", details.join("\n"))].join("\n");
}
