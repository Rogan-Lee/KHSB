"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAnyStaff, requireStaff } from "@/lib/roles";
import Groq from "groq-sdk";
import { GROQ_MODEL } from "@/lib/groq";
import {
  buildMentoringEnhancePrompt,
  buildMonthlyMentoringSummaryPrompt,
  parseEnhancedJson,
  finalizeEnhanced,
} from "@/lib/report-ai-prompts";

// 주의: "use server" 모듈에서 `import { type X }` + `export type { X }` (재export)는
// turbopack이 지워진 타입을 런타임에서 참조해 ReferenceError 를 낸다(멘토링 저장 장애 원인).
// 타입 별칭 선언으로 재노출하면 완전히 erase 되어 런타임 바인딩이 생기지 않는다.
export type EnhancedMentoringContent =
  import("@/lib/report-ai-prompts").EnhancedMentoringContent;

// Groq 는 일시적으로 5xx/네트워크 오류를 낸다. 429(rate limit)는 재시도하지 않고
// 그대로 던져 상위에서 사용자 안내 메시지로 변환한다.
async function callGroqWithRetry(
  groq: Groq,
  body: Parameters<Groq["chat"]["completions"]["create"]>[0],
) {
  const run = () => groq.chat.completions.create({ ...body, stream: false });
  try {
    return await run();
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 429 || (status !== undefined && status < 500)) throw err;
    // ponytail: 단일 재시도. 반복 장애면 지수 백오프로 승격.
    return await run();
  }
}

export async function getMentoringContent(mentoringId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  return prisma.mentoring.findUnique({
    where: { id: mentoringId },
    select: {
      content: true,
      improvements: true,
      weaknesses: true,
      nextGoals: true,
      notes: true,
      student: { select: { name: true, grade: true } },
    },
  });
}

export async function enhanceMentoringWithAI(mentoringId: string): Promise<EnhancedMentoringContent> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  const mentoring = await prisma.mentoring.findUnique({
    where: { id: mentoringId },
    select: {
      content: true,
      improvements: true,
      weaknesses: true,
      nextGoals: true,
      notes: true,
      student: { select: { name: true, grade: true } },
    },
  });
  if (!mentoring) throw new Error("멘토링을 찾을 수 없습니다");

  const prompt = buildMentoringEnhancePrompt(
    mentoring.student.name,
    mentoring.student.grade,
    mentoring,
  );
  if (!prompt) throw new Error("멘토링 내용을 먼저 작성해주세요");

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  let completion;
  try {
    completion = await callGroqWithRetry(groq, {
      model: GROQ_MODEL,
      temperature: 0.4,
      max_tokens: 4000,
      response_format: { type: "json_object" }, // Groq JSON 모드: 파싱 실패 방지
      messages: [
        { role: "system", content: prompt.systemPrompt },
        { role: "user", content: prompt.userPrompt },
      ],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const retryMatch = msg.match(/Please try again in (\d+h)?(\d+m)?(\d+[\d.]*s)?/);
    if (retryMatch || msg.includes("rate_limit") || msg.includes("Rate limit")) {
      let waitTime = "";
      if (retryMatch) {
        const h = retryMatch[1] ? parseInt(retryMatch[1]) : 0;
        const m = retryMatch[2] ? parseInt(retryMatch[2]) : 0;
        const parts = [];
        if (h > 0) parts.push(`${h}시간`);
        if (m > 0) parts.push(`${m}분`);
        waitTime = parts.length > 0 ? ` 약 ${parts.join(" ")} 후에` : " 잠시 후";
      } else {
        waitTime = " 잠시 후";
      }
      throw new Error(`AI 사용량 한도에 도달했습니다.${waitTime} 다시 시도해주세요.`);
    }
    // 실제 원인이 사라지지 않도록 서버 로그에 남긴다(generic 메시지만으론 디버깅 불가).
    console.error("[enhanceMentoringWithAI] Groq 호출 실패:", err);
    throw new Error("AI 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let enhanced: Partial<EnhancedMentoringContent>;
  try {
    enhanced = parseEnhancedJson(raw);
  } catch {
    throw new Error("AI 응답 파싱에 실패했습니다");
  }

  // AI 응답에 보존된 이미지 마크다운을 다시 붙여넣기 + 누락 항목 원본 폴백
  return finalizeEnhanced(enhanced, mentoring);
}

/**
 * 월간 멘토링 내용들을 기반으로 학부모 리포트용 종합 의견 생성.
 * 주요 내용, 개선점, 다음 목표를 통합하여 학부모 친화적 톤으로 요약.
 */
export async function generateMonthlyMentoringSummary(
  studentId: string,
  year: number,
  month: number
): Promise<string> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  // 월간 리포트 화면(/reports/monthly)은 전 직원 접근 가능 — 페이지와 동일 범위
  requireAnyStaff(session.user.role);

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const [student, mentorings] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      select: { name: true, grade: true },
    }),
    prisma.mentoring.findMany({
      where: {
        studentId,
        scheduledAt: { gte: start, lte: end },
        status: "COMPLETED",
      },
      select: {
        content: true,
        improvements: true,
        weaknesses: true,
        nextGoals: true,
        notes: true,
        scheduledAt: true,
      },
      orderBy: { scheduledAt: "asc" },
    }),
  ]);

  if (!student) throw new Error("학생을 찾을 수 없습니다");

  const prompt = buildMonthlyMentoringSummaryPrompt(
    student.name,
    student.grade,
    year,
    month,
    mentorings,
  );
  if (!prompt) {
    return `${year}년 ${month}월 진행된 멘토링이 없습니다.`;
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  try {
    const completion = await callGroqWithRetry(groq, {
      messages: [
        { role: "system", content: prompt.systemPrompt },
        { role: "user", content: prompt.userPrompt },
      ],
      model: GROQ_MODEL,
      temperature: 0.5,
    });

    return completion.choices[0]?.message?.content?.trim() ?? "";
  } catch (error) {
    const err = error as { status?: number; message?: string };
    if (err.status === 429) {
      throw new Error("AI 사용량 한도에 도달했습니다. 잠시 후 다시 시도해주세요.");
    }
    console.error("[generateMonthlyMentoringSummary] Groq 호출 실패:", error);
    // 외부 API 원문 에러는 서버 로그에만 남기고 클라이언트엔 일반 메시지만 전달
    throw new Error("AI 요약 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
}

const MAX_ENHANCED_FIELD_LEN = 20000;

function enhancedField(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  return v.slice(0, MAX_ENHANCED_FIELD_LEN);
}

export async function applyMentoringEnhancement(
  mentoringId: string,
  data: EnhancedMentoringContent
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  // 멘토링 수정 정책(updateMentoring)과 동일 — 자습실 스태프 이상
  requireStaff(session.user.role);

  await prisma.mentoring.update({
    where: { id: mentoringId },
    data: {
      content: enhancedField(data?.content),
      improvements: enhancedField(data?.improvements),
      weaknesses: enhancedField(data?.weaknesses),
      nextGoals: enhancedField(data?.nextGoals),
      notes: enhancedField(data?.notes),
    },
  });
}
