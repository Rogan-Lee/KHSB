import Groq from "groq-sdk";
import type { ChatCompletionCreateParamsNonStreaming as CreateBody } from "groq-sdk/resources/chat/completions";

import { prisma } from "@/lib/prisma";
import { createPseudonymizer, dropSensitiveSentences, type MaskTarget } from "@/lib/privacy/pseudonym";

// Groq 채팅 모델 단일 소스. Groq는 모델을 주기적으로 폐기(decommission)하며,
// 폐기되면 chat.completions가 404를 던진다. 교체 시 여기 한 줄만 바꾼다.
// 활성 모델 확인: GET https://api.groq.com/openai/v1/models
export const GROQ_MODEL = "openai/gpt-oss-120b";

export type GroqChatParams = {
  /** 전송 이력에 남는 이름 (예: "멘토링 정리") */
  feature: string;
  /** 이 요청의 당사자 — 이름을 가명으로 바꿔 보낸다 */
  targets?: MaskTarget[];
  studentId?: string | null;
  /** 누른 직원. 자동 실행이면 비운다 */
  actorId?: string | null;
  messages: CreateBody["messages"];
  options?: Partial<Pick<CreateBody, "temperature" | "max_tokens" | "response_format" | "model">>;
};

// 재원생 명단 — 글에 나온 다른 학생 이름도 가리려고 쓴다. 요청마다 읽지 않게 10분 보관
let roster: { at: number; names: string[] } | null = null;
async function studentRoster() {
  if (roster && Date.now() - roster.at < 600_000) return roster.names;
  const rows = await prisma.student.findMany({ where: { status: "ACTIVE" }, select: { name: true } });
  roster = { at: Date.now(), names: rows.map((r) => r.name) };
  return roster.names;
}

/**
 * 외부 AI(Groq) 호출은 모두 여기를 거친다: 이름·연락처를 가리고 민감 문장을 뺀 뒤 보내고,
 * 받은 글의 가명을 되돌리고, 보낸 사실(내용 제외)을 AiTransferLog 에 남긴다.
 * 실패하면 Groq 오류를 그대로 던진다 (호출부가 429 등을 구분한다).
 */
export async function groqChat(params: GroqChatParams): Promise<string> {
  const p = createPseudonymizer(params.targets ?? [], await studentRoster());
  let droppedSensitive = 0;
  let inputChars = 0;
  const clean = (text: string, role: string) => {
    let out = text;
    // 시스템 프롬프트는 우리가 쓴 지시문이라 민감 낱말이 예시로 들어 있을 수 있다 — 가명 처리만 한다
    if (role !== "system") {
      const s = dropSensitiveSentences(out);
      droppedSensitive += s.dropped;
      out = s.text;
    }
    out = p.mask(out);
    inputChars += out.length;
    return out;
  };
  const messages = params.messages.map((m) =>
    typeof m.content === "string" ? { ...m, content: clean(m.content, m.role) } : m,
  ) as CreateBody["messages"];

  const model = params.options?.model ?? GROQ_MODEL;
  let output = "";
  let ok = false;
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({ ...params.options, model, messages, stream: false });
    output = p.unmask(completion.choices[0]?.message?.content?.trim() ?? "");
    ok = true;
    return output;
  } finally {
    const c = p.counts();
    await prisma.aiTransferLog
      .create({
        data: {
          feature: params.feature,
          provider: "Groq",
          model,
          studentId: params.studentId ?? null,
          actorId: params.actorId ?? null,
          maskedNames: c.names,
          maskedContacts: c.contacts,
          droppedSensitive,
          inputChars,
          outputChars: output.length,
          ok,
        },
      })
      // 이력을 못 남겨도 업무는 막지 않는다
      .catch((error) => console.error("[ai-transfer-log]", error));
  }
}
