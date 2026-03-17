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
    temperature: 0.3,
    max_tokens: 1500,
    messages: [
      {
        role: "system",
        content: `당신은 학부모 소통을 전담하는 입시 관리 전문가입니다.
멘토가 작성한 메모를 학부모님께 전달하기 좋은 문체로 다듬는 역할을 합니다.

반드시 지켜야 할 규칙:
- 원본에 있는 사실과 내용만 사용합니다. 새로운 정보를 절대 추가하지 않습니다.
- 맞춤법과 문장 부호를 교정합니다.
- 구어체나 메모 형식을 "~하였습니다", "~드립니다" 같은 정중한 서술체로 바꿉니다.
- 원본이 짧더라도 억지로 늘리지 않습니다. 원본 분량을 크게 벗어나지 않게 합니다.
- 한자나 영어 단어는 한국어로 변환합니다.
- 반드시 JSON 형식으로만 응답합니다.`,
      },
      {
        role: "user",
        content: `학생: ${mentoring.student.name} (${mentoring.student.grade})

아래 멘토 메모를 학부모님께 전달할 정중한 서술체로 다듬어 주세요.
원본의 내용과 사실은 그대로 유지하고, 표현과 문체만 다듬어 주세요.

원본 메모:
${rawContent}

JSON 형식으로만 응답하세요 (원본이 없는 항목은 null):
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
  // ```json ... ``` 블록이 포함된 경우 추출
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : raw;
  let enhanced: Partial<EnhancedMentoringContent>;
  try {
    enhanced = JSON.parse(jsonStr.trim());
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
