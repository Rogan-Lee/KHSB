"use server";

import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import Groq from "groq-sdk";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const ACADEMY_CONTEXT = `
[강한선배 관리형 독서실 운영 프로그램 정보]

1. 전담 멘토링 시스템
- 학생 1명당 전담 멘토 1명 배정 (대학생 멘토, 주 1~2회 1:1 멘토링)
- 학습 계획 수립, 취약 과목 분석, 공부법 코칭
- 멘토링 기록을 학부모에게 정기 피드백 발송

2. 원장 직접 관리
- 원장이 직접 학생별 학습 상태 파악 및 면담 진행
- 학부모 정기 상담 (월 1회 이상)
- 성적 추이 분석 및 맞춤 전략 제시

3. 플래너 & 학습 관리
- 매일 플래너 작성 → 조교 확인 → 실행률 체크
- 주간 학습 계획 수립 및 점검
- 휴대폰 수거 관리 (집중 환경 조성)

4. 출결 & 생활 관리
- 입퇴실 시간 실시간 관리
- 외출 기록 관리
- 상벌점 제도로 학습 동기 부여

5. 성적 분석
- 내신/모의고사 성적 추이 분석
- 과목별 취약점 진단
- 목표 대학 맞춤 전략 수립

6. 학부모 소통
- 카카오톡/이메일 정기 리포트
- 멘토링 결과 실시간 공유
- 학생 변화 및 성장 과정 공유
`;

export async function generateFollowUpMessage(consultationId: string) {
  const session = await getSession();

  const consultation = await prisma.directorConsultation.findUnique({
    where: { id: consultationId, orgId: session.orgId },
    include: {
      student: { select: { name: true, grade: true, school: true } },
    },
  });

  if (!consultation) throw new Error("면담 정보를 찾을 수 없습니다");

  const c = consultation as Record<string, unknown>;
  const name = (consultation.student?.name ?? c.prospectName as string) || "학생";
  const grade = (consultation.student?.grade ?? c.prospectGrade as string) || "";
  const school = consultation.student?.school || "";
  const category = (c.category as string) || "ENROLLED";
  const type = (c.type as string) || "STUDENT";

  const typeLabel = type === "PARENT" ? "학부모" : "학생";
  const recipient = type === "PARENT" ? `${name} ${typeLabel}님` : `${name} 학생`;

  const context = [
    `수신자: ${recipient}`,
    grade && `학년: ${grade}`,
    school && `학교: ${school}`,
    `상담 유형: ${type === "PARENT" ? "학부모 상담" : "학생 상담"}`,
    `상담 분류: ${{ ENROLLED: "재원생", NEW_ADMISSION: "신규 입실 예정", CONSIDERING: "등록 고민 중" }[category] ?? category}`,
    consultation.agenda && `\n[면담 주제]\n${consultation.agenda}`,
    consultation.outcome && `\n[면담 결과]\n${consultation.outcome}`,
    consultation.followUp && `\n[사후조치]\n${consultation.followUp}`,
    consultation.notes && `\n[메모]\n${consultation.notes}`,
  ].filter(Boolean).join("\n");

  const categoryInstruction = {
    CONSIDERING: `이 학생/학부모는 등록을 고민 중입니다. 다음을 구체적으로 포함하세요:
- 상담에서 파악한 학생의 고민/약점에 대해 우리 프로그램이 어떻게 해결해줄 수 있는지
- 전담 멘토링, 플래너 관리, 원장 직접 케어 등 구체적 프로그램 언급
- 비슷한 상황의 학생이 입실 후 어떻게 변화했는지 (구체적 사례 톤으로)
- 등록을 부드럽게 유도하되, "언제든 편하게 연락 주세요" 등 부담 없는 마무리
- 체험 수업이나 상담 재방문 제안도 좋음`,
    NEW_ADMISSION: `이 학생/학부모는 신규 입실 예정입니다. 다음을 포함하세요:
- 환영 인사와 입실 준비 안내
- 배정될 전담 멘토와 학습 관리 시스템 소개
- 첫 주에 어떤 과정으로 적응을 도울지 구체적으로
- 학부모가 안심할 수 있도록 소통 채널 안내`,
    ENROLLED: `이 재원생에 대한 팔로업입니다. 다음을 포함하세요:
- 상담에서 논의한 내용에 대한 후속 안내
- 멘토/원장이 어떻게 지원할 계획인지
- 학생의 성장과 변화에 대한 긍정적 피드백
- 추가 상담이 필요하면 언제든 연락 가능함을 안내`,
  }[category] ?? "";

  const systemPrompt = `당신은 학원(독서실/관리형 자습실) 원장 "강한지"입니다.
상담 내용을 바탕으로 카카오톡 팔로업 메시지를 작성합니다.

중요: 반드시 한글, 영어, 숫자, 이모지만 사용하세요. 한자(漢字)는 절대 포함하지 마세요. 예를 들어 "學習", "改善", "目標" 같은 한자를 쓰면 안 됩니다. 반드시 "학습", "개선", "목표"처럼 한글로 쓰세요.

${ACADEMY_CONTEXT}

[작성 규칙]
- 존댓말, 따뜻하면서도 전문적이고 신뢰감 있는 톤
- 카카오톡 메시지답게 자연스럽고 읽기 편한 문체
- 적절한 줄바꿈으로 가독성 확보
- 이모지는 자연스럽게 1~3개 정도만
- 500~800자 정도의 충분히 구체적인 메시지
- 학원 이름: "강한선배 관리형 독서실"
- 절대 한자(漢字)를 사용하지 마세요. 모든 내용은 한글과 숫자로만 작성하세요

[구조]
1. 인사 + 상담 감사
2. 상담에서 나온 핵심 내용 요약
3. 우리가 어떻게 도와줄 수 있는지 구체적으로 (프로그램 연결)
4. 따뜻한 마무리 + 연락처 안내

${categoryInstruction}`;

  const result = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `다음 상담 내용을 바탕으로 ${recipient}에게 보낼 카카오톡 팔로업 메시지를 작성해주세요.\n\n${context}` },
    ],
    temperature: 0.7,
    max_tokens: 1500,
  });

  return {
    message: result.choices[0]?.message?.content?.trim() ?? "",
    recipientName: recipient,
    consultationId,
  };
}
