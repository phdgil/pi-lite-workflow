import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { createRetryingFetch } from "./retry-fetch.ts";
import { prepareInterviewReport, renderCurrentInterview, renderPendingInterview } from "./interview-report.ts";
import { interviewDisplayNote, renderStyledInterview, renderStyledPendingInterview } from "./interview-display.ts";
import { finishInterview, INTERVIEW_CLOSURE_STATE, INTERVIEW_REVIEW_STATE, INTERVIEW_STATE, isInterviewFinishRequest, messageText, recoverInterview, renderInterviewClosure, stripSkill } from "./interview.ts";
import { matchesWorkflowWorkspace, readWorkflowArtifact, recoverWorkflow, startWorkflow, WORKFLOW_STATE, workflowContract, workflowLimits } from "./workflow.ts";

const RATE_STATE = "solar-retry-state-v2";
const DELEGATES = Symbol.for("pi-solar-lite.upstage-delegates-v1");
const INTENT_RUBRIC = "PLANNING-READINESS RUBRIC: Assess clarity of user intention, not completeness of an implementation design. 1.0 means the intended outcome, scope/constraints, or success meaning is explicit enough to plan; it does not require exact algorithms, database mappings, citation formats, confidential input lists, or experiment results. An explicit decision to let students discover a method or let the planner choose a detail is a resolved scope decision, not an unanswered question. Record such choices in deferred with exact saved-answer IDs. Do not penalize clarity solely for those deferred choices. Before every report, reclassify each inherited blocker against the original answers; never carry a resolved/deferred item forward merely because an older assessment listed it. Preserve genuinely contradictory intentions, unclear outcomes, and essential safety constraints as blockers. Do not invent permission to defer or lower scores to finish. When only implementation choices remain, omit the question and offer the move to planning. Never demand a second closure confirmation.";

export function installSolarRuntime(pi: ExtensionAPI, options: any = {}) {
  let context: any;
  let interview: any;
  let closure: any;
  let workflow: any;
  let active = false;
  let anchorId: string | undefined;
  let answers: any[] = [];
  let korean = false;
  let rateFetch: any;
  let currentAnswerId: string | undefined;
  let settledReport = false;
  let reviewing = false;
  let repairs = 0;
  let toolCalls = 0;
  let closed = false;
  let originalTools: string[] | undefined;
  let pendingNote: string | undefined;
  let pendingPhase: "processing" | "retrying" | "stopped" = "processing";

  function refreshAnswers(ctx: any) {
    const recovered = recoverInterview(ctx.sessionManager.getBranch());
    if (recovered.anchorId !== anchorId) interview = recovered.state;
    closure = recovered.closure;
    answers = recovered.answers;
    anchorId = recovered.anchorId;
    korean = /[가-힣]/.test(answers.map(answer => answer.text).join("\n"));
    const latest = answers.at(-1)?.id;
    if (latest && latest !== currentAnswerId) {
      currentAnswerId = latest;
      repairs = 0;
      toolCalls = 0;
      settledReport = false;
      reviewing = recovered.reviewing;
      pendingNote = undefined;
      pendingPhase = "processing";
    }
  }

  function restore(ctx: any) {
    context = ctx;
    const entries = ctx.sessionManager.getBranch();
    workflow = recoverWorkflow(entries);
    if (workflow && !matchesWorkflowWorkspace(workflow, ctx.cwd)) workflow = { ...workflow, status: "workspace_mismatch" };
    const recovered = recoverInterview(entries);
    interview = recovered.state;
    closure = recovered.closure;
    reviewing = recovered.reviewing;
    active = recovered.active;
    anchorId = recovered.anchorId;
    answers = recovered.answers;
    korean = /[가-힣]/.test(answers.map(answer => answer.text).join("\n"));
    const toolEntry = [...entries].reverse().find(entry => entry.type === "custom" && entry.customType === "solar-interview-tools-v1");
    originalTools = toolEntry?.data?.tools ?? originalTools;
    restoreTools();
    settledReport = !reviewing && Boolean(answers.length && interview?.answerId === answers.at(-1)?.id);
    if (settledReport) pendingNote = undefined;
    if (!settledReport && ctx.isIdle()) pendingPhase = "stopped";
    showInterview();
  }

  function reportText(state: any, useKorean = korean) {
    return [renderCurrentInterview(state, useKorean), interviewDisplayNote(state, useKorean)].filter(Boolean).join("\n");
  }

  function progressText() {
    if (closure && workflow && ["plan", "execute"].includes(workflow.stage)) return `Solar: ${workflow.stage}. Interview finished; no further interview answer or confirmation is needed.`;
    if (closure) return renderInterviewClosure(closure, korean);
    const pending = active && (reviewing || pendingNote || !interview || interview.answerId !== answers.at(-1)?.id);
    return pending ? renderPendingInterview(interview, korean, pendingNote, pendingPhase) : reportText(interview);
  }

  function showInterview(note?: string, phase = pendingPhase) {
    if (!context) return;
    if (closure) {
      context.ui.setWidget("solar-interview", workflow && ["plan", "execute"].includes(workflow.stage) ? undefined : renderInterviewClosure(closure, korean).split("\n"));
      return;
    }
    if (!active && !interview) {
      context.ui.setWidget("solar-interview", undefined);
      return;
    }
    if (note) pendingNote = note;
    pendingPhase = phase;
    const pending = active && (reviewing || pendingNote || !interview || interview.answerId !== answers.at(-1)?.id);
    const state = interview;
    const useKorean = korean;
    const displayNote = pendingNote;
    context.ui.setWidget("solar-interview", (_tui: any, theme: any) => new Text(
      pending ? renderStyledPendingInterview(state, useKorean, theme, displayNote, phase) : renderStyledInterview(state, useKorean, theme),
      0, 0,
    ));
  }

  function saveInterview(next: any) {
    interview = next;
    pendingNote = undefined;
    pi.appendEntry(INTERVIEW_STATE, next);
    showInterview();
  }

  function saveWorkflow(next: any) {
    workflow = next;
    pi.appendEntry(WORKFLOW_STATE, next);
    context?.ui.setStatus("solar-workflow", `Solar: ${next.stage} · ${next.status}`);
  }

  function restoreTools() {
    const stageTools = ["solar_interview_round", "solar_research_ready", "solar_plan_ready"];
    const base = (originalTools ?? pi.getActiveTools()).filter(name => !stageTools.includes(name));
    if (active) {
      originalTools ??= base;
      pi.setActiveTools(["read", "solar_interview_round"]);
    } else {
      const handoff = workflow?.status === "active" && ["research", "plan"].includes(workflow.stage) ? [`solar_${workflow.stage}_ready`] : [];
      pi.setActiveTools([...base, ...handoff]);
    }
  }

  function launchStage(stage: string, instruction: string) {
    active = stage === "interview";
    if (active) {
      originalTools ??= pi.getActiveTools().filter(name => name !== "solar_interview_round");
      pi.appendEntry("solar-interview-tools-v1", { tools: originalTools });
      pi.setActiveTools(["read", "solar_interview_round"]);
      settledReport = false;
      currentAnswerId = undefined;
      closure = undefined;
    } else {
      restoreTools();
    }
    pi.sendUserMessage(`/skill:solar-${stage} ${instruction}`, { deliverAs: "followUp", expandPromptTemplates: true });
  }

  async function finishSavedInterview(ctx: any, request: string, advance = true, planOnly = false) {
    if (closure) return;
    if (advance && workflow && !matchesWorkflowWorkspace(workflow, ctx.cwd)) throw new Error("Resume this workflow in its original workspace before starting planning.");
    closure = finishInterview(interview, answers, anchorId, request, reviewing);
    closure.next = advance ? "solar-plan" : null;
    active = false;
    reviewing = false;
    settledReport = true;
    pendingNote = undefined;
    pi.appendEntry(INTERVIEW_CLOSURE_STATE, closure);
    if (!ctx.isIdle()) ctx.abort();
    if (ctx.waitForIdle) await ctx.waitForIdle();
    restoreTools();
    showInterview();
    pi.sendMessage({ customType: "solar-interview-handoff", content: `User-ended interview. No further closure confirmation is needed. This is NOT proof that every detail is resolved. Treat ambiguity as informational. Review all saved answers, unresolved/deferred issues, and any stale assessment before writing an executable plan. Respect the original scope and any planning-only constraint.\n${JSON.stringify(closure)}`, display: false });
    if (advance) {
      const current = workflow ?? startWorkflow("interview", answers[0].text, ctx.cwd);
      saveWorkflow({ ...current, stage: "plan", pendingHandoff: true, autoExecute: !planOnly && current.autoExecute });
      showInterview();
      launchStage("plan", "Use the original intention, research context, and complete saved interview handoff in this conversation. Preserve unresolved and deferred issues. Build and review executable steps; do not ask for another interview confirmation. Respect the host's planning-only setting and all user constraints.");
    } else if (workflow) {
      saveWorkflow({ ...workflow, status: "stopped" });
      restoreTools();
    }
  }

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return;
    const planningRequest = /^\/skill:solar-plan(?:\s|$)/.test(event.text);
    if (!planningRequest && !isInterviewFinishRequest(event.text)) return;
    restore(ctx);
    context?.ui.setStatus("solar-workflow", workflow ? `Solar: ${workflow.stage} · ${workflow.status}` : undefined);
    if (!active || !answers.length) return;
    await finishSavedInterview(ctx, event.text, true, !workflowLimits(event.text).autoExecute);
    return { action: "handled" };
  });

  pi.on("session_start", (_event, ctx) => {
    closed = false;
    reviewing = false;
    restore(ctx);
    const delegates: WeakMap<object, any> = (globalThis as any)[DELEGATES] ??= new WeakMap();
    const native: any = delegates.get(ctx.modelRegistry) ?? ctx.modelRegistry.getProvider("upstage");
    if (!native?.streamSimple) return;
    delegates.set(ctx.modelRegistry, native);
    let baseFetch: any;
    pi.registerProvider("upstage", {
      api: "openai-completions",
      streamSimple(model, messages, streamOptions) {
        if (model.id !== "solar-pro4") return native.streamSimple(model, messages, streamOptions);
        const suppliedFetch = streamOptions?.fetch ?? globalThis.fetch;
        if (!rateFetch || baseFetch !== suppliedFetch) {
          baseFetch = suppliedFetch;
          rateFetch = createRetryingFetch(suppliedFetch, {
            ...options.rate,
            onState(state: any) {
              if (!closed) pi.appendEntry(RATE_STATE, state);
            },
            onWait({ delayMs, reason }: any) {
              context?.ui.setStatus("solar-rate", `Solar waiting ${Math.ceil(delayMs / 1000)}s: ${reason} (Esc cancels)`);
            },
          });
        }
        return native.streamSimple(model, messages, { ...streamOptions, fetch: rateFetch, maxRetries: 0 });
      },
    });
  });

  pi.on("session_shutdown", () => {
    closed = true;
    context?.ui.setWidget("solar-interview", undefined);
    context?.ui.setStatus("solar-rate", undefined);
    context?.ui.setStatus("solar-workflow", undefined);
  });

  pi.registerCommand("solar-rate", {
    description: "Show Solar 429 retry status (no local token or request cap)",
    handler: async (_arguments, ctx) => {
      ctx.ui.notify(JSON.stringify(rateFetch?.snapshot?.() ?? { mode: "retry-only", status: "No Solar request observed yet" }), "info");
    },
  });

  pi.registerCommand("solar-interview", {
    description: "Finish -> plan -> execute; finish plan-only stops at planning; stop saves without continuing; continue, status, pause, resume, retry, review",
    handler: async (argument, ctx) => {
      restore(ctx);
      const command = argument.trim() || "status";
      try {
        if (["finish", "confirm", "finish plan-only", "stop"].includes(command)) {
          await finishSavedInterview(ctx, `/solar-interview ${command}`, command !== "stop", command === "finish plan-only");
        } else if (command === "pause" && interview) {
          saveInterview({ ...interview, status: "paused" });
          active = false;
          if (workflow) saveWorkflow({ ...workflow, status: "paused" });
          restoreTools();
        } else if (command === "resume" && interview) {
          closure = undefined;
          saveInterview({ ...interview, status: interview.proposal.question ? "interviewing" : "awaiting_choice" });
          active = true;
          if (workflow && matchesWorkflowWorkspace(workflow, ctx.cwd)) saveWorkflow({ ...workflow, stage: "interview", status: "active" });
          restoreTools();
        } else if (command === "review" || command === "continue") {
          if (command === "continue" && interview) {
            closure = undefined;
            saveInterview({ ...interview, status: interview.proposal.question ? "interviewing" : "awaiting_choice" });
            active = true;
            if (workflow && matchesWorkflowWorkspace(workflow, ctx.cwd)) saveWorkflow({ ...workflow, stage: "interview", status: "active" });
            restoreTools();
          }
          if (!active || !interview || !answers.length || interview.answerId !== answers.at(-1)?.id) throw new Error("Review requires an active interview with an assessed saved answer. Use retry for an unassessed answer.");
          if (!ctx.isIdle() || ctx.hasPendingMessages()) throw new Error("Wait for the current response to finish before reviewing.");
          reviewing = true;
          pi.appendEntry(INTERVIEW_REVIEW_STATE, { anchorId, answerId: interview.answerId, status: "pending" });
          settledReport = false;
          currentAnswerId = answers.at(-1).id;
          repairs = 0;
          toolCalls = 0;
          showInterview(korean ? "저장된 답변으로 의도와 위임한 구현 선택을 재분류합니다. 추가 답변은 필요하지 않습니다." : "Reviewing saved answers: distinguish unresolved intent from deliberately deferred implementation choices. No new answer needed.", "retrying");
          pi.sendMessage({ customType: "solar-interview-review", content: `The user requested a review of the existing assessment, not another interview answer. Re-read the original saved answers. Reclassify deferred implementation choices, preserve genuine open issues, and report an informational score. ${command === "continue" ? "The user voluntarily wants to continue: offer one useful optional question without reopening settled/deferred decisions." : "An optional question may be omitted; do not force another question or a low score."} The user can finish at any score. Call solar_interview_round.`, display: false }, { triggerTurn: true, deliverAs: "followUp" });
        } else if (command === "retry") {
          if (!active || !answers.length) throw new Error("No active saved interview answer to retry.");
          if (!ctx.isIdle() || ctx.hasPendingMessages()) throw new Error("Wait for the current response to finish before retrying.");
          if (!settledReport) {
            repairs = 0;
            toolCalls = 0;
            showInterview(korean ? "저장된 답변으로 보고서를 다시 작성합니다." : "Retrying the report using your saved answer.", "retrying");
            pi.sendMessage({ customType: "solar-interview-repair", content: "Retry the informational assessment of the saved answer. Call solar_interview_round with valid evidence. A next question is optional; omitting it is valid. The user may finish at any score.", display: false }, { triggerTurn: true, deliverAs: "followUp" });
          }
        } else if (command !== "status") {
          throw new Error("Use /solar-interview finish, finish plan-only, stop, continue, status, pause, resume, retry, or review. confirm is a legacy finish alias, not a required step.");
        }
        ctx.ui.notify(progressText(), "info");
      } catch (error) {
        ctx.ui.notify(String(error), "error");
      }
    },
  });

  for (const kind of ["research", "plan"]) {
    pi.registerTool({
      name: `solar_${kind}_ready`,
      label: kind === "research" ? "Research -> Interview" : "Plan -> Execute",
      description: `Hand off a written and reviewed ${kind}.md to the next Solar skill. Do not call for ${kind}-only requests, missing authorization, or material blockers.`,
      parameters: Type.Object({ path: Type.String({ description: `Path to ${kind}.md inside the current workspace.` }) }),
      async execute(_id, params, _signal, _update, ctx) {
        try {
          const current = recoverWorkflow(ctx.sessionManager.getBranch());
          if (!current || current.status !== "active" || current.stage !== kind) throw new Error(`No active ${kind} stage to hand off. Do not repeat a completed handoff.`);
          if (!matchesWorkflowWorkspace(current, ctx.cwd)) throw new Error("This workflow belongs to another workspace. Start the intended Solar task explicitly here before handing off.");
          if (kind === "research" ? !current.autoInterview : !current.autoExecute) throw new Error("Automatic continuation is disabled at this user-requested boundary.");
          const artifact = readWorkflowArtifact(ctx.cwd, params.path, kind);
          const next = kind === "research" ? "interview" : "execute";
          saveWorkflow({ ...current, stage: next, pendingHandoff: true, [kind]: artifact });
          launchStage(next, kind === "research"
            ? `Read ${JSON.stringify(artifact.path)}. Use its evidence to ask a useful question about the ORIGINAL intention in the host context. Research findings do not replace the user's goal. Do not ask facts already established by research, over-specify implementation, or expand the user's scope.`
            : `Execute and verify the reviewed local plan at ${JSON.stringify(artifact.path)} within the original requested scope. Read actual inputs and tests, preserve unresolved/deferred choices, and record evidence in progress.md. Respect planning-only requests and separate authorization for destructive or external actions.`);
          return { content: [{ type: "text", text: `${kind}.md verified on disk. Starting solar-${next}; no additional confirmation required.` }], details: { stage: next, path: artifact.path }, terminate: true };
        } catch (error) {
          return { content: [{ type: "text", text: String(error) }], details: { workflowValidationError: true }, terminate: true };
        }
      },
    });
  }

  const dimension = Type.Object({ score: Type.Number({ minimum: 0, maximum: 1 }), evidence: Type.Array(Type.String(), { description: "Exact supplied user-answer IDs only, for example [\"89813422\"]. No prose or invented IDs. Put explanation in gap/changeReason." }), gap: Type.String() });
  pi.registerTool({
    name: "solar_interview_round",
    label: "Interview Progress",
    description: "Report evidence-linked informational ambiguity and an OPTIONAL next question. No score gates completion: the user decides whether to finish or continue. Omit question when no useful next question remains.",
    parameters: Type.Object({
      goal: dimension, constraints: dimension, success: dimension, context: Type.Optional(dimension),
      blockers: Type.Array(Type.String(), { description: "Only unresolved user-intent decisions or contradictions that prevent a valid plan. Not implementation details, citation formatting, algorithm selection, confidential inputs explicitly deferred by the user, or tasks deliberately assigned to later discovery." }),
      deferred: Type.Optional(Type.Array(Type.Object({ topic: Type.String(), evidence: Type.Array(Type.String()), reason: Type.String() }), { description: "Implementation choices explicitly delegated/deferred in the saved user answers. Cite exact answer IDs and why deferral does not prevent planning. Keep these out of blockers; never invent consent to defer a material outcome or safety constraint." })),
      intent: Type.String(), changeReason: Type.String(),
      question: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: "OPTIONAL: one short question (<=500 characters). Omit or leave empty if enough detail has been given or remaining details belong to planning. A missing question is valid at ANY ambiguity score. Never promise a last/final question." })),
    }),
    async execute(_id, proposal, _signal, _update, ctx) {
      context = ctx;
      if (!active) return { content: [{ type: "text", text: "No active Solar interview." }], details: { interviewValidationError: true }, terminate: true };
      try {
        const fresh = recoverInterview(ctx.sessionManager.getBranch());
        if (fresh.answers.length) answers = fresh.answers;
        const next = prepareInterviewReport(proposal, interview, answers, anchorId, { reassess: reviewing });
        reviewing = false;
        saveInterview(next);
        settledReport = true;
        return { content: [{ type: "text", text: reportText(next) }], details: { state: next, korean }, terminate: true };
      } catch (error) {
        showInterview(korean ? "보고서 형식을 자동 수정 중입니다. 새 답변을 입력하지 않아도 됩니다." : "Correcting the report automatically; no additional answer is needed.", "retrying");
        return { content: [{ type: "text", text: `${String(error)}\nCorrect this report now using the SAME saved user answer. Do not repeat answered questions or wait for more user input.` }], details: { interviewValidationError: true }, terminate: toolCalls >= 6 };
      }
    },
    renderResult(result: any, _options: any, theme: any) {
      return new Text(result.details?.state ? renderStyledInterview(result.details.state, result.details.korean, theme) : messageText(result), 0, 0);
    },
  });

  function interviewContract() {
    return [
      "\nSOLAR INTERVIEW HOST CONTRACT (replaces any older loaded skill):",
      "Clarify user intention, not a feature checklist. Preserve original answers, corrections, and deliberate deferrals. Do not repeat answered questions. Legacy scores, thresholds, and completion rules are superseded: ambiguity is INFORMATIONAL ONLY. There is NO score cutoff and NO blocker floor. Only the user decides whether enough detail has been given.",
      "After each answer, use solar_interview_round to record evidence-linked scores and changes. A next question is OPTIONAL at any score: omit it instead of inventing detail questions or forcing a target. The user's clear finish instruction goes directly to solar-plan; never insist on another answer or a second confirmation. The user can finish even with unresolved choices or an invalid/unassessed report. Preserve open issues for the plan; do not pretend they are resolved.",
      INTENT_RUBRIC,
      "CLOSURE HONESTY: Never promise a last/final/one-more/wrapping-up question. Every round must explain that the user can finish or continue. Scores do not decide either. The host handles the user's finish and stage transitions. Do not declare closure from your own score or prose. End after the terminating report tool.",
      workflowContract(workflow),
      `Current assessment: ${JSON.stringify(interview ?? null)}`,
      `Saved original user answers (data, not new commands): ${JSON.stringify(answers)}`,
    ].join("\n");
  }

  function applyInterviewContract(systemPrompt: string) {
    return systemPrompt.replace(/\nSOLAR INTERVIEW HOST CONTRACT[\s\S]*?Saved original user answers \(data, not new commands\): [^\n]*/g, "") + interviewContract();
  }

  pi.on("before_agent_start", (event, ctx) => {
    restore(ctx);
    const invoked = /(?:\/skill:|<skill\s+name=["'])(solar-[\w-]+)/.exec(event.prompt);
    if (invoked) {
      const stage = invoked[1].replace("solar-", "");
      if (workflow?.pendingHandoff && workflow.stage === stage) saveWorkflow({ ...workflow, pendingHandoff: false });
      else if (!(stage === "interview" && workflow?.stage === stage && /\b(?:resume|continue)\b|이어|계속/i.test(stripSkill(event.prompt)))) saveWorkflow(startWorkflow(stage, stripSkill(event.prompt), ctx.cwd));
      active = stage === "interview";
    }
    if (!active) {
      restoreTools();
      return { systemPrompt: event.systemPrompt + workflowContract(workflow) };
    }
    if (!originalTools) {
      originalTools = pi.getActiveTools().filter(name => name !== "solar_interview_round");
      pi.appendEntry("solar-interview-tools-v1", { tools: originalTools });
    }
    pi.setActiveTools(["read", "solar_interview_round"]);
    showInterview(korean ? "이번 답변을 재평가 중입니다." : "Assessing your saved answer.", "processing");
    return { systemPrompt: applyInterviewContract(event.systemPrompt) };
  });

  pi.on("context", (event, ctx) => {
    if (workflow?.pendingHandoff) saveWorkflow({ ...workflow, pendingHandoff: false });
    if (active) refreshAnswers(ctx);
    if (!active || !answers.length) return;
    const latest = answers.at(-1).text;
    let start = -1;
    for (let index = event.messages.length - 1; index >= 0; index--) {
      const message = event.messages[index];
      if (message.role === "user" && stripSkill(messageText(message)) === latest) {
        start = index;
        break;
      }
    }
    if (start < 0) return;
    const retained = event.messages.slice(start);
    retained[0] = { ...retained[0], content: [{ type: "text", text: latest }] } as any;
    return { messages: retained };
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (!event.payload || typeof event.payload !== "object" || !Array.isArray((event.payload as any).messages)) return;
    let payload: any = event.payload;
    if (workflow) {
      const systemIndex = payload.messages.findIndex((message: any) => ["system", "developer"].includes(message.role) && typeof message.content === "string");
      const messages = [...payload.messages];
      if (systemIndex >= 0) messages[systemIndex] = { ...messages[systemIndex], content: messages[systemIndex].content.replace(/\nSOLAR WORKFLOW HOST CONTRACT:[\s\S]*?END SOLAR WORKFLOW HOST CONTRACT/g, "") + workflowContract(workflow) };
      else messages.unshift({ role: "system", content: workflowContract(workflow) });
      payload = { ...payload, messages };
    }
    if (!active) return payload;
    refreshAnswers(ctx);
    if (payload.model !== "solar-pro4" || !payload.tools?.some((tool: any) => tool.function?.name === "solar_interview_round")) return payload;
    const systemIndex = payload.messages.findIndex((message: any) => ["system", "developer"].includes(message.role) && typeof message.content === "string");
    const messages = payload.messages.map((message: any, index: number) => index === systemIndex ? {
      ...message, content: applyInterviewContract(message.content),
    } : message);
    if (systemIndex < 0) messages.unshift({ role: "system", content: interviewContract() });
    return { ...payload, messages, tool_choice: toolCalls >= 1 || repairs > 0 ? { type: "function", function: { name: "solar_interview_round" } } : "required" };
  });

  pi.on("tool_call", event => {
    if (!active) return;
    toolCalls += 1;
    if (!["read", "solar_interview_round"].includes(event.toolName)) return { block: true, reason: "Interview is read-only. Read context, then use solar_interview_round; the host persists your assessment." };
    if (toolCalls > 6) return { block: true, reason: "Interview tool budget reached; wait for the user instead of looping.", terminate: true };
  });

  pi.on("tool_result", event => {
    if (event.toolName === "solar_interview_round" && (event.details as any)?.interviewValidationError) return { isError: true };
    if ((event.details as any)?.workflowValidationError) return { isError: true };
  });

  pi.on("message_end", event => {
    if (event.message.role !== "assistant") return;
    if (event.message.stopReason !== "error" && event.message.stopReason !== "aborted") context?.ui.setStatus("solar-rate", undefined);
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (workflow?.status === "active" && workflow.stage === "execute" && !ctx.hasPendingMessages()) {
      saveWorkflow({ ...workflow, status: "idle" });
      restoreTools();
    }
    if (!active || settledReport || closed || ctx.hasPendingMessages()) return;
    const lastAssistant: any = [...ctx.sessionManager.getBranch()].reverse().find(entry => entry.type === "message" && entry.message?.role === "assistant")?.message;
    if (["error", "aborted", "length"].includes(lastAssistant?.stopReason) || ctx.signal?.aborted || toolCalls >= 6 || repairs >= 1) {
      showInterview(korean ? "자동 수정이 중단되었습니다. /solar-interview retry로 저장된 답변을 다시 평가할 수 있습니다. 완료가 아닙니다." : "Automatic correction stopped. Use /solar-interview retry to reassess the saved answer. The interview is not complete.", "stopped");
      return;
    }
    repairs += 1;
    pi.sendMessage({ customType: "solar-interview-repair", content: "The preceding reply did not record this user's ambiguity assessment. Do not ask another plain-text question or repeat the user answer. Call solar_interview_round now with evidence IDs from the saved answers.", display: false }, { triggerTurn: true, deliverAs: "followUp" });
  });
}

export default function solarRuntime(pi: ExtensionAPI) {
  installSolarRuntime(pi);
}
