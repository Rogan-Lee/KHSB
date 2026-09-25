// 태블릿: 새 질문 등록 화면에서 돌아오면 질문 탭이 방금 만든 질문을 오른쪽 패널에 연다.
// (폰은 등록 직후 질문 상세로 바로 이동하므로 쓰지 않는다)

let createdQuestionId: string | null = null;

export function markCreatedQuestion(id: string) {
  createdQuestionId = id;
}

export function takeCreatedQuestion(): string | null {
  const id = createdQuestionId;
  createdQuestionId = null;
  return id;
}
