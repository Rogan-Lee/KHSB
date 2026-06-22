// 3 라운드까지 머지된 스프린트 기능 dogfooding 용 종합 더미 데이터.
// 사용: npx tsx prisma/seed-sprint-test.ts
//   - DATABASE_URL_DEV 또는 DIRECT_URL 환경변수 사용 (DEV DB)
//   - idempotent: 재실행 안전. 모든 record 는 "test-" prefix.
// 정리: scripts/cleanup-sprint-test.ts 작성 후 실행 (선택)

import "dotenv/config";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL_DEV ?? process.env.DIRECT_URL;
if (!url) {
  console.error("❌ DATABASE_URL_DEV 또는 DIRECT_URL 이 필요합니다");
  process.exit(1);
}
const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

const KST = (iso: string) => new Date(iso + "T00:00:00+09:00");
const todayKST = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 60 * 60 * 1000);
};
const daysAgo = (n: number) => {
  const d = todayKST();
  d.setDate(d.getDate() - n);
  return d;
};
const monthFirst = (year: number, month: number) =>
  new Date(Date.UTC(year, month - 1, 1));

async function main() {
  console.log("🌱 스프린트 테스트 데이터 시드 시작...");

  // ─────────────────────────────────────────────────────────────
  // 1. Users (근무자) — Sprint 3-1, 5.4, 7.1
  // ─────────────────────────────────────────────────────────────
  const director = await prisma.user.upsert({
    where: { email: "test-director@studyroom.kr" },
    update: {},
    create: {
      email: "test-director@studyroom.kr",
      name: "테스트 원장",
      role: "DIRECTOR",
      phone: "01099000000",
    },
  });

  const head = await prisma.user.upsert({
    where: { email: "test-head@studyroom.kr" },
    update: { phone: "01099001111", status: "ACTIVE" },
    create: {
      email: "test-head@studyroom.kr",
      name: "총괄 박멘토",
      role: "HEAD_MENTOR",
      phone: "01099001111",
    },
  });

  const mentor1 = await prisma.user.upsert({
    where: { email: "test-mentor1@studyroom.kr" },
    update: { phone: "01099002222", status: "ACTIVE" },
    create: {
      email: "test-mentor1@studyroom.kr",
      name: "김멘토",
      role: "MENTOR",
      phone: "01099002222",
    },
  });

  const mentor2 = await prisma.user.upsert({
    where: { email: "test-mentor2@studyroom.kr" },
    update: { phone: "01099003333", status: "ACTIVE" },
    create: {
      email: "test-mentor2@studyroom.kr",
      name: "이멘토",
      role: "MENTOR",
      phone: "01099003333",
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: "test-staff@studyroom.kr" },
    update: { phone: "01099004444", status: "ACTIVE" },
    create: {
      email: "test-staff@studyroom.kr",
      name: "최운영",
      role: "STAFF",
      phone: "01099004444",
    },
  });

  // 퇴사자 — Sprint 5.4 픽커 필터 검증용
  const terminated = await prisma.user.upsert({
    where: { email: "test-terminated@studyroom.kr" },
    update: {
      phone: "01099005555",
      status: "TERMINATED",
      terminatedAt: daysAgo(15),
      terminationNote: "테스트 — 퇴사 처리됨",
    },
    create: {
      email: "test-terminated@studyroom.kr",
      name: "퇴사멘토",
      role: "MENTOR",
      phone: "01099005555",
      status: "TERMINATED",
      terminatedAt: daysAgo(15),
      terminationNote: "테스트 — 퇴사 처리됨",
    },
  });

  console.log("✅ Users: director, head, 2 mentors, staff, 1 terminated");

  // ─────────────────────────────────────────────────────────────
  // 2. Students — 1-5 학년/상태 mix
  // ─────────────────────────────────────────────────────────────
  const studentSeeds = [
    { id: "test-s-jiyoung", name: "테스트 김지영", grade: "고3", seat: "T-01", parentPhone: "01087651001", birthDate: KST("2007-03-15") },
    { id: "test-s-sumin",   name: "테스트 이수민", grade: "고2", seat: "T-02", parentPhone: "01087651002", birthDate: KST("2008-06-20") },
    { id: "test-s-junho",   name: "테스트 박준호", grade: "N수", seat: "T-03", parentPhone: "01087651003", birthDate: KST("2006-11-02") },
    { id: "test-s-yuna",    name: "테스트 최유나", grade: "고1", seat: "T-04", parentPhone: "01087651004", birthDate: KST("2009-04-08") },
    { id: "test-s-minsu",   name: "테스트 정민수", grade: "고3", seat: "T-05", parentPhone: "01087651005", birthDate: KST("2007-08-25") },
    { id: "test-s-graduated", name: "테스트 졸업생", grade: "고3", seat: null,   parentPhone: "01087651006", birthDate: KST("2006-02-10") },
  ];

  for (const s of studentSeeds) {
    await prisma.student.upsert({
      where: { id: s.id },
      update: { mentorId: mentor1.id },
      create: {
        ...s,
        startDate: daysAgo(60),
        mentorId: mentor1.id,
        status: s.id === "test-s-graduated" ? "GRADUATED" : "ACTIVE",
        endDate: s.id === "test-s-graduated" ? daysAgo(7) : null,
      },
    });
  }
  console.log("✅ Students: 5 active + 1 graduated");

  // ─────────────────────────────────────────────────────────────
  // 3. Sprint 1.1/1.2 — ExamSession + ExamScore (모의/사설/내신)
  // ─────────────────────────────────────────────────────────────
  const examSessions = [
    { id: "test-es-mock-9", title: "2026-09 모의고사", examType: "OFFICIAL_MOCK" as const, examDate: daysAgo(20), room: "H" },
    { id: "test-es-mock-6", title: "2026-06 모의고사", examType: "OFFICIAL_MOCK" as const, examDate: daysAgo(80), room: "H" },
    { id: "test-es-private", title: "사관학교 모의고사", examType: "PRIVATE_MOCK" as const, examDate: daysAgo(40), room: "K" },
    { id: "test-es-school-mid", title: "1학기 중간고사", examType: "SCHOOL_EXAM" as const, examDate: daysAgo(50), room: "H" },
    { id: "test-es-school-fin", title: "1학기 기말고사", examType: "SCHOOL_EXAM" as const, examDate: daysAgo(10), room: "H" },
  ];
  for (const es of examSessions) {
    await prisma.examSession.upsert({
      where: { id: es.id },
      update: {},
      create: { ...es, subjects: ["국어", "수학", "영어"] },
    });
  }

  const scores = [
    // 김지영 — 모의 추이 + 내신
    { studentId: "test-s-jiyoung", sessionId: "test-es-mock-6", examType: "OFFICIAL_MOCK" as const, examName: "2026-06 모의고사", examDate: daysAgo(80), subject: "국어", rawScore: 88, grade: "2", percentile: "88" },
    { studentId: "test-s-jiyoung", sessionId: "test-es-mock-6", examType: "OFFICIAL_MOCK" as const, examName: "2026-06 모의고사", examDate: daysAgo(80), subject: "수학", rawScore: 80, grade: "3", percentile: "75" },
    { studentId: "test-s-jiyoung", sessionId: "test-es-mock-9", examType: "OFFICIAL_MOCK" as const, examName: "2026-09 모의고사", examDate: daysAgo(20), subject: "국어", rawScore: 95, grade: "1", percentile: "96" },
    { studentId: "test-s-jiyoung", sessionId: "test-es-mock-9", examType: "OFFICIAL_MOCK" as const, examName: "2026-09 모의고사", examDate: daysAgo(20), subject: "수학", rawScore: 88, grade: "2", percentile: "85" },
    { studentId: "test-s-jiyoung", sessionId: "test-es-private", examType: "PRIVATE_MOCK" as const, examName: "사관학교 모의고사", examDate: daysAgo(40), subject: "국어", rawScore: 82, grade: "3", percentile: "72" },
    { studentId: "test-s-jiyoung", sessionId: "test-es-school-mid", examType: "SCHOOL_EXAM" as const, examName: "1학기 중간고사", examDate: daysAgo(50), subject: "수1", rawScore: 88, grade: "2", percentile: null },
    { studentId: "test-s-jiyoung", sessionId: "test-es-school-fin", examType: "SCHOOL_EXAM" as const, examName: "1학기 기말고사", examDate: daysAgo(10), subject: "수1", rawScore: 92, grade: "1", percentile: null },
    // 이수민
    { studentId: "test-s-sumin", sessionId: "test-es-mock-6", examType: "OFFICIAL_MOCK" as const, examName: "2026-06 모의고사", examDate: daysAgo(80), subject: "국어", rawScore: 75, grade: "4", percentile: "60" },
    { studentId: "test-s-sumin", sessionId: "test-es-mock-9", examType: "OFFICIAL_MOCK" as const, examName: "2026-09 모의고사", examDate: daysAgo(20), subject: "국어", rawScore: 78, grade: "3", percentile: "70" },
  ];
  // ExamScore 는 복합 unique 가 없으므로 테스트 학생분만 정리 후 재삽입(idempotent).
  // grade(Int?)·percentile(Float?) 는 현재 스키마에 맞춰 숫자로 변환.
  await prisma.examScore.deleteMany({
    where: { studentId: { startsWith: "test-s-" } },
  });
  await prisma.examScore.createMany({
    data: scores.map((sc) => ({
      studentId: sc.studentId,
      sessionId: sc.sessionId,
      examType: sc.examType,
      examName: sc.examName,
      examDate: sc.examDate,
      subject: sc.subject,
      rawScore: sc.rawScore,
      grade: Number(sc.grade),
      percentile: sc.percentile == null ? null : Number(sc.percentile),
    })),
  });
  console.log("✅ Exams: 5 sessions, ~9 scores (모의/사설/내신 mix)");

  // ─────────────────────────────────────────────────────────────
  // 4. Sprint 1.3 — VocabTestScore (영단어 응시 이력)
  // ─────────────────────────────────────────────────────────────
  // VocabTestScore 도 복합 unique 가 없어 테스트 학생분 정리 후 재삽입.
  await prisma.vocabTestScore.deleteMany({
    where: { studentId: { startsWith: "test-s-" } },
  });
  for (const sid of ["test-s-jiyoung", "test-s-sumin"]) {
    const baseScore = sid === "test-s-jiyoung" ? 80 : 65;
    for (let i = 4; i >= 0; i--) {
      const testDate = daysAgo(i * 7);
      const correct = baseScore + Math.floor(Math.random() * 15) + (sid === "test-s-jiyoung" ? (4 - i) : 0);
      const total = 30;
      await prisma.vocabTestScore.create({
        data: {
          studentId: sid,
          testDate,
          totalWords: total,
          correctWords: Math.min(correct, total),
          score: Math.round((Math.min(correct, total) / total) * 100),
          createdById: mentor1.id,
        },
      });
    }
  }
  console.log("✅ VocabTestScore: 5 회 × 2 학생");

  // ─────────────────────────────────────────────────────────────
  // 5. Sprint 1.4 — MeritDemerit + MonthlyNote (visibleInReport mix)
  // ─────────────────────────────────────────────────────────────
  await prisma.meritDemerit.deleteMany({
    where: { studentId: { startsWith: "test-s-" } },
  });
  await prisma.meritDemerit.createMany({
    data: [
      { studentId: "test-s-jiyoung", date: daysAgo(5), type: "MERIT", points: 2, reason: "수업 태도 우수", category: "태도", createdById: mentor1.id, visibleInReport: true },
      { studentId: "test-s-jiyoung", date: daysAgo(12), type: "DEMERIT", points: 1, reason: "사담 (민감 — 미공개)", category: "태도", createdById: mentor1.id, visibleInReport: false },
      { studentId: "test-s-sumin", date: daysAgo(3), type: "DEMERIT", points: 1, reason: "지각", category: "지각", createdById: mentor1.id, visibleInReport: true },
      { studentId: "test-s-junho", date: daysAgo(8), type: "MERIT", points: 1, reason: "자율 학습 성실", category: "태도", createdById: mentor1.id, visibleInReport: true },
    ],
  });

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  await prisma.monthlyNote.deleteMany({
    where: { studentId: { startsWith: "test-s-" }, year: y, month: m },
  });
  await prisma.monthlyNote.createMany({
    data: [
      { studentId: "test-s-jiyoung", studentName: "테스트 김지영", year: y, month: m, content: "5월 모의고사 점수 향상 추세. 영단어 학습 꾸준.", authorId: mentor1.id, authorName: mentor1.name, visibleInReport: true },
      { studentId: "test-s-sumin", studentName: "테스트 이수민", year: y, month: m, content: "민감 정보 — 외부 공개 금지", authorId: mentor1.id, authorName: mentor1.name, visibleInReport: false },
    ],
  });
  console.log("✅ MeritDemerit (4) + MonthlyNote (2) — visibleInReport mix");

  // ─────────────────────────────────────────────────────────────
  // 6. Sprint 2.1 — AttendanceRecord + DailyOuting + OutingSchedule
  // ─────────────────────────────────────────────────────────────
  const today = todayKST();
  await prisma.attendanceRecord.upsert({
    where: { studentId_date: { studentId: "test-s-jiyoung", date: today } },
    update: { checkIn: new Date(today.getTime() + 13 * 60 * 60 * 1000), type: "NORMAL" },
    create: {
      studentId: "test-s-jiyoung",
      date: today,
      checkIn: new Date(today.getTime() + 13 * 60 * 60 * 1000),
      type: "NORMAL",
    },
  });

  // OutingSchedule — 매주 화요일 14:00-16:00 학원
  await prisma.outingSchedule.deleteMany({ where: { studentId: "test-s-sumin" } });
  await prisma.outingSchedule.create({
    data: {
      studentId: "test-s-sumin",
      dayOfWeek: 2, // Tue
      outStart: "14:00",
      outEnd: "16:00",
      reason: "학원",
    },
  });

  // DailyOuting — 박준호 오늘 2차 외출
  await prisma.dailyOuting.deleteMany({
    where: { studentId: "test-s-junho", date: today },
  });
  const t14 = new Date(today.getTime() + 14 * 60 * 60 * 1000);
  const t1430 = new Date(today.getTime() + 14 * 60 * 60 * 1000 + 30 * 60 * 1000);
  const t16 = new Date(today.getTime() + 16 * 60 * 60 * 1000);
  const t1630 = new Date(today.getTime() + 16 * 60 * 60 * 1000 + 30 * 60 * 1000);
  await prisma.dailyOuting.createMany({
    data: [
      { studentId: "test-s-junho", date: today, sequence: 1, outStart: t14, outEnd: t1430, reason: "병원" },
      { studentId: "test-s-junho", date: today, sequence: 2, outStart: t16, outEnd: t1630, reason: "학원" },
    ],
  });
  console.log("✅ Attendance: 1 record, 1 weekly outing schedule, 2 daily outings");

  // ─────────────────────────────────────────────────────────────
  // 7. Sprint 3-1 / 3.2 — PayrollContract + WorkTag
  // ─────────────────────────────────────────────────────────────
  await prisma.payrollContract.deleteMany({
    where: { userId: { in: [mentor1.id, mentor2.id, staff.id] } },
  });
  await prisma.payrollContract.createMany({
    data: [
      // mentor1: 1-3월 ₩12,000, 4월부터 ₩13,000
      { userId: mentor1.id, effectiveFrom: monthFirst(y, 1), effectiveTo: monthFirst(y, 4), hourlyRate: 12000, weeklyHolidayPay: true, createdById: director.id },
      { userId: mentor1.id, effectiveFrom: monthFirst(y, 4), effectiveTo: null, hourlyRate: 13000, weeklyHolidayPay: true, monthlyBonusKrw: 50000, note: "식대 포함", createdById: director.id },
      // mentor2: 단일 계약
      { userId: mentor2.id, effectiveFrom: monthFirst(y, 1), effectiveTo: null, hourlyRate: 12500, weeklyHolidayPay: true, createdById: director.id },
      // staff: 운영조교 계약
      { userId: staff.id, effectiveFrom: monthFirst(y, 1), effectiveTo: null, hourlyRate: 11000, weeklyHolidayPay: false, createdById: director.id },
    ],
  });

  // WorkTag — mentor1 최근 3일 정상 출퇴근
  await prisma.workTag.deleteMany({
    where: { userId: mentor1.id, taggedAt: { gte: daysAgo(7) } },
  });
  for (let i = 0; i < 3; i++) {
    const inAt = new Date(daysAgo(i + 1).getTime() + 13 * 60 * 60 * 1000);
    const outAt = new Date(daysAgo(i + 1).getTime() + 22 * 60 * 60 * 1000);
    await prisma.workTag.createMany({
      data: [
        { userId: mentor1.id, type: "CLOCK_IN", taggedAt: inAt },
        { userId: mentor1.id, type: "CLOCK_OUT", taggedAt: outAt },
      ],
    });
  }
  console.log("✅ PayrollContract (4 rows: 이력 포함) + WorkTag (3일 mentor1)");

  // ─────────────────────────────────────────────────────────────
  // 8. Sprint 4.1/4.2 — Assignment + AssignmentFile
  // ─────────────────────────────────────────────────────────────
  await prisma.assignment.deleteMany({
    where: { studentId: { startsWith: "test-s-" } },
  });
  const a1 = await prisma.assignment.create({
    data: {
      studentId: "test-s-jiyoung",
      title: "수1 17p 풀기",
      subject: "수학",
      description: "기본 문제 + 심화 문제",
      dueDate: daysAgo(-3),
      createdById: mentor1.id,
      createdByName: mentor1.name,
    },
  });
  const a2 = await prisma.assignment.create({
    data: {
      studentId: "test-s-jiyoung",
      title: "독서 분석지 작성",
      subject: "국어",
      description: "분석지 첨부 참고",
      dueDate: daysAgo(-7),
      createdById: mentor1.id,
      createdByName: mentor1.name,
    },
  });
  await prisma.assignmentFile.create({
    data: {
      assignmentId: a2.id,
      url: "https://dummy.local/sample-analysis.pdf", // 더미 — 실제 다운로드 X
      fileName: "독서_분석지_샘플.pdf",
      mimeType: "application/pdf",
      sizeBytes: 245760,
      uploadedById: mentor1.id,
    },
  });
  console.log("✅ Assignment: 2 (1 with dummy file)");

  // ─────────────────────────────────────────────────────────────
  // 9. Sprint 4.3 — VocabBook + VocabExam + VocabAttempt (shuffleSeed)
  // ─────────────────────────────────────────────────────────────
  const book = await prisma.vocabBook.upsert({
    where: { id: "test-vocab-book-1" },
    update: {},
    create: {
      id: "test-vocab-book-1",
      name: "[테스트] 수능 영단어",
      description: "테스트용 20개",
      createdById: director.id,
    },
  });
  const sampleWords = [
    { word: "abandon", meanings: ["버리다", "포기하다"] },
    { word: "ability", meanings: ["능력"] },
    { word: "absence", meanings: ["부재", "결석"] },
    { word: "absolute", meanings: ["절대적인"] },
    { word: "absorb", meanings: ["흡수하다"] },
    { word: "abstract", meanings: ["추상적인"] },
    { word: "abundant", meanings: ["풍부한"] },
    { word: "academic", meanings: ["학문적인"] },
    { word: "accept", meanings: ["받아들이다"] },
    { word: "access", meanings: ["접근"] },
  ];
  await prisma.vocabBookEntry.deleteMany({ where: { bookId: book.id } });
  for (let i = 0; i < sampleWords.length; i++) {
    await prisma.vocabBookEntry.create({
      data: {
        bookId: book.id,
        word: sampleWords[i].word,
        meanings: sampleWords[i].meanings,
        unit: "Day 1",
        order: i,
      },
    });
  }
  console.log("✅ VocabBook: 10 단어 (Day 1)");

  // ─────────────────────────────────────────────────────────────
  // 9.5 오프라인 Mentoring 기록 + Photo 통합 (KDA 사진 사진관리 양방향 연동)
  // ─────────────────────────────────────────────────────────────
  // 멘토링 연결된 더미 Photo 정리 후 멘토링 삭제
  await prisma.photo.deleteMany({
    where: { mentoring: { studentId: { startsWith: "test-s-" } } },
  });
  await prisma.mentoring.deleteMany({
    where: { studentId: { startsWith: "test-s-" } },
  });

  const offlineMentoring = await prisma.mentoring.create({
    data: {
      studentId: "test-s-jiyoung",
      mentorId: mentor1.id,
      scheduledAt: daysAgo(1),
      actualDate: daysAgo(1),
      status: "COMPLETED",
      content: "오프라인 멘토링 — 수1 오답 정리 + 영단어 점검",
      improvements: "개념 적용 속도 향상",
      weaknesses: "함수 단원 실수",
      nextGoals: "기출 3개년 정리",
    },
  });
  // KDA / EXTRA 각 1장 — Photo 레코드 (mentoringId+mentoringTag). 사진관리에도 자동 노출.
  await prisma.photo.createMany({
    data: [
      { fileName: "off-kda1.png", url: "https://dummy.local/off-kda1.png", mimeType: "image/png", sizeBytes: 120000, studentId: "test-s-jiyoung", mentoringId: offlineMentoring.id, mentoringTag: "KDA", uploadedById: mentor1.id, uploadedByName: mentor1.name },
      { fileName: "off-extra1.png", url: "https://dummy.local/off-extra1.png", mimeType: "image/png", sizeBytes: 98000, studentId: "test-s-jiyoung", mentoringId: offlineMentoring.id, mentoringTag: "EXTRA", uploadedById: mentor1.id, uploadedByName: mentor1.name },
    ],
  });
  // 사진관리에만 있고 아직 멘토링 미연결인 사진 1장 (역방향 태깅 테스트용)
  await prisma.photo.create({
    data: { fileName: "unlinked-jiyoung.png", url: "https://dummy.local/unlinked.png", mimeType: "image/png", sizeBytes: 80000, studentId: "test-s-jiyoung", uploadedById: mentor1.id, uploadedByName: mentor1.name },
  });

  // 사진 없는 빈 멘토링 1개 (처음부터 입력 테스트)
  await prisma.mentoring.create({
    data: {
      studentId: "test-s-sumin",
      mentorId: mentor1.id,
      scheduledAt: todayKST(),
      status: "SCHEDULED",
      content: "오프라인 멘토링 — 신규 (사진 직접 입력 테스트)",
    },
  });
  console.log("✅ 오프라인 Mentoring: 2 (1 사진2 Photo연동, 1 빈) + 미연결 사진 1");

  // ─────────────────────────────────────────────────────────────
  // 10. Sprint 5.1 — MentoringSession + MentoringSessionPhoto
  // ─────────────────────────────────────────────────────────────
  await prisma.mentoringSessionPhoto.deleteMany({
    where: { session: { studentId: { startsWith: "test-s-" } } },
  });
  await prisma.mentoringSession.deleteMany({
    where: { studentId: { startsWith: "test-s-" } },
  });

  const session1 = await prisma.mentoringSession.create({
    data: {
      studentId: "test-s-jiyoung",
      hostId: mentor1.id,
      title: "테스트 김지영 멘토링 (완료)",
      scheduledAt: daysAgo(2),
      durationMinutes: 30,
      status: "COMPLETED",
      notes: "수1 진도 점검. 핵심 개념 잘 잡힘.",
    },
  });
  // KDA / EXTRA / FREE 각 1장
  await prisma.mentoringSessionPhoto.createMany({
    data: [
      { sessionId: session1.id, url: "https://dummy.local/kda1.png", mimeType: "image/png", tag: "KDA", caption: "오답 정리", uploadedById: mentor1.id },
      { sessionId: session1.id, url: "https://dummy.local/extra1.png", mimeType: "image/png", tag: "EXTRA", uploadedById: mentor1.id },
      { sessionId: session1.id, url: "https://dummy.local/free1.png", mimeType: "image/png", tag: "FREE", uploadedById: mentor1.id },
    ],
  });

  // 온라인 진행 중 세션 1개 (서명 기능은 제거됨)
  await prisma.mentoringSession.create({
    data: {
      studentId: "test-s-sumin",
      hostId: mentor1.id,
      title: "테스트 이수민 멘토링 (진행 중)",
      scheduledAt: daysAgo(1),
      durationMinutes: 30,
      status: "SCHEDULED",
      notes: "진행 중",
    },
  });

  // CANCELLED — Sprint 5.3 hide 토글 테스트
  await prisma.mentoringSession.create({
    data: {
      studentId: "test-s-yuna",
      hostId: mentor2.id,
      title: "테스트 최유나 멘토링 (취소)",
      scheduledAt: daysAgo(3),
      durationMinutes: 30,
      status: "CANCELED",
      canceledAt: daysAgo(3),
    },
  });
  console.log("✅ MentoringSession: 3 (1 완료+서명, 1 호스트만 서명, 1 취소) + 3 photos");

  // ─────────────────────────────────────────────────────────────
  // 11. Sprint 5.3 / 6.2 — Todo (targetRole + 루틴)
  // ─────────────────────────────────────────────────────────────
  await prisma.todo.deleteMany({
    where: { authorId: director.id, title: { startsWith: "[테스트]" } },
  });
  const todoSeeds = [
    { title: "[테스트] 출결 체크", category: "루틴", targetRole: "MENTOR", priority: "HIGH", assigneeId: mentor1.id, assigneeName: mentor1.name },
    { title: "[테스트] 장비 점검", category: "루틴", targetRole: "STAFF", priority: "NORMAL", assigneeId: staff.id, assigneeName: staff.name },
    { title: "[테스트] 음료수 보충", category: "루틴", targetRole: "ALL", priority: "LOW" },
    { title: "[테스트] 전체 회의 준비", category: "주간", targetRole: "ALL", priority: "URGENT" },
    { title: "[테스트] 보충 과제 부여", category: null, targetRole: null, priority: "NORMAL", assigneeId: mentor2.id, assigneeName: mentor2.name },
    { title: "[테스트] 학부모 상담 노트", category: null, targetRole: "MENTOR", priority: "HIGH", assigneeId: mentor1.id, assigneeName: mentor1.name },
  ];
  for (const t of todoSeeds) {
    await prisma.todo.create({
      data: {
        ...t,
        authorId: director.id,
        authorName: director.name,
        dueDate: daysAgo(-3),
      },
    });
  }
  console.log("✅ Todo: 6 (3 루틴 + 1 주간 + 2 일반, targetRole mix)");

  // ─────────────────────────────────────────────────────────────
  // 12. Sprint 6.1 — FeatureRequest (unseen / seen)
  // ─────────────────────────────────────────────────────────────
  await prisma.featureRequest.deleteMany({
    where: { title: { startsWith: "[테스트]" } },
  });
  await prisma.featureRequest.createMany({
    data: [
      { title: "[테스트] 모바일 출결 단축키", description: "출결 입력 시 키보드 단축키", status: "PENDING", priority: "URGENT", authorId: head.id, authorName: head.name, seenById: [] },
      { title: "[테스트] 외출 사유 자동 제안", description: "OutingSchedule 기반 자동 채우기", status: "PENDING", priority: "NORMAL", authorId: mentor1.id, authorName: mentor1.name, seenById: [] },
      { title: "[테스트] 급여 명세서 PDF", description: "각 근무자가 본인 명세서 출력", status: "PENDING", priority: "NORMAL", authorId: staff.id, authorName: staff.name, seenById: [director.id] },
      { title: "[테스트] 카톡 알림톡 연동", description: "리포트 발송 시 카톡으로", status: "IN_PROGRESS", priority: "URGENT", authorId: head.id, authorName: head.name, seenById: [director.id] },
      { title: "[테스트] 다크모드", description: "야간 운영자 눈 피로", status: "DONE", priority: "NORMAL", authorId: mentor1.id, authorName: mentor1.name, seenById: [director.id, mentor1.id] },
    ],
  });
  console.log("✅ FeatureRequest: 5 (3 unseen + 2 seen — director 기준)");

  // ─────────────────────────────────────────────────────────────
  // 13. Sprint 7.1/7.2 — StaffMagicLink
  // ─────────────────────────────────────────────────────────────
  await prisma.staffMagicLink.deleteMany({
    where: { userId: { in: [mentor1.id, mentor2.id] } },
  });
  const link = await prisma.staffMagicLink.create({
    data: {
      userId: mentor1.id,
      expiresAt: daysAgo(-90),
      issuedById: director.id,
      accessCount: 0,
    },
  });
  await prisma.staffMagicLink.create({
    data: {
      userId: mentor2.id,
      expiresAt: daysAgo(-90),
      issuedById: director.id,
      revokedAt: daysAgo(1),
      accessCount: 3,
      lastAccessedAt: daysAgo(2),
    },
  });
  console.log(`✅ StaffMagicLink: 1 active (mentor1), 1 revoked (mentor2)`);
  console.log(`   🔗 mentor1 포털 URL: /w/${link.token}`);
  console.log(`      → 본인 확인 ${mentor1.phone?.slice(-4)} (마지막 4자리)`);

  console.log("\n🎉 시드 완료!\n");
  console.log("주요 테스트 계정:");
  console.log(`  원장: ${director.email}`);
  console.log(`  멘토1: ${mentor1.email}  phone=${mentor1.phone}`);
  console.log(`  퇴사자: ${terminated.email} (TERMINATED)`);
  console.log("\n학생 portal 매직링크는 별도 발급 필요 (Student 페이지에서).");
}

main()
  .catch((e) => {
    console.error("❌ 시드 실패:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
