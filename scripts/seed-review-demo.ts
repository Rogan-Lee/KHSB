/**
 * App Store 심사용 데모 — 가상 학생 1명(데이터 포함) + 학생·학부모·직원 로그인 계정 + 가입·탈퇴 시험용 학부모 초대 코드.
 *
 * 운영 DB 에도 쓰므로 기존 데이터는 건드리지 않고 review-demo- 네임스페이스만 만들고 지운다. 저장소 루트에서 실행:
 *   npx tsx --env-file=.env.development.local scripts/seed-review-demo.ts --apply     # 개발 DB
 *   npx tsx --env-file=.env.local scripts/seed-review-demo.ts --apply --prod         # 운영 DB
 *   … --apply --reset-passwords   비밀번호 새로 발급 (심사 중에는 쓰지 말 것)
 *   … --delete [--prod]           심사가 끝나면 데모 학생·계정·초대·데이터 전부 삭제
 * 옵션 없이 실행하면 대상 DB 만 보여 주고 끝난다.
 * --apply 를 다시 돌리면 데모 학생 데이터(심사자가 남긴 질문 등 포함)를 새로 만든다. 계정·초대 코드는 유지.
 *
 * 저장소가 공개라 비밀번호·초대 코드는 커밋하지 않는다 → .app-review/<project-ref>.{json,md}(gitignore)에만 쓴다.
 * 데모 멘토(김데모)는 퇴사(TERMINATED) 상태라 운영진 선택 목록에 뜨지 않고 로그인 계정도 없다.
 * 데모 직원은 컨설턴트(온라인 관리) 역할로 데모 학생만 담당한다 — 이 역할은 수행평가·메시지가 담당 학생 범위라
 * 실제 학생 기록이 보이지 않는다. 입퇴실·순찰·학생 검색 같은 전체 학생 화면은 이 역할에 없다.
 */
import { randomBytes, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";

import { PrismaClient } from "../src/generated/prisma/client";
import { hashAuthToken } from "../src/lib/auth-tokens";

const PROD_PROJECT_REF = "<prod-project-ref>";

const SID = "review-demo-student";
const MENTOR = "review-demo-mentor";
const STAFF = "review-demo-staff";
const STUDENT_AUTH = "review-demo-auth-student";
const PARENT_AUTH = "review-demo-auth-parent";
const STAFF_AUTH = "review-demo-auth-staff";
const STUDENT_USERNAME = "appreview.student";
const PARENT_USERNAME = "appreview.parent";
const STAFF_USERNAME = "appreview.staff";
const INVITE_COUNT = 2;
const INVITE_DAYS = 90;

const args = new Set(process.argv.slice(2));
const mode = args.has("--delete") ? "delete" : args.has("--apply") ? "apply" : "check";

function sanitizeUrl(raw: string) {
  const u = new URL(raw);
  for (const k of ["pgbouncer", "connection_limit", "pool_timeout", "statement_cache_size"]) {
    u.searchParams.delete(k);
  }
  return u.toString();
}

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) throw new Error("DATABASE_URL 이 없습니다 (--env-file 로 넘겨 주세요)");
const projectRef = rawUrl.match(/postgres\.([a-z0-9]+)[:@]/)?.[1] ?? new URL(rawUrl).hostname;
const isProd = projectRef === PROD_PROJECT_REF;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: sanitizeUrl(rawUrl), max: 1 }),
});

// ─── 날짜 (앱 규칙: 날짜 필드는 KST 날짜를 UTC 자정으로 저장) ─────────────────

const DAY_MS = 86_400_000;
const TODAY = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const dateOnly = (s: string) => new Date(`${s}T00:00:00.000Z`);
const addDays = (s: string, n: number) => new Date(dateOnly(s).getTime() + n * DAY_MS).toISOString().slice(0, 10);
const at = (s: string, hm: string) => new Date(`${s}T${hm}:00+09:00`);
const isWeekday = (s: string) => {
  const d = dateOnly(s).getUTCDay();
  return d >= 1 && d <= 5;
};

/** 오늘 이전의 평일 n개 (가까운 날부터) */
function recentWeekdays(n: number) {
  const out: string[] = [];
  for (let i = 1; out.length < n; i++) {
    const d = addDays(TODAY, -i);
    if (isWeekday(d)) out.push(d);
  }
  return out;
}

// ─── 비밀번호·초대 코드 (로컬 파일에만 보관) ────────────────────────────────

type Secrets = {
  studentPassword?: string;
  parentPassword?: string;
  staffPassword?: string;
  invites?: string[];
  updatedAt?: string;
};

const SECRET_DIR = resolve(process.cwd(), ".app-review");
const secretJson = resolve(SECRET_DIR, `${projectRef}.json`);
const secretMd = resolve(SECRET_DIR, `${projectRef}.md`);

function loadSecrets(): Secrets {
  return existsSync(secretJson) ? (JSON.parse(readFileSync(secretJson, "utf8")) as Secrets) : {};
}

const EASY = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const easyChars = (n: number) => Array.from({ length: n }, () => EASY[randomInt(EASY.length)]).join("");
const newPassword = () => `Khsb-${easyChars(10)}`;
const newInviteCode = () => `appreview-${easyChars(12).toLowerCase()}`;

// ─── 삭제 ───────────────────────────────────────────────────────────────

async function deleteAll() {
  // 데모 학생에만 연결된 학부모 계정 (심사자가 초대 코드로 만든 계정 포함)
  const links = await prisma.parentLink.findMany({ where: { studentId: SID }, select: { authUserId: true } });
  const parentIds: string[] = [];
  for (const { authUserId } of links) {
    const others = await prisma.parentLink.count({ where: { authUserId, studentId: { not: SID } } });
    if (others === 0) parentIds.push(authUserId);
  }
  const parents = await prisma.authUser.deleteMany({ where: { id: { in: parentIds } } });
  const invites = await prisma.authInvitation.deleteMany({
    where: { OR: [{ targetStudentId: SID }, { invitedById: MENTOR }] },
  });
  // 직원 작성분(피드백 등)이 남아 있으면 직원 삭제가 막히므로 데모 데이터를 먼저 지운다
  await resetContent();
  // 데모 직원이 주고받은 직원 DM (FK 없이 id 로만 연결)
  await prisma.staffThread.deleteMany({ where: { OR: [{ aUserId: STAFF }, { bUserId: STAFF }] } });
  // 학생 삭제 → 학생 로그인 계정과 나머지 학생 데이터는 cascade
  const student = await prisma.student.deleteMany({ where: { id: SID } });
  // 직원 삭제 → 직원 로그인 계정은 cascade
  const staff = await prisma.user.deleteMany({ where: { id: { in: [MENTOR, STAFF] } } });
  rmSync(secretJson, { force: true });
  rmSync(secretMd, { force: true });
  console.log(
    `삭제 완료 — 학부모 계정 ${parents.count}, 초대 ${invites.count}, 학생 ${student.count}, 데모 멘토·직원 ${staff.count}`,
  );
}

// ─── 사람 ───────────────────────────────────────────────────────────────

async function upsertPeople() {
  const mentor = {
    email: "review-demo-mentor@example.com",
    name: "김데모",
    role: "MENTOR" as const,
    isMentor: true,
    status: "TERMINATED" as const,
    terminatedAt: new Date(),
    terminationNote: "App Store 심사용 데모 멘토(로그인 불가). 심사 후 scripts/seed-review-demo.ts --delete 로 삭제",
  };
  await prisma.user.upsert({ where: { id: MENTOR }, update: mentor, create: { id: MENTOR, ...mentor } });

  const staff = {
    email: `${STAFF_USERNAME}@example.com`,
    name: "데모 직원",
    role: "CONSULTANT" as const,
    status: "ACTIVE" as const,
  };
  await prisma.user.upsert({ where: { id: STAFF }, update: staff, create: { id: STAFF, ...staff } });

  const student = {
    name: "데모 학생",
    grade: "고2",
    school: "데모고등학교",
    parentPhone: "010-0000-0000",
    startDate: dateOnly(addDays(TODAY, -60)),
    status: "ACTIVE" as const,
    isOnlineManaged: false,
    mentorId: MENTOR,
    assignedConsultantId: STAFF,
    targetUniversity: "서울대 경영학과",
    admissionType: "정시",
    internalScoreRange: "1~2등급",
    mockScoreRange: "1~2등급",
    selectedSubjects: "국어, 수학, 영어, 사회·문화, 생활과윤리",
    studentInfo: "App Store 심사용 데모 학생입니다. 실제 학생이 아니며 심사가 끝나면 삭제합니다.",
  };
  await prisma.student.upsert({ where: { id: SID }, update: student, create: { id: SID, ...student } });
}

// ─── 데이터 ─────────────────────────────────────────────────────────────

async function resetContent() {
  await prisma.taskFeedback.deleteMany({ where: { submission: { studentId: SID } } });
  await prisma.taskSubmission.deleteMany({ where: { studentId: SID } });
  await prisma.taskResult.deleteMany({ where: { studentId: SID } });
  await prisma.performanceTask.deleteMany({ where: { studentId: SID } });
  await prisma.questionMessage.deleteMany({ where: { question: { studentId: SID } } });
  await prisma.studentQuestion.deleteMany({ where: { studentId: SID } });
  await prisma.portalChatMessage.deleteMany({ where: { chat: { studentId: SID } } });
  await prisma.portalChat.deleteMany({ where: { studentId: SID } });
  await prisma.parentReport.deleteMany({ where: { studentId: SID } });
  await prisma.mentoring.deleteMany({ where: { studentId: SID } });
  await prisma.meritDemerit.deleteMany({ where: { studentId: SID } });
  await prisma.examScore.deleteMany({ where: { studentId: SID } });
  await prisma.attendanceRecord.deleteMany({ where: { studentId: SID } });
  await prisma.attendanceSchedule.deleteMany({ where: { studentId: SID } });
}

async function createContent() {
  // 등원 스케줄: 평일 13–22시, 토요일 9–18시
  await prisma.attendanceSchedule.createMany({
    data: [
      ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({ studentId: SID, dayOfWeek, startTime: "13:00", endTime: "22:00" })),
      { studentId: SID, dayOfWeek: 6, startTime: "09:00", endTime: "18:00" },
    ],
  });

  // 최근 평일 10일 출결 (지각 1 · 조퇴 1 · 나머지 정상, 격일로 저녁 외출)
  const days = recentWeekdays(10);
  await prisma.attendanceRecord.createMany({
    data: days.map((d, i) => {
      if (i === 3) {
        return { studentId: SID, date: dateOnly(d), type: "TARDY" as const, checkIn: at(d, "13:42"), checkOut: at(d, "22:00"), notes: "학교 보충수업" };
      }
      if (i === 7) {
        return { studentId: SID, date: dateOnly(d), type: "EARLY_LEAVE" as const, checkIn: at(d, "12:55"), checkOut: at(d, "19:30"), notes: "병원 진료" };
      }
      return {
        studentId: SID,
        date: dateOnly(d),
        type: "NORMAL" as const,
        checkIn: at(d, `12:${50 + ((i * 7) % 10)}`),
        checkOut: at(d, `22:0${i % 5}`),
        outStart: i % 2 === 0 ? at(d, "18:00") : null,
        outEnd: i % 2 === 0 ? at(d, "18:50") : null,
      };
    }),
  });

  // 멘토링: 완료 2회(각각 학부모 리포트) + 예정 1회
  const mentorings = [
    {
      date: days[8],
      content: "모의고사 결과를 과목별로 점검하고 이번 달 학습 계획을 세웠습니다. 국어 독서 지문의 시간 배분을 집중적으로 다뤘습니다.",
      improvements: "주간 계획 달성률이 지난달 72%에서 85%로 올랐습니다.",
      weaknesses: "수학 미적분 극한 단원에서 개념 적용이 흔들립니다.",
      nextGoals: "미적분 기출 30문항 오답 정리, 국어 독서 하루 3지문",
    },
    {
      date: days[1],
      content: "지난 멘토링에서 정한 목표를 점검했습니다. 미적분 오답 정리를 꾸준히 해서 같은 유형 실수가 줄었습니다.",
      improvements: "수학 오답노트를 매일 작성하고 있고, 자습 중 휴대폰 사용이 줄었습니다.",
      weaknesses: "영어 빈칸 추론에서 시간이 오래 걸립니다.",
      nextGoals: "영어 빈칸 추론 하루 5문항 시간 재고 풀기, 9월 모평 오답 재풀이",
    },
  ];
  for (const m of mentorings) {
    const row = await prisma.mentoring.create({
      data: {
        studentId: SID,
        mentorId: MENTOR,
        scheduledAt: at(m.date, "20:00"),
        scheduledTimeStart: "20:00",
        scheduledTimeEnd: "20:30",
        actualDate: dateOnly(m.date),
        actualStartTime: "20:00",
        actualEndTime: "20:30",
        status: "COMPLETED",
        content: m.content,
        improvements: m.improvements,
        weaknesses: m.weaknesses,
        nextGoals: m.nextGoals,
        feedbackSentAt: at(m.date, "21:00"),
      },
    });
    await prisma.parentReport.create({
      data: {
        token: randomBytes(24).toString("base64url"),
        studentId: SID,
        mentoringId: row.id,
        createdById: MENTOR,
        createdAt: at(m.date, "21:00"),
        expiresAt: new Date(Date.now() + INVITE_DAYS * DAY_MS),
      },
    });
  }
  const next = addDays(TODAY, 5);
  await prisma.mentoring.create({
    data: {
      studentId: SID,
      mentorId: MENTOR,
      scheduledAt: at(next, "20:00"),
      scheduledTimeStart: "20:00",
      scheduledTimeEnd: "20:30",
      status: "SCHEDULED",
    },
  });

  // 상벌점
  await prisma.meritDemerit.createMany({
    data: [
      { studentId: SID, date: dateOnly(days[0]), type: "MERIT" as const, points: 2, reason: "주간 계획 100% 달성", category: "학습", createdById: MENTOR },
      { studentId: SID, date: dateOnly(days[4]), type: "MERIT" as const, points: 1, reason: "자습실 정리 도움", category: "생활", createdById: MENTOR },
      { studentId: SID, date: dateOnly(days[6]), type: "DEMERIT" as const, points: 1, reason: "자습 시간 휴대폰 미제출", category: "생활", createdById: MENTOR },
    ],
  });

  // 모의고사 성적 (6월·9월) — [등급, 백분위] (영어는 절대평가라 백분위 없음)
  const exams: { name: string; date: string; scores: Record<string, [number, number | null]> }[] = [
    { name: "6월 모의평가", date: "2026-06-04", scores: { 국어: [2, 89], 수학: [3, 81], 영어: [2, null], "사회·문화": [2, 90], 생활과윤리: [1, 96] } },
    { name: "9월 모의평가", date: "2026-09-03", scores: { 국어: [1, 96], 수학: [2, 90], 영어: [1, null], "사회·문화": [2, 91], 생활과윤리: [1, 97] } },
  ];
  await prisma.examScore.createMany({
    data: exams.flatMap((e) =>
      Object.entries(e.scores).map(([subject, [grade, percentile]]) => ({
        studentId: SID,
        examType: "OFFICIAL_MOCK" as const,
        examName: e.name,
        examDate: dateOnly(e.date),
        subject,
        grade,
        percentile,
      })),
    ),
  });

  // 수행평가 (데모 직원 담당): 완료 1 · 수정 요청 1(안 읽은 피드백) · 제출됨 1(직원 피드백 대기) · 등록 1
  const done = await prisma.performanceTask.create({
    data: {
      studentId: SID, subject: "사회·문화", title: "지역 사회 문제 탐구 보고서", dueDate: dateOnly(addDays(TODAY, -10)),
      description: "우리 지역의 사회 문제 하나를 골라 원인과 해결 방안을 조사합니다.", scoreWeight: 20, format: "보고서",
      status: "DONE", createdById: STAFF,
    },
  });
  const doneSub = await prisma.taskSubmission.create({
    data: { taskId: done.id, studentId: SID, version: 1, files: [], note: "최종본 제출합니다.", submittedAt: at(addDays(TODAY, -14), "21:10") },
  });
  await prisma.taskFeedback.create({
    data: {
      submissionId: doneSub.id, authorId: STAFF, content: "자료 출처가 분명하고 해결 방안이 구체적이에요. 이대로 제출해도 좋아요.",
      files: [], status: "APPROVED", createdAt: at(addDays(TODAY, -13), "20:40"), readByStudentAt: at(addDays(TODAY, -13), "22:00"),
    },
  });
  await prisma.taskResult.create({
    data: { taskId: done.id, studentId: SID, score: "A", consultantSummary: "탐구 과정이 체계적임", includeInReport: true, finalFiles: [], finalizedAt: at(addDays(TODAY, -10), "18:00") },
  });

  const revise = await prisma.performanceTask.create({
    data: {
      studentId: SID, subject: "국어", title: "현대시 비평문", dueDate: dateOnly(addDays(TODAY, 4)),
      description: "교과서 밖 현대시 한 편을 골라 표현 방식과 주제 의식을 분석합니다.", scoreWeight: 15, format: "비평문",
      status: "NEEDS_REVISION", createdById: STAFF,
    },
  });
  const reviseSub = await prisma.taskSubmission.create({
    data: { taskId: revise.id, studentId: SID, version: 1, files: [], note: "1차 초안입니다.", submittedAt: at(addDays(TODAY, -2), "21:30") },
  });
  await prisma.taskFeedback.create({
    data: {
      submissionId: reviseSub.id, authorId: STAFF, content: "작품 선정은 좋아요. 2문단의 근거를 시어 인용으로 보강해서 다시 올려 주세요.",
      files: [], status: "NEEDS_REVISION", createdAt: at(addDays(TODAY, -1), "20:15"),
    },
  });

  const submitted = await prisma.performanceTask.create({
    data: {
      studentId: SID, subject: "영어", title: "진로 영어 에세이", dueDate: dateOnly(addDays(TODAY, 7)),
      description: "희망 진로를 주제로 300단어 에세이를 씁니다.", scoreWeight: 10, format: "에세이",
      status: "SUBMITTED", createdById: STAFF,
    },
  });
  await prisma.taskSubmission.create({
    data: { taskId: submitted.id, studentId: SID, version: 1, files: [], note: "초안 올립니다. 문법 봐 주세요!", submittedAt: at(TODAY, "00:10") },
  });

  await prisma.performanceTask.create({
    data: {
      studentId: SID, subject: "수학", title: "수열 탐구 과제", dueDate: dateOnly(addDays(TODAY, 12)),
      description: "생활 속 수열의 예를 찾아 일반항을 세우고 설명합니다.", scoreWeight: 10, format: "탐구 보고서",
      status: "OPEN", createdById: STAFF,
    },
  });

  // 질문: 답변 1(안 읽음) · 해결 1
  const asked = addDays(TODAY, -2);
  const answered = addDays(TODAY, -1);
  await prisma.studentQuestion.create({
    data: {
      studentId: SID, title: "미적분 극한 문제 질문", subject: "수학", status: "ANSWERED",
      claimedById: MENTOR, claimedAt: at(asked, "21:00"),
      lastMessageAt: at(answered, "20:30"), studentReadAt: at(asked, "20:10"), staffReadAt: at(answered, "20:30"),
      createdAt: at(asked, "20:10"),
      messages: {
        create: [
          { senderType: "STUDENT", content: "분모가 0으로 가는 극한에서 언제 인수분해를 해야 하는지 헷갈려요.", attachments: [], createdAt: at(asked, "20:10") },
          { senderType: "STAFF", senderUserId: MENTOR, content: "0/0 꼴이면 먼저 인수분해나 유리화로 공통인수를 없애 보세요. 내일 자습 시간에 비슷한 유형 3문제 같이 풀어 봐요.", attachments: [], createdAt: at(answered, "20:30") },
        ],
      },
    },
  });
  const old = addDays(TODAY, -9);
  await prisma.studentQuestion.create({
    data: {
      studentId: SID, title: "영어 빈칸 추론 시간 줄이는 법", subject: "영어", status: "RESOLVED",
      claimedById: MENTOR, claimedAt: at(old, "19:00"),
      lastMessageAt: at(old, "19:20"), studentReadAt: at(old, "21:00"), staffReadAt: at(old, "19:20"),
      createdAt: at(old, "18:40"),
      messages: {
        create: [
          { senderType: "STUDENT", content: "빈칸 추론 한 문제에 3분 넘게 걸려요.", attachments: [], createdAt: at(old, "18:40") },
          { senderType: "STAFF", senderUserId: MENTOR, content: "빈칸 앞뒤 연결어부터 확인하는 습관을 들여 보세요. 하루 5문항씩 시간을 재며 풀어 봅시다.", attachments: [], createdAt: at(old, "19:20") },
        ],
      },
    },
  });

  // 담당 직원(컨설턴트)과 메시지 — 학생의 마지막 메시지를 직원이 아직 안 읽음
  const staffChatDay = addDays(TODAY, -3);
  await prisma.portalChat.create({
    data: {
      studentId: SID, staffId: STAFF,
      lastMessageAt: at(staffChatDay, "19:20"), studentReadAt: at(staffChatDay, "19:20"), staffReadAt: at(staffChatDay, "19:05"),
      messages: {
        create: [
          { senderType: "STAFF", senderUserId: STAFF, content: "비평문 피드백 남겼어요. 확인하고 다시 올려 주세요.", attachments: [], createdAt: at(staffChatDay, "19:00") },
          { senderType: "STUDENT", content: "네! 주말까지 고쳐서 올릴게요.", attachments: [], createdAt: at(staffChatDay, "19:20") },
        ],
      },
    },
  });

  // 담당 멘토와 메시지 (마지막 1건 안 읽음)
  const chatDay = addDays(TODAY, -1);
  await prisma.portalChat.create({
    data: {
      studentId: SID, staffId: MENTOR,
      lastMessageAt: at(chatDay, "21:05"), studentReadAt: at(chatDay, "20:50"), staffReadAt: at(chatDay, "21:05"),
      messages: {
        create: [
          { senderType: "STAFF", senderUserId: MENTOR, content: "오늘 수학 오답노트 몇 문제 정리했어?", attachments: [], createdAt: at(chatDay, "20:40") },
          { senderType: "STUDENT", content: "미적분 5문제 정리했어요!", attachments: [], createdAt: at(chatDay, "20:50") },
          { senderType: "STAFF", senderUserId: MENTOR, content: "좋아. 다음 멘토링 때 같이 확인하자.", attachments: [], createdAt: at(chatDay, "21:05") },
        ],
      },
    },
  });
}

// ─── 계정·초대 ──────────────────────────────────────────────────────────

/** 계정이 없으면 만들고 비밀번호를 발급한다. 있으면 reset 일 때만 비밀번호를 바꾼다. 반환: 알고 있는 비밀번호 */
async function ensureAccount(opts: {
  id: string;
  username: string;
  name: string;
  studentId?: string;
  appUserId?: string;
  saved: string | undefined;
  reset: boolean;
}) {
  const existing = await prisma.authUser.findUnique({ where: { id: opts.id } });
  if (existing && !opts.reset) return opts.saved;

  const password = newPassword();
  const hash = await hashPassword(password);
  if (!existing) {
    await prisma.authUser.create({
      data: {
        id: opts.id,
        name: opts.name,
        email: `${opts.username}@example.com`,
        username: opts.username,
        displayUsername: opts.username,
        studentId: opts.studentId ?? null,
        appUserId: opts.appUserId ?? null,
      },
    });
  }
  await prisma.authAccount.upsert({
    where: { providerId_accountId: { providerId: "credential", accountId: opts.id } },
    update: { password: hash },
    create: { id: `${opts.id}-credential`, providerId: "credential", accountId: opts.id, userId: opts.id, password: hash },
  });
  return password;
}

/** 저장해 둔 초대 코드 중 아직 쓸 수 있는 것은 두고, 모자라면 새로 발급 */
async function ensureInvites(saved: string[] | undefined) {
  const keep: string[] = [];
  for (const code of saved ?? []) {
    const row = await prisma.authInvitation.findUnique({ where: { tokenHash: hashAuthToken(code) } });
    if (row && !row.acceptedAt && !row.revokedAt && row.expiresAt > new Date()) keep.push(code);
  }
  while (keep.length < INVITE_COUNT) {
    const code = newInviteCode();
    await prisma.authInvitation.create({
      data: {
        type: "PARENT",
        tokenHash: hashAuthToken(code),
        targetStudentId: SID,
        targetStudentIds: [SID],
        parentRelation: "모",
        invitedById: MENTOR,
        expiresAt: new Date(Date.now() + INVITE_DAYS * DAY_MS),
      },
    });
    keep.push(code);
  }
  return keep;
}

function reviewNotes(s: { studentPassword?: string; parentPassword?: string; staffPassword?: string; invites: string[] }) {
  const pw = (v: string | undefined) => v ?? "(모름 — --reset-passwords 로 재발급)";
  return `# App Store 심사용 데모 계정 (${isProd ? "운영" : "개발"} DB ${projectRef})

커밋 금지 — 저장소가 공개다. 갱신: ${new Date().toISOString()}

| 계정 | 아이디 | 비밀번호 |
|---|---|---|
| 학생 | ${STUDENT_USERNAME} | ${pw(s.studentPassword)} |
| 학부모 | ${PARENT_USERNAME} | ${pw(s.parentPassword)} |
| 직원(컨설턴트) | ${STAFF_USERNAME} | ${pw(s.staffPassword)} |

가입·탈퇴 시험용 학부모 초대 코드(1회용, 발급 후 ${INVITE_DAYS}일): ${s.invites.join(", ")}

## App Review Information > Sign-In Information

- User name: ${STUDENT_USERNAME}
- Password: ${pw(s.studentPassword)}

## App Review Information > Notes

\`\`\`
강한선배 (KHSB) is the member app of KHSB, a managed study hall in Dongtan, Korea.
Anyone can enroll at the study hall; after enrolling, students and parents receive an
invitation link or code from the study hall and create an account in the app
(Login screen > "초대받았어요" tab). The app has no in-app purchases; lunch box orders
are real meals served at the study hall and are paid by bank transfer.
The UI is in Korean.

Demo accounts (Login screen > "로그인" tab). All three are tied to a fictional student
created for review; all data shown is sample data.
- Student: ${STUDENT_USERNAME} / ${pw(s.studentPassword)}
- Parent:  ${PARENT_USERNAME} / ${pw(s.parentPassword)}
- Staff:   ${STAFF_USERNAME} / ${pw(s.staffPassword)}
  (consultant role: sees only the student assigned to it — assignments, feedback,
  messages, notices, calendar. Attendance, seat map, patrol QR and mentoring screens are
  limited to on-site staff roles because they list every real student, so they are not
  available to this review account.)

Account deletion:
- 전체 (last tab) > 계정·보안 > 계정 삭제 > confirm > enter password. The account is
  deleted immediately and the user is signed out on all devices.
- To test sign-up and deletion without removing the demo accounts, use one of these
  one-time invite codes: Login screen > "초대받았어요" > paste the code > sign up
  (creates a new parent account): ${s.invites.join(" or ")}

Support and privacy:
- In app: 전체 > 고객센터, and 전체 > 계정·보안 > 도움말 (고객센터, 전화 문의,
  이메일 문의, 개인정보처리방침). Links are also at the bottom of the login screen.
- Support: https://www.kanghanseonbae.com/support.html (kanghanseonbae@naver.com)
- Privacy policy: https://www.kanghanseonbae.com/privacy.html

User-generated content: there is no public posting or chat between users. Messages,
questions and inquiries are one-to-one between a student/parent and study-hall staff.

Permissions: the camera is used to scan seat QR codes during staff patrols and to take
photos for questions, messages and mentoring notes. The photo library is used to attach
photos.
\`\`\`
`;
}

async function apply() {
  const saved = loadSecrets();
  const reset = args.has("--reset-passwords");

  await upsertPeople();
  await resetContent();
  await createContent();

  const studentPassword = await ensureAccount({
    id: STUDENT_AUTH, username: STUDENT_USERNAME, name: "데모 학생", studentId: SID,
    saved: saved.studentPassword, reset,
  });
  const parentPassword = await ensureAccount({
    id: PARENT_AUTH, username: PARENT_USERNAME, name: "데모 학생 학부모",
    saved: saved.parentPassword, reset,
  });
  const staffPassword = await ensureAccount({
    id: STAFF_AUTH, username: STAFF_USERNAME, name: "데모 직원", appUserId: STAFF,
    saved: saved.staffPassword, reset,
  });
  await prisma.parentLink.upsert({
    where: { authUserId_studentId: { authUserId: PARENT_AUTH, studentId: SID } },
    update: {},
    create: { authUserId: PARENT_AUTH, studentId: SID, relation: "모" },
  });
  const invites = await ensureInvites(saved.invites);

  const secrets: Secrets = { studentPassword, parentPassword, staffPassword, invites, updatedAt: new Date().toISOString() };
  mkdirSync(SECRET_DIR, { recursive: true });
  writeFileSync(secretJson, JSON.stringify(secrets, null, 2));
  writeFileSync(secretMd, reviewNotes({ studentPassword, parentPassword, staffPassword, invites }));
  console.log(`완료 — 계정·초대 코드·심사 노트: ${secretMd}`);
}

async function main() {
  console.log(`대상 DB: ${projectRef}${isProd ? " (운영)" : ""} · 모드: ${mode} · 기준일(KST): ${TODAY}`);
  if (mode === "check") {
    const student = await prisma.student.findUnique({ where: { id: SID }, select: { name: true, status: true } });
    console.log(student ? `데모 학생 있음: ${student.name} (${student.status})` : "데모 학생 없음");
    console.log("만들기: --apply, 지우기: --delete (운영 DB 는 --prod 도 필요)");
    return;
  }
  if (isProd && !args.has("--prod")) throw new Error("운영 DB 입니다. 의도한 것이면 --prod 를 붙여 다시 실행하세요.");
  if (mode === "delete") await deleteAll();
  else await apply();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
