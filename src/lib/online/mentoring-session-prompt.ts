// 화상 1:1 관리 세션 노트 → 일일 보고용 구조화 요약 변환 prompt.
// Groq LLaMA 3.3 70B 와 호환되도록 system + user 분리.

export type MentoringSessionPromptInputs = {
  studentName: string;
  studentGrade: string;
  hostName: string;
  scheduledAt: Date;
  durationMinutes: number;
  notes: string;
};

export function buildMentoringSessionPrompt(inputs: MentoringSessionPromptInputs): {
  systemPrompt: string;
  userPrompt: string;
} {
  const dateLabel = inputs.scheduledAt.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const systemPrompt = [
    "당신은 한국의 입시 관리 학원에서 일하는 베테랑 멘토입니다.",
    "학생과 1:1 화상 세션을 마친 호스트가 작성한 노트를 받아,",
    "학생 일일 보고 형식의 정돈된 한국어 요약을 만듭니다.",
    "",
    "출력 규칙:",
    "- 한국어 markdown",
    "- 섹션 제목은 굵게(**...**), 본문은 짧은 문장 또는 불릿",
    "- 다음 4개 섹션을 항상 포함하되, 노트에 내용이 없으면 '특이사항 없음' 으로 표기:",
    "  1. **이번 세션 요지** — 2~4 문장으로 핵심 정리",
    "  2. **학습 진행 상황** — 과목·진도·이슈",
    "  3. **다음 액션** — 학생이 해야 할 것 / 호스트가 챙길 것 (체크박스 - [ ] 형식)",
    "  4. **참고 메모** — 호스트가 향후 참고할 만한 내용 (없으면 생략 가능)",
    "- 길이는 200~600자 사이.",
    "- 호스트 이름이나 시간 등 메타데이터는 본문에 다시 쓰지 않음 (이미 다른 곳에서 보여짐).",
    "- 노트가 너무 짧거나 비어 있으면 '추가 작성 필요' 라고만 응답.",
  ].join("\n");

  const userPrompt = [
    `# 화상 세션 정보`,
    `- 학생: ${inputs.studentName} (${inputs.studentGrade})`,
    `- 호스트: ${inputs.hostName}`,
    `- 일시: ${dateLabel} (${inputs.durationMinutes}분)`,
    ``,
    `# 호스트 작성 노트 (원본)`,
    inputs.notes.trim() || "(노트 없음)",
    ``,
    `위 노트를 기반으로 시스템 규칙대로 일일 보고 형식의 요약을 작성해 주세요.`,
  ].join("\n");

  return { systemPrompt, userPrompt };
}
