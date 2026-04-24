"use server";

import { revalidatePath } from "next/cache";
import Groq from "groq-sdk";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireManagerMentor } from "@/lib/roles";
import { KAKAO_LOG_TAGS } from "@/lib/online/kakao-tags";

const VALID_TAGS = new Set<string>(KAKAO_LOG_TAGS);

/**
 * 학생×날짜 unique upsert. summary 는 필수.
 * rawContent + aiSummarized 를 선택적으로 함께 저장.
 * 관리 멘토 또는 FullAccess 만 호출.
 */
export async function upsertDailyKakaoLog(params: {
  studentId: string;
  logDate: string; // "YYYY-MM-DD"
  summary: string;
  tags: string[];
  isParentVisible: boolean;
  rawContent?: string | null;
  aiSummarized?: boolean;
}) {
  const session = await auth();
  requireManagerMentor(session?.user?.role);

  if (!params.summary.trim()) {
    throw new Error("요약을 입력하세요");
  }

  const student = await prisma.student.findUnique({
    where: { id: params.studentId },
    select: { id: true, isOnlineManaged: true },
  });
  if (!student || !student.isOnlineManaged) {
    throw new Error("온라인 관리 학생을 찾을 수 없습니다");
  }

  const cleanTags = params.tags.filter((t) => VALID_TAGS.has(t));
  const logDateOnly = new Date(params.logDate + "T00:00:00.000Z");

  await prisma.dailyKakaoLog.upsert({
    where: {
      studentId_logDate: { studentId: params.studentId, logDate: logDateOnly },
    },
    update: {
      summary: params.summary.trim(),
      tags: cleanTags,
      isParentVisible: params.isParentVisible,
      rawContent: params.rawContent ?? undefined,
      aiSummarized: params.aiSummarized ?? undefined,
    },
    create: {
      studentId: params.studentId,
      logDate: logDateOnly,
      summary: params.summary.trim(),
      tags: cleanTags,
      isParentVisible: params.isParentVisible,
      rawContent: params.rawContent ?? null,
      aiSummarized: params.aiSummarized ?? false,
      authorId: session!.user.id,
    },
  });

  revalidatePath("/online/daily-log");
  revalidatePath(`/online/students/${params.studentId}/daily-log`);
  revalidatePath(`/online/students/${params.studentId}`);
}

/**
 * 특정 날짜 로그 삭제 (잘못 기록 시). 본인 작성분만 또는 FullAccess.
 */
export async function deleteDailyKakaoLog(logId: string) {
  const session = await auth();
  requireManagerMentor(session?.user?.role);

  const log = await prisma.dailyKakaoLog.findUnique({
    where: { id: logId },
    select: { id: true, studentId: true, authorId: true },
  });
  if (!log) throw new Error("기록을 찾을 수 없습니다");

  const isAuthor = log.authorId === session!.user.id;
  const isFull =
    session!.user.role === "DIRECTOR" || session!.user.role === "SUPER_ADMIN";
  if (!isAuthor && !isFull) {
    throw new Error("본인 작성 기록만 삭제할 수 있습니다");
  }

  await prisma.dailyKakaoLog.delete({ where: { id: logId } });
  revalidatePath("/online/daily-log");
  revalidatePath(`/online/students/${log.studentId}/daily-log`);
}

/**
 * 카톡 원문을 Groq 로 요약 + 태그 추천.
 * UI 의 "원문 붙여넣기 모드" 에서 호출. DB 저장은 하지 않음 — 호출자가
 * 반환값을 draft 상태에 반영 후 별도 upsertDailyKakaoLog 호출.
 */
export async function summarizeKakaoRaw(params: {
  rawContent: string;
  studentName?: string;
}): Promise<{ summary: string; tags: string[] }> {
  const session = await auth();
  requireManagerMentor(session?.user?.role);

  if (!params.rawContent.trim() || params.rawContent.length > 20000) {
    throw new Error("원문은 1 ~ 20000자 사이여야 합니다");
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const allowedTags = KAKAO_LOG_TAGS.join(", ");

  const systemPrompt =
    "너는 관리형 독서실 관리 멘토가 학생과 나눈 카카오톡 대화 원문을 정리하는 조력자야. " +
    "원문을 읽고 핵심을 2~3문장의 정중한 한국어로 요약하고, 허용 태그 리스트에서 관련된 태그만 선별해서 반환해. " +
    `허용 태그: [${allowedTags}]. 이 외 태그는 반환 금지. ` +
    '반드시 유효한 JSON 객체만 출력. 형식: {"summary": "...", "tags": ["태그1", "태그2"]}. ' +
    "설명이나 코드펜스 없이 JSON 만.";

  const userPrompt =
    (params.studentName ? `학생: ${params.studentName}\n\n` : "") +
    `카카오톡 대화 원문:\n${params.rawContent}`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) throw new Error("빈 응답");

    let parsed: { summary?: unknown; tags?: unknown };
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("AI 응답이 JSON 형식이 아닙니다");
    }

    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const rawTags = Array.isArray(parsed.tags) ? parsed.tags : [];
    const tags = rawTags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter((t) => VALID_TAGS.has(t));

    if (!summary) throw new Error("요약이 비어 있습니다");
    return { summary, tags };
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e?.status === 429) {
      throw new Error("AI 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요");
    }
    throw new Error(`AI 요약 실패: ${e.message ?? "알 수 없는 오류"}`);
  }
}
