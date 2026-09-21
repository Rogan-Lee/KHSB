/**
 * 모바일 학생 앱 데모 시드 — 로그인 가능한 데모 학생 1명 + 전 화면 풍성한 더미 데이터.
 * DEV DB 전용. 실행: DATABASE_URL="$DATABASE_URL_DEV" npx tsx scripts/seed-mobile-demo.ts
 * 재실행 시 demo- 네임스페이스 데이터만 지우고 다시 만든다(멱등).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createOpaqueToken, hashAuthToken } from "../src/lib/auth-tokens";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const SID = "demo-student-01";
const CONSULTANT = "demo-staff-consultant";
const MENTOR = "demo-staff-mentor";
const DIRECTOR = "demo-staff-director";

const now = new Date();
const day = (d: number) => new Date(now.getTime() + d * 86400_000);
const hour = (h: number) => new Date(now.getTime() + h * 3600_000);
const img = (id: number) => ({
  url: `https://picsum.photos/id/${id}/900/1200`,
  name: `문제_${id}.jpg`,
  sizeBytes: 240_000,
  mimeType: "image/jpeg",
});
const doc = (name: string) => ({
  url: "https://file-examples.com/storage/fe/2017/10/file-sample_150kB.pdf",
  name,
  sizeBytes: 153_600,
  mimeType: "application/pdf",
});

async function main() {
  // ── 1. 스태프 ──────────────────────────────────────────────
  const staff = [
    { id: CONSULTANT, email: "consultant@demo.khsb", name: "박서연", role: "CONSULTANT" },
    { id: MENTOR, email: "mentor@demo.khsb", name: "김도윤", role: "MANAGER_MENTOR" },
    { id: DIRECTOR, email: "director@demo.khsb", name: "정원장", role: "DIRECTOR" },
  ];
  for (const s of staff) {
    await prisma.user.upsert({ where: { id: s.id }, update: s, create: s });
  }

  // ── 2. 학생 ────────────────────────────────────────────────
  const studentData = {
    name: "이지우",
    grade: "고2",
    school: "강서고등학교",
    classGroup: "정규반",
    seat: "B-07",
    phone: "010-2847-1193",
    parentPhone: "010-9921-4408",
    parentEmail: "parent.jiwoo@demo.khsb",
    startDate: day(-210),
    status: "ACTIVE",
    isOnlineManaged: true,
    onlineStartedAt: day(-180),
    targetUniversity: "연세대 경영학과",
    admissionType: "수시 학종 + 정시",
    internalScoreRange: "1~2등급",
    mockScoreRange: "2~3등급",
    selectedSubjects: "국어, 수학, 영어, 생활과윤리, 사회·문화",
    koreanElective: "언어와매체",
    mathElective: "확률과통계",
    inquiry1Subject: "생활과윤리",
    inquiry2Subject: "사회·문화",
    onlineLectures: "메가스터디 수학(현우진), 이투스 영어",
    mentoringNotes: "저녁 시간대 집중력 저하 — 오전 학습 비중 권장",
    studentInfo: "성실하나 수학 오답노트 관리가 약함. 주간 계획 준수율 높음.",
    assignedConsultantId: CONSULTANT,
    assignedMentorId: MENTOR,
    mentorId: MENTOR,
  };
  await prisma.student.upsert({
    where: { id: SID },
    update: studentData,
    create: { id: SID, ...studentData },
  });

  // ── 3. 기존 데모 콘텐츠 정리(멱등) ─────────────────────────
  await prisma.taskFeedback.deleteMany({ where: { submission: { studentId: SID } } });
  await prisma.taskSubmission.deleteMany({ where: { studentId: SID } });
  await prisma.taskResult.deleteMany({ where: { studentId: SID } });
  await prisma.performanceTask.deleteMany({ where: { studentId: SID } });
  await prisma.mentoringSession.deleteMany({ where: { studentId: SID } });
  await prisma.studentQuestion.deleteMany({ where: { studentId: SID } });
  await prisma.studentSuggestion.deleteMany({ where: { studentId: SID } });
  await prisma.onboardingSurvey.deleteMany({ where: { studentId: SID } });
  await prisma.vocabAttempt.deleteMany({ where: { studentId: SID } });
  await prisma.portalChat.deleteMany({ where: { studentId: SID } });
  await prisma.vocabExam.deleteMany({ where: { createdById: "demo-vocab" } });
  await prisma.vocabBook.deleteMany({ where: { createdById: "demo-vocab" } });

  // ── 4. 수행평가 과제 + 제출 + 피드백 + 결과 ────────────────
  type T = {
    subject: string; title: string; due: number; status: string;
    desc?: string; weight?: number; format?: string;
    subs?: { ver: number; note?: string; files?: any[]; ago: number;
      fbs?: { author: string; content: string; status: string; read?: boolean; ago: number }[] }[];
    result?: { score: string; summary: string };
  };
  const tasks: T[] = [
    {
      subject: "통합사회", title: "지역 불평등 탐구 보고서", due: -3, status: "DONE",
      desc: "우리 지역의 공간 불평등 사례를 조사하고 해결 방안을 제시", weight: 20, format: "보고서",
      subs: [
        { ver: 1, ago: -14, note: "1차 초안입니다", files: [doc("지역불평등_초안.pdf")],
          fbs: [{ author: CONSULTANT, content: "사례는 좋은데 통계 출처를 각주로 달아주세요.", status: "NEEDS_REVISION", read: true, ago: -12 }] },
        { ver: 2, ago: -6, note: "출처 보강했습니다", files: [doc("지역불평등_최종.pdf")],
          fbs: [{ author: CONSULTANT, content: "훨씬 좋아졌어요. 최종 승인합니다 👍", status: "APPROVED", read: true, ago: -5 }] },
      ],
      result: { score: "A (95%)", summary: "출처 보강 후 완성도 높음. 세특 기재 추천." },
    },
    {
      subject: "생활과윤리", title: "생명윤리 토론 개요서", due: 2, status: "NEEDS_REVISION",
      desc: "안락사 찬반 토론을 위한 논거 정리", weight: 15, format: "개인과제",
      subs: [
        { ver: 1, ago: -2, note: "찬성 측 논거 정리했습니다", files: [doc("안락사_개요.pdf")],
          fbs: [{ author: CONSULTANT, content: "반대 측 반론에 대한 재반박이 빠졌어요. 보완 부탁해요.", status: "NEEDS_REVISION", read: false, ago: -1 }] },
      ],
    },
    {
      subject: "국어", title: "현대시 비평문", due: 5, status: "SUBMITTED",
      desc: "김수영 「폭포」 비평문 800자", weight: 10, format: "개인과제",
      subs: [
        { ver: 1, ago: -1, note: "제출합니다!", files: [doc("폭포_비평문.pdf")],
          fbs: [{ author: CONSULTANT, content: "잘 받았어요. 이번 주 내로 피드백 드릴게요.", status: "COMMENT", read: false, ago: 0 }] },
      ],
    },
    {
      subject: "수학", title: "확통 단원 정리 노트", due: 8, status: "IN_PROGRESS",
      desc: "경우의 수 ~ 조건부확률 개념 정리", weight: 10, format: "개인과제",
    },
    {
      subject: "사회·문화", title: "사회 계층 구조 발표자료", due: 12, status: "OPEN",
      desc: "계층 이동 사례 조사 후 5분 발표", weight: 15, format: "발표",
    },
    {
      subject: "영어", title: "TED 요약 에세이", due: -1, status: "OPEN",
      desc: "관심 분야 TED 영상 하나를 골라 영어 요약", weight: 10, format: "개인과제",
    },
  ];

  for (const t of tasks) {
    const task = await prisma.performanceTask.create({
      data: {
        studentId: SID, subject: t.subject, title: t.title, dueDate: day(t.due),
        description: t.desc, scoreWeight: t.weight, format: t.format,
        status: t.status, createdById: CONSULTANT,
      },
    });
    for (const s of t.subs ?? []) {
      const sub = await prisma.taskSubmission.create({
        data: {
          taskId: task.id, studentId: SID, version: s.ver, note: s.note,
          files: s.files ?? [], submittedAt: day(s.ago),
        },
      });
      for (const f of s.fbs ?? []) {
        await prisma.taskFeedback.create({
          data: {
            submissionId: sub.id, authorId: f.author, content: f.content,
            status: f.status, createdAt: day(f.ago),
            readByStudentAt: f.read ? day(f.ago + 0.2) : null,
          },
        });
      }
    }
    if (t.result) {
      await prisma.taskResult.create({
        data: {
          taskId: task.id, studentId: SID, score: t.result.score,
          consultantSummary: t.result.summary, includeInReport: true,
          finalFiles: [], finalizedAt: day(t.due),
        },
      });
    }
  }

  // ── 5. 멘토링 세션 ─────────────────────────────────────────
  await prisma.mentoringSession.create({
    data: {
      studentId: SID, hostId: MENTOR, title: "주간 학습 점검 세션",
      scheduledAt: hour(20), durationMinutes: 30, status: "SCHEDULED",
      meetUrl: "https://meet.google.com/demo-jiwoo-001",
    },
  });
  await prisma.mentoringSession.create({
    data: {
      studentId: SID, hostId: MENTOR, title: "지난주 학습 점검 세션",
      scheduledAt: day(-4), durationMinutes: 30, status: "COMPLETED",
      notes: "수학 진도 지연. 오답노트 습관화 필요.",
      summary: "이번 주 목표 80% 달성. 수학 오답 정리 루틴 합의.",
      summarizedAt: day(-4),
    },
  });

  // ── 6. Q&A ─────────────────────────────────────────────────
  const questions = [
    {
      title: "확률 조건부 문제 질문", subject: "수학", status: "ANSWERED", unread: true,
      last: -1,
      msgs: [
        { who: "STUDENT", content: "이 문제 3번 풀이가 이해가 안 돼요. 왜 여사건으로 접근하나요?", att: [img(20)], ago: -2 },
        { who: "STAFF", content: "직접 세면 경우가 너무 많아서예요. 여사건이 훨씬 빨라요. 사진으로 풀이 첨부할게요.", att: [img(30)], ago: -1 },
      ],
    },
    {
      title: "언매 문법 개념 질문", subject: "국어", status: "ANSWERED", unread: false, last: -3,
      msgs: [
        { who: "STUDENT", content: "음운 변동에서 교체랑 축약 구분이 헷갈려요.", ago: -4 },
        { who: "STAFF", content: "교체는 개수 유지, 축약은 개수 감소로 외우면 편해요!", ago: -3 },
      ],
    },
    {
      title: "생윤 킬러문항 접근법", subject: "탐구", status: "OPEN", unread: false, last: -1,
      msgs: [{ who: "STUDENT", content: "롤스랑 노직 비교 선지가 항상 틀려요. 팁 있을까요?", ago: -1 }],
    },
    {
      title: "영어 빈칸 추론 질문", subject: "영어", status: "RESOLVED", unread: false, last: -8,
      msgs: [
        { who: "STUDENT", content: "빈칸 추론 시간이 너무 오래 걸려요.", ago: -9 },
        { who: "STAFF", content: "연결어 먼저 보는 습관 들이면 빨라져요. 자료 드릴게요.", ago: -8 },
      ],
    },
  ];
  for (const q of questions) {
    await prisma.studentQuestion.create({
      data: {
        studentId: SID, title: q.title, subject: q.subject, status: q.status,
        claimedById: q.status !== "OPEN" ? MENTOR : null,
        lastMessageAt: day(q.last),
        studentReadAt: q.unread ? day(q.last - 1) : day(q.last),
        messages: {
          create: q.msgs.map((m) => ({
            senderType: m.who,
            senderUserId: m.who === "STAFF" ? MENTOR : null,
            content: m.content, attachments: m.att ?? [], createdAt: day(m.ago),
          })),
        },
      },
    });
  }

  // ── 7. 건의사항 ────────────────────────────────────────────
  const suggestions = [
    { category: "FACILITY", title: "3층 정수기 온수 안 나와요", content: "3층 정수기 온수가 며칠째 안 나옵니다. 점검 부탁드려요.",
      status: "REFLECTED", reply: "정수기 업체 점검 완료했습니다. 이용에 불편 드려 죄송해요!", handled: -2, unseen: true },
    { category: "OPERATION", title: "자습실 냉방 조금만 낮춰주세요", content: "오후에 좀 더워요. 온도 1~2도만 낮춰주시면 감사하겠습니다.",
      status: "REVIEWING", reply: "요청 확인했습니다. 층별 온도 조정 검토 중이에요.", handled: -1, unseen: false },
    { category: "CLASS", title: "수학 질문 대기 시간이 길어요", content: "저녁에 질문이 몰려서 대기가 길어요. 멘토 한 분 더 계시면 좋겠어요.",
      status: "RECEIVED", unseen: false },
    { category: "ETC", title: "사물함 추가 요청", content: "고3 사물함이 부족합니다. 증설 가능할까요?",
      status: "DECLINED", reply: "공간 문제로 이번 학기는 어렵습니다. 다음 학기 반영 검토할게요.", handled: -5, unseen: false },
  ];
  for (const s of suggestions) {
    await prisma.studentSuggestion.create({
      data: {
        studentId: SID, category: s.category, title: s.title, content: s.content, status: s.status,
        staffReply: s.reply ?? null,
        handledById: s.reply ? DIRECTOR : null,
        handledByName: s.reply ? "정원장" : null,
        handledAt: s.reply ? day(s.handled!) : null,
        statusUpdatedAt: s.reply ? day(s.handled!) : null,
        studentReadAt: s.unseen ? day(s.handled! - 2) : (s.reply ? day(s.handled! + 1) : null),
      },
    });
  }

  // ── 8. 온보딩 설문 (제출 완료) ─────────────────────────────
  await prisma.onboardingSurvey.create({
    data: {
      studentId: SID, version: 1, submittedAt: day(-175),
      sections: {
        basicInfo: { name: "이지우", grade: 2, school: "강서고등학교" },
        history: { answer: "중3때부터 꾸준히 자습 습관을 들여왔고, 고1 내신은 평균 1.8등급입니다." },
        goals: { answer: "연세대 경영학과 수시 학종 목표. 정시도 병행 준비 중입니다." },
        strengths: { answer: "국어/영어 안정적, 계획 준수율 높음" },
        weaknesses: { answer: "수학 오답 관리 부족, 저녁 집중력 저하" },
        admissionType: { primary: "수시(학종)", secondary: "정시" },
        performance: { 국어: "1등급", 수학: "3등급", 영어: "1등급", 탐구: "2등급" },
        freeform: { answer: "수학만 잡으면 목표 달성 가능하다고 생각합니다. 도와주세요!" },
      },
    },
  });

  // ── 9. 영단어 시험 ─────────────────────────────────────────
  const book = await prisma.vocabBook.create({
    data: { name: "수능 필수 어휘 Day 12", description: "데모 단어장", createdById: "demo-vocab" },
  });
  const words: [string, string[]][] = [
    ["abandon", ["버리다", "포기하다"]], ["benevolent", ["자애로운", "인정 많은"]],
    ["candid", ["솔직한"]], ["deficient", ["부족한", "결핍된"]], ["eloquent", ["웅변의", "유창한"]],
    ["feasible", ["실현 가능한"]], ["gregarious", ["사교적인"]], ["hinder", ["방해하다"]],
    ["impartial", ["공정한", "편견 없는"]], ["jeopardize", ["위태롭게 하다"]],
    ["keen", ["예리한", "열망하는"]], ["lucid", ["명료한"]], ["meticulous", ["꼼꼼한"]],
    ["notorious", ["악명 높은"]], ["obscure", ["모호한", "무명의"]], ["prudent", ["신중한"]],
    ["quaint", ["예스러운"]], ["resilient", ["회복력 있는"]], ["scrutinize", ["면밀히 조사하다"]],
    ["tenacious", ["끈질긴"]],
  ];
  await prisma.vocabBookEntry.createMany({
    data: words.map(([word, meanings], i) => ({
      bookId: book.id, word, meanings, unit: "Day 12", order: i,
    })),
  });
  const entries = await prisma.vocabBookEntry.findMany({ where: { bookId: book.id }, orderBy: { order: "asc" } });

  const examDone = await prisma.vocabExam.create({
    data: { title: "Day 12 어휘 시험", bookId: book.id, questionCount: 10, direction: "EN_TO_KO", createdById: "demo-vocab" },
  });
  const examTodo = await prisma.vocabExam.create({
    data: { title: "Day 12 오답 재시험", bookId: book.id, questionCount: 5, direction: "MIXED", createdById: "demo-vocab" },
  });

  // 미시작 + 진행중
  await prisma.vocabAttempt.create({
    data: { examId: examTodo.id, studentId: SID, assignedById: MENTOR, status: "ASSIGNED", totalQuestions: 5, assignedAt: hour(-2), expiresAt: day(14) },
  });
  await prisma.vocabAttempt.create({
    data: { examId: examDone.id, studentId: SID, assignedById: MENTOR, status: "IN_PROGRESS", startedAt: hour(-1), totalQuestions: 10, expiresAt: day(13) },
  });
  // 제출 완료 + 채점 항목
  const submitted = await prisma.vocabAttempt.create({
    data: {
      examId: examDone.id, studentId: SID, assignedById: MENTOR, status: "SUBMITTED",
      startedAt: day(-3), submittedAt: day(-3), score: 80, correctCount: 8, totalQuestions: 10, durationMs: 96_000, assignedAt: day(-5),
    },
  });
  await prisma.vocabAttemptItem.createMany({
    data: entries.slice(0, 10).map((e, i) => {
      const correct = i !== 2 && i !== 7; // 2문항 오답
      return {
        attemptId: submitted.id, entryId: e.id, order: i, direction: "EN_TO_KO",
        prompt: e.word, expectedAnswers: e.meanings, word: e.word, meanings: e.meanings,
        studentAnswer: correct ? e.meanings[0] : "모르겠음", isCorrect: correct,
        timeMs: 6000 + i * 200, answeredAt: day(-3),
      };
    }),
  });

  // ── 10. 채팅 ───────────────────────────────────────────────
  const chats = [
    {
      staff: MENTOR, read: -1,
      msgs: [
        { who: "STAFF", content: "지우야, 오늘 수학 진도 어디까지 나갔어?", ago: -1.5 },
        { who: "STUDENT", content: "조건부확률 예제까지 했어요!", ago: -1.3 },
        { who: "STAFF", content: "좋아 👍 오답노트도 같이 정리하고 있지?", ago: -1.2 },
        { who: "STUDENT", content: "네 오늘치 3개 정리했어요", ago: -1.1 },
        { who: "STAFF", content: "완벽해. 이따 20시 세션에서 보자!", ago: -0.5 },
      ],
    },
    {
      staff: CONSULTANT, read: -3,
      msgs: [
        { who: "STAFF", content: "생윤 개요서 반론 부분만 보완하면 될 것 같아요.", ago: -2 },
        { who: "STUDENT", content: "넵 오늘 밤에 수정해서 다시 올릴게요!", ago: -1.8 },
        { who: "STAFF", content: "좋습니다. 세특 문구는 제가 잘 뽑아둘게요 😊", ago: -1 },
      ],
    },
  ];
  for (const c of chats) {
    const last = c.msgs[c.msgs.length - 1];
    await prisma.portalChat.create({
      data: {
        studentId: SID, staffId: c.staff, lastMessageAt: day(last.ago),
        studentReadAt: day(c.read), staffReadAt: day(last.ago),
        messages: {
          create: c.msgs.map((m) => ({
            senderType: m.who, senderUserId: m.who === "STAFF" ? c.staff : null,
            content: m.content, createdAt: day(m.ago),
          })),
        },
      },
    });
  }

  // ── 11. 로그인용 초대 (AuthUser 없을 때만) ─────────────────
  const existing = await prisma.authUser.findUnique({ where: { studentId: SID } });
  if (existing) {
    console.log("\n✅ 데모 학생 로그인 계정이 이미 있습니다. username 으로 로그인하세요.");
  } else {
    const token = createOpaqueToken();
    await prisma.authInvitation.deleteMany({ where: { targetStudentId: SID, acceptedAt: null } });
    await prisma.authInvitation.create({
      data: {
        type: "STUDENT", tokenHash: hashAuthToken(token), targetStudentId: SID,
        invitedById: DIRECTOR, expiresAt: day(7),
      },
    });
    console.log("\n🔑 INVITE_TOKEN=" + token);
  }

  console.log("\n✅ 데모 학생 시드 완료: 이지우 (고2)  studentId=" + SID);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
