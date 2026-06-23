// 리포트 AI 텍스트 생성용 순수 프롬프트 빌더/포맷터 (서버 전용, "use server" 아님).
//
// 동기 버튼(ai-enhance.ts)과 야간 큐(report-ai-queue.ts)가 "같은 프롬프트"를 공유하도록
// 여기로 추출한다. "use server" 모듈은 async 함수만 export 할 수 있으므로 순수 함수는
// 반드시 이 일반 lib 에 둔다.

export interface MentoringFields {
  content: string | null;
  improvements: string | null;
  weaknesses: string | null;
  nextGoals: string | null;
  notes: string | null;
}

export interface EnhancedMentoringContent {
  content: string | null;
  improvements: string | null;
  weaknesses: string | null;
  nextGoals: string | null;
  notes: string | null;
}

// ── 이미지 마크다운 보존 헬퍼 ──────────────────────────────
const IMAGE_PATTERN = /!\[.*?\]\(.*?\)/g;
export const extractImages = (text: string | null): string[] =>
  text?.match(IMAGE_PATTERN) ?? [];
export const stripImages = (text: string | null): string | null =>
  text?.replace(IMAGE_PATTERN, "").trim() ?? null;
export const reattachImages = (
  text: string | null,
  images: string[],
): string | null => {
  if (!text || images.length === 0) return text;
  return text + "\n\n" + images.join("\n");
};

// ── 멘토링 코멘트(학부모 리포트 customNote) 고도화 프롬프트 ──────
// enhanceMentoringWithAI 와 동일한 JSON 산출 프롬프트. 루틴이 이 프롬프트로
// 생성하면 동기 버튼과 결과가 일치한다.
export function buildMentoringEnhancePrompt(
  studentName: string,
  grade: string,
  fields: MentoringFields,
): { systemPrompt: string; userPrompt: string } | null {
  const rawContent = [
    stripImages(fields.content) && `[오늘 멘토링 내용]\n${stripImages(fields.content)}`,
    stripImages(fields.improvements) && `[개선된 점]\n${stripImages(fields.improvements)}`,
    stripImages(fields.weaknesses) && `[보완할 점]\n${stripImages(fields.weaknesses)}`,
    stripImages(fields.nextGoals) && `[다음 멘토링 목표]\n${stripImages(fields.nextGoals)}`,
    stripImages(fields.notes) && `[기타 메모]\n${stripImages(fields.notes)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!rawContent) return null;

  const systemPrompt = `당신은 학부모 소통을 전담하는 입시 관리 전문가이자 교육 컨설턴트입니다.
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
- 반드시 JSON 형식으로만 응답합니다.`;

  const userPrompt = `학생: ${studentName} (${grade})

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
}`;

  return { systemPrompt, userPrompt };
}

/** AI 응답(JSON 문자열)을 파싱. ```json``` 블록도 허용. 실패 시 throw. */
export function parseEnhancedJson(raw: string): Partial<EnhancedMentoringContent> {
  const jsonMatch =
    raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : raw;
  return JSON.parse(jsonStr.trim());
}

/** 파싱된 결과에 원본 이미지 마크다운을 재부착하고, 누락 항목은 원본으로 폴백. */
export function finalizeEnhanced(
  enhanced: Partial<EnhancedMentoringContent>,
  fields: MentoringFields,
): EnhancedMentoringContent {
  const imagesByField = {
    content: extractImages(fields.content),
    improvements: extractImages(fields.improvements),
    weaknesses: extractImages(fields.weaknesses),
    nextGoals: extractImages(fields.nextGoals),
    notes: extractImages(fields.notes),
  };
  return {
    content: reattachImages(enhanced.content ?? fields.content, imagesByField.content),
    improvements: reattachImages(enhanced.improvements ?? fields.improvements, imagesByField.improvements),
    weaknesses: reattachImages(enhanced.weaknesses ?? fields.weaknesses, imagesByField.weaknesses),
    nextGoals: reattachImages(enhanced.nextGoals ?? fields.nextGoals, imagesByField.nextGoals),
    notes: reattachImages(enhanced.notes ?? fields.notes, imagesByField.notes),
  };
}

/** 고도화 결과를 학부모 리포트 customNote 용 섹션 텍스트로 포맷 (탭 UI 와 동일). */
export function formatEnhancedAsNote(d: EnhancedMentoringContent): string {
  return [
    d.content && `[오늘 멘토링 내용]\n${d.content}`,
    d.improvements && `[개선된 점]\n${d.improvements}`,
    d.weaknesses && `[보완할 점]\n${d.weaknesses}`,
    d.nextGoals && `[다음 멘토링 목표]\n${d.nextGoals}`,
    d.notes && `[기타 메모]\n${d.notes}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ── 본원 월간 '멘토링 종합 의견' 프롬프트 ──────────────────
export type MentoringForSummary = MentoringFields;

/** 월간 멘토링 기록들 → 종합 의견 프롬프트. 기록 없으면 null. */
export function buildMonthlyMentoringSummaryPrompt(
  studentName: string,
  grade: string,
  year: number,
  month: number,
  mentorings: MentoringForSummary[],
): { systemPrompt: string; userPrompt: string } | null {
  if (mentorings.length === 0) return null;

  const mentoringText = mentorings
    .map((m, i) => {
      const parts: string[] = [`[${i + 1}회차]`];
      if (m.content) parts.push(`내용: ${m.content}`);
      if (m.improvements) parts.push(`개선점: ${m.improvements}`);
      if (m.weaknesses) parts.push(`보완점: ${m.weaknesses}`);
      if (m.nextGoals) parts.push(`목표: ${m.nextGoals}`);
      return parts.join("\n");
    })
    .join("\n\n");

  const systemPrompt =
    "너는 학원 관리자가 학부모에게 전달할 월간 멘토링 종합 의견을 작성하는 조력자야. " +
    "개별 멘토링 기록을 바탕으로 한 달 간의 학습 흐름, 성장한 점, 보완할 점, 다음 달 목표를 담아 " +
    "3~5문장의 자연스러운 한국어 단락으로 요약해줘. 이미지 마크다운은 포함하지 마.";

  const userPrompt = `${studentName}(${grade}) 학생의 ${year}년 ${month}월 멘토링 기록:\n\n${mentoringText}\n\n위 내용을 바탕으로 학부모에게 전달할 월간 종합 의견을 작성해줘.`;

  return { systemPrompt, userPrompt };
}
