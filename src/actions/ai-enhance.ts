"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Groq from "groq-sdk";

export interface EnhancedMentoringContent {
  content: string | null;
  improvements: string | null;
  weaknesses: string | null;
  nextGoals: string | null;
  notes: string | null;
}

export async function getMentoringContent(mentoringId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

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

  const hasContent = [
    mentoring.content,
    mentoring.improvements,
    mentoring.weaknesses,
    mentoring.nextGoals,
    mentoring.notes,
  ].some(Boolean);
  if (!hasContent) throw new Error("멘토링 내용을 먼저 작성해주세요");

  const rawContent = [
    mentoring.content && `[오늘 멘토링 내용]\n${mentoring.content}`,
    mentoring.improvements && `[개선된 점]\n${mentoring.improvements}`,
    mentoring.weaknesses && `[보완할 점]\n${mentoring.weaknesses}`,
    mentoring.nextGoals && `[다음 멘토링 목표]\n${mentoring.nextGoals}`,
    mentoring.notes && `[기타 메모]\n${mentoring.notes}`,
  ].filter(Boolean).join("\n\n");

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.6,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `당신은 15년 경력의 대한민국 최고 입시 컨설턴트입니다. 멘토가 작성한 멘토링 기록을 바탕으로 학부모님께 전달할 전문적이고 따뜻한 리포트를 작성합니다.

작성 규칙:
- 맞춤법과 문법을 정확하게 교정합니다
- 전문적이면서도 학부모가 이해하기 쉬운 언어를 사용합니다
- 학생의 성장 가능성과 노력을 긍정적으로 강조합니다
- 추상적인 표현 대신 구체적인 내용으로 서술합니다
- 입시 컨설팅 전문가다운 신뢰감 있는 어투를 사용합니다
- 원본의 핵심 내용은 반드시 유지합니다
- 없는 내용은 만들어내지 않습니다
- 반드시 JSON 형식으로만 응답합니다`,
      },
      {
        role: "user",
        content: `다음 멘토링 기록을 전문적인 학부모 리포트 형식으로 다듬어주세요.
해당 항목의 원본이 없으면 null을 반환하세요.

학생: ${mentoring.student.name} (${mentoring.student.grade})

원본 내용:
${rawContent}

다음 JSON 형식으로 응답하세요:
{
  "content": "다듬어진 오늘 멘토링 내용 또는 null",
  "improvements": "다듬어진 개선된 점 또는 null",
  "weaknesses": "다듬어진 보완할 점 또는 null",
  "nextGoals": "다듬어진 다음 멘토링 목표 또는 null",
  "notes": "다듬어진 기타 메모 또는 null"
}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let enhanced: Partial<EnhancedMentoringContent>;
  try {
    enhanced = JSON.parse(raw);
  } catch {
    throw new Error("AI 응답 파싱에 실패했습니다");
  }

  return {
    content: enhanced.content ?? mentoring.content,
    improvements: enhanced.improvements ?? mentoring.improvements,
    weaknesses: enhanced.weaknesses ?? mentoring.weaknesses,
    nextGoals: enhanced.nextGoals ?? mentoring.nextGoals,
    notes: enhanced.notes ?? mentoring.notes,
  };
}

export async function applyMentoringEnhancement(
  mentoringId: string,
  data: EnhancedMentoringContent
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.mentoring.update({
    where: { id: mentoringId },
    data: {
      content: data.content ?? undefined,
      improvements: data.improvements ?? undefined,
      weaknesses: data.weaknesses ?? undefined,
      nextGoals: data.nextGoals ?? undefined,
      notes: data.notes ?? undefined,
    },
  });
}
