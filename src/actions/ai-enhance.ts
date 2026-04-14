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

  // 이미지 마크다운을 필드별로 추출 (AI가 이미지를 제거하므로 보존)
  const imagePattern = /!\[.*?\]\(.*?\)/g;
  const extractImages = (text: string | null) => text?.match(imagePattern) ?? [];
  const stripImages = (text: string | null) => text?.replace(imagePattern, "").trim() ?? null;

  const imagesByField = {
    content: extractImages(mentoring.content),
    improvements: extractImages(mentoring.improvements),
    weaknesses: extractImages(mentoring.weaknesses),
    nextGoals: extractImages(mentoring.nextGoals),
    notes: extractImages(mentoring.notes),
  };

  const rawContent = [
    stripImages(mentoring.content) && `[오늘 멘토링 내용]\n${stripImages(mentoring.content)}`,
    stripImages(mentoring.improvements) && `[개선된 점]\n${stripImages(mentoring.improvements)}`,
    stripImages(mentoring.weaknesses) && `[보완할 점]\n${stripImages(mentoring.weaknesses)}`,
    stripImages(mentoring.nextGoals) && `[다음 멘토링 목표]\n${stripImages(mentoring.nextGoals)}`,
    stripImages(mentoring.notes) && `[기타 메모]\n${stripImages(mentoring.notes)}`,
  ].filter(Boolean).join("\n\n");

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  let completion;
  try {
    completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.4,
    max_tokens: 4000,
    messages: [
      {
        role: "system",
        content: `당신은 학부모 소통을 전담하는 입시 관리 전문가이자 교육 컨설턴트입니다.
멘토가 작성한 간략한 메모를 학부모님께 전달할 전문적이고 상세한 멘토링 리포트로 작성하는 역할을 합니다.

반드시 지켜야 할 규칙:
- 원본에 있는 사실과 내용만 기반으로 합니다. 원본에 없는 새로운 사실이나 학습 내용을 날조하지 않습니다.
- 단, 원본에 언급된 내용을 교육 전문가의 관점에서 구체적이고 풍부하게 풀어서 설명합니다.
  예: "수학 진도 나감" → 해당 학습 과정에서 어떤 부분을 다루었는지, 학생의 이해도와 참여도를 전문적으로 서술
  예: "영어 단어 시험" → 어휘력 평가를 실시한 맥락, 결과에 대한 분석, 향후 학습 방향을 포함
- 각 항목을 최소 2~3문장 이상으로 충실하게 작성합니다. 한 줄짜리 메모도 전문적 리포트 수준으로 확장합니다.
- "~하였습니다", "~드립니다" 등 정중하고 격식 있는 서술체를 사용합니다.
- 학부모님이 읽었을 때 자녀의 학습 상황을 구체적으로 파악하고, 전문적인 관리를 받고 있다고 신뢰할 수 있도록 작성합니다.
- 맞춤법과 문장 부호를 교정합니다.
- 한자(漢字)나 영어 단어는 반드시 한국어로 변환합니다. 한자를 절대 사용하지 않습니다.
- 반드시 JSON 형식으로만 응답합니다.`,
      },
      {
        role: "user",
        content: `학생: ${mentoring.student.name} (${mentoring.student.grade})

아래 멘토의 간략한 메모를 바탕으로, 학부모님께 전달할 전문적이고 상세한 멘토링 리포트를 작성해 주세요.

작성 지침:
1. 원본 메모에 언급된 사실을 기반으로 내용을 풍부하고 구체적으로 확장해 주세요.
2. 교육 전문가가 학부모님께 보내는 격식 있는 리포트 톤으로 작성해 주세요.
3. 각 항목은 최소 2~3문장 이상으로, 학생의 학습 과정과 성과를 구체적으로 서술해 주세요.
4. 원본에 없는 내용을 날조하지 마세요. 원본에 있는 내용을 전문적으로 풀어쓰는 것입니다.

원본 메모:
${rawContent}

JSON 형식으로만 응답하세요 (원본이 없는 항목은 null):
{
  "content": "전문적으로 확장한 오늘 멘토링 내용 또는 null",
  "improvements": "전문적으로 확장한 개선된 점 또는 null",
  "weaknesses": "전문적으로 확장한 보완할 점 또는 null",
  "nextGoals": "전문적으로 확장한 다음 멘토링 목표 또는 null",
  "notes": "전문적으로 확장한 기타 메모 또는 null"
}`,
      },
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
    throw new Error("AI 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }

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

  // AI 응답에 보존된 이미지 마크다운을 다시 붙여넣기
  const reattachImages = (text: string | null, images: string[]) => {
    if (!text || images.length === 0) return text;
    return text + "\n\n" + images.join("\n");
  };

  return {
    content: reattachImages(enhanced.content ?? mentoring.content, imagesByField.content),
    improvements: reattachImages(enhanced.improvements ?? mentoring.improvements, imagesByField.improvements),
    weaknesses: reattachImages(enhanced.weaknesses ?? mentoring.weaknesses, imagesByField.weaknesses),
    nextGoals: reattachImages(enhanced.nextGoals ?? mentoring.nextGoals, imagesByField.nextGoals),
    notes: reattachImages(enhanced.notes ?? mentoring.notes, imagesByField.notes),
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
