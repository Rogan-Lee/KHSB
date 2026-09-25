import { prisma } from "@/lib/prisma";
import { todayKST } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// 학부모 앱 — 성장 탭 (성적 · 영단어 · 생활 · 과제)
// 모든 라우트는 requireParentChild 로 자녀 소유를 확인한 뒤 여기를 부른다.
// 개인정보: 성적 메모(ExamScore.notes)·영단어 메모·수행평가 제출물/피드백은 보내지 않는다.
//           상벌점은 visibleInReport=true 만, 누적 잔액(포인트)은 계산하지 않는다.
// ─────────────────────────────────────────────────────────────────────

/** @db.Date(UTC 자정) → "YYYY-MM-DD" */
function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** 시각 → KST 날짜 "YYYY-MM-DD" */
function kstDateKey(date: Date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ─── 성적 ────────────────────────────────────────────────────────────

const EXAM_TYPE_LABEL: Record<string, string> = {
  OFFICIAL_MOCK: "공식 모의고사",
  PRIVATE_MOCK: "사설 모의고사",
  SCHOOL_EXAM: "내신",
  DUFF: "더프",
};

const MOCK_TYPES = new Set(["OFFICIAL_MOCK", "PRIVATE_MOCK", "DUFF"]);

// 과목 표시 순서 — 국·수·영·한국사·탐구·그 외(가나다)
const SUBJECT_ORDER = ["국어", "수학", "영어", "한국사"];
function subjectRank(subject: string) {
  const i = SUBJECT_ORDER.findIndex((s) => subject.startsWith(s));
  return i === -1 ? SUBJECT_ORDER.length : i;
}
function compareSubject(a: string, b: string) {
  return subjectRank(a) - subjectRank(b) || a.localeCompare(b, "ko");
}

/** 평균 등급에서 빼는 과목 (절대평가·선택 과목) */
function countsTowardAverage(subject: string) {
  return !subject.includes("한국사") && !subject.includes("제2외국어");
}

export type ParentExamGroup = {
  key: string;
  name: string;
  type: string;
  typeLabel: string;
  date: string;
  averageGrade: number | null;
  subjects: { subject: string; grade: number | null; rawScore: number | null; percentile: number | null }[];
};

export type ParentExamsResponse = {
  studentId: string;
  groups: ParentExamGroup[];
  /** 모의고사 평균·과목 등급 추이 (오래된 → 최근, 최대 10회) */
  trend: { key: string; date: string; name: string; averageGrade: number | null; grades: Record<string, number> }[];
  trendSubjects: string[];
  /** 모의고사 기준 과목별 처음 → 최근 등급 */
  subjectChanges: {
    subject: string;
    first: number;
    latest: number;
    firstExam: string;
    latestExam: string;
    /** 양수 = 등급이 올랐어요(숫자가 작아짐) */
    change: number;
  }[];
};

export async function getParentExams(studentId: string): Promise<ParentExamsResponse> {
  const scores = await prisma.examScore.findMany({
    where: { studentId },
    orderBy: [{ examDate: "desc" }, { createdAt: "asc" }],
    take: 400,
    select: {
      examType: true,
      examName: true,
      examDate: true,
      subject: true,
      rawScore: true,
      grade: true,
      percentile: true,
    },
  });

  const map = new Map<string, ParentExamGroup>();
  for (const s of scores) {
    const date = dateKey(s.examDate);
    const key = `${s.examType}|${date}|${s.examName}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        name: s.examName,
        type: s.examType,
        typeLabel: EXAM_TYPE_LABEL[s.examType] ?? "시험",
        date,
        averageGrade: null,
        subjects: [],
      };
      map.set(key, g);
    }
    g.subjects.push({
      subject: s.subject,
      grade: s.grade,
      rawScore: s.rawScore,
      percentile: s.percentile,
    });
  }

  const all = [...map.values()];
  for (const g of all) {
    g.subjects.sort((a, b) => compareSubject(a.subject, b.subject));
    const graded = g.subjects.filter((s) => s.grade != null && countsTowardAverage(s.subject));
    g.averageGrade = graded.length
      ? round1(graded.reduce((sum, s) => sum + (s.grade ?? 0), 0) / graded.length)
      : null;
  }
  // 최근 시험이 먼저 (날짜 같으면 이름순)
  all.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name, "ko") : a.date < b.date ? 1 : -1));

  const mocks = all
    .filter((g) => MOCK_TYPES.has(g.type) && g.subjects.some((s) => s.grade != null))
    .reverse(); // 오래된 → 최근
  const trendGroups = mocks.slice(-10);
  const trend = trendGroups.map((g) => ({
    key: g.key,
    date: g.date,
    name: g.name,
    averageGrade: g.averageGrade,
    grades: Object.fromEntries(
      g.subjects.filter((s) => s.grade != null).map((s) => [s.subject, s.grade as number]),
    ),
  }));

  const subjectSeen = new Map<string, number>();
  for (const t of trend) for (const s of Object.keys(t.grades)) subjectSeen.set(s, (subjectSeen.get(s) ?? 0) + 1);
  const trendSubjects = [...subjectSeen.entries()]
    .filter(([, n]) => n >= 2)
    .map(([s]) => s)
    .sort(compareSubject);

  const first = new Map<string, { grade: number; exam: string }>();
  const latest = new Map<string, { grade: number; exam: string }>();
  for (const g of mocks) {
    for (const s of g.subjects) {
      if (s.grade == null) continue;
      if (!first.has(s.subject)) first.set(s.subject, { grade: s.grade, exam: g.name });
      latest.set(s.subject, { grade: s.grade, exam: g.name });
    }
  }
  const subjectChanges = [...first.keys()]
    .filter((subject) => mocks.filter((g) => g.subjects.some((s) => s.subject === subject && s.grade != null)).length >= 2)
    .sort(compareSubject)
    .map((subject) => {
      const f = first.get(subject)!;
      const l = latest.get(subject)!;
      return {
        subject,
        first: f.grade,
        latest: l.grade,
        firstExam: f.exam,
        latestExam: l.exam,
        change: f.grade - l.grade,
      };
    });

  return { studentId, groups: all.slice(0, 20), trend, trendSubjects, subjectChanges };
}

// ─── 영단어 ──────────────────────────────────────────────────────────

export type ParentVocabItem = {
  id: string;
  source: "paper" | "online";
  date: string;
  title: string;
  score: number;
  correct: number;
  total: number;
};

export type ParentVocabResponse = {
  studentId: string;
  stats: { count: number; average: number | null; latest: number | null };
  /** 오래된 → 최근, 최대 12회 */
  trend: { id: string; date: string; score: number }[];
  /** 최근 → 오래된, 최대 20회 */
  recent: ParentVocabItem[];
};

export async function getParentVocab(studentId: string): Promise<ParentVocabResponse> {
  const [paper, online, paperAgg, onlineAgg] = await Promise.all([
    prisma.vocabTestScore.findMany({
      where: { studentId },
      orderBy: [{ testDate: "desc" }, { createdAt: "desc" }],
      take: 40,
      select: { id: true, testDate: true, totalWords: true, correctWords: true, score: true },
    }),
    prisma.vocabAttempt.findMany({
      where: { studentId, status: "SUBMITTED", score: { not: null } },
      orderBy: { submittedAt: "desc" },
      take: 40,
      select: {
        id: true,
        submittedAt: true,
        assignedAt: true,
        score: true,
        correctCount: true,
        totalQuestions: true,
        exam: { select: { title: true } },
      },
    }),
    prisma.vocabTestScore.aggregate({ where: { studentId }, _count: { _all: true }, _avg: { score: true } }),
    prisma.vocabAttempt.aggregate({
      where: { studentId, status: "SUBMITTED", score: { not: null } },
      _count: { _all: true },
      _avg: { score: true },
    }),
  ]);

  const items: ParentVocabItem[] = [
    ...paper.map((p) => ({
      id: `paper:${p.id}`,
      source: "paper" as const,
      date: dateKey(p.testDate),
      title: "영단어 시험",
      score: round1(p.score),
      correct: p.correctWords,
      total: p.totalWords,
    })),
    ...online.map((o) => ({
      id: `online:${o.id}`,
      source: "online" as const,
      date: kstDateKey(o.submittedAt ?? o.assignedAt),
      title: o.exam.title || "온라인 영단어 시험",
      score: round1(o.score ?? 0),
      correct: o.correctCount,
      total: o.totalQuestions,
    })),
  ].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));

  const paperCount = paperAgg._count._all;
  const onlineCount = onlineAgg._count._all;
  const count = paperCount + onlineCount;
  const average =
    count > 0
      ? round1(
          ((paperAgg._avg.score ?? 0) * paperCount + (onlineAgg._avg.score ?? 0) * onlineCount) / count,
        )
      : null;

  return {
    studentId,
    stats: { count, average, latest: items[0]?.score ?? null },
    trend: items
      .slice(0, 12)
      .reverse()
      .map((i) => ({ id: i.id, date: i.date, score: i.score })),
    recent: items.slice(0, 20),
  };
}

// ─── 생활 (상벌점 · 원생 기록) ───────────────────────────────────────

export type ParentMeritMonth = {
  /** "YYYY-MM" */
  month: string;
  year: number;
  monthNumber: number;
  merit: { count: number; points: number };
  demerit: { count: number; points: number };
  /** 리포트 공개로 표시된 원생 기록 (없으면 null) */
  note: string | null;
  items: {
    id: string;
    date: string;
    type: "MERIT" | "DEMERIT";
    points: number;
    reason: string;
    category: string | null;
  }[];
};

export type ParentMeritsResponse = { studentId: string; months: ParentMeritMonth[] };

const MERIT_MONTHS = 12;

export async function getParentMerits(studentId: string): Promise<ParentMeritsResponse> {
  const today = todayKST();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (MERIT_MONTHS - 1), 1));
  const fromYear = from.getUTCFullYear();
  const fromMonth = from.getUTCMonth() + 1;

  const [merits, notes] = await Promise.all([
    prisma.meritDemerit.findMany({
      where: { studentId, visibleInReport: true, date: { gte: from } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 500,
      select: { id: true, date: true, type: true, points: true, reason: true, category: true },
    }),
    prisma.monthlyNote.findMany({
      where: {
        studentId,
        visibleInReport: true,
        OR: [{ year: { gt: fromYear } }, { year: fromYear, month: { gte: fromMonth } }],
      },
      orderBy: { updatedAt: "desc" },
      select: { year: true, month: true, content: true },
    }),
  ]);

  const months = new Map<string, ParentMeritMonth>();
  const ensure = (year: number, monthNumber: number) => {
    const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
    let m = months.get(month);
    if (!m) {
      m = {
        month,
        year,
        monthNumber,
        merit: { count: 0, points: 0 },
        demerit: { count: 0, points: 0 },
        note: null,
        items: [],
      };
      months.set(month, m);
    }
    return m;
  };

  for (const r of merits) {
    const m = ensure(r.date.getUTCFullYear(), r.date.getUTCMonth() + 1);
    const bucket = r.type === "MERIT" ? m.merit : m.demerit;
    bucket.count += 1;
    bucket.points += r.points;
    m.items.push({
      id: r.id,
      date: dateKey(r.date),
      type: r.type,
      points: r.points,
      reason: r.reason,
      category: r.category,
    });
  }
  for (const n of notes) {
    if (!n.content?.trim()) continue;
    const m = ensure(n.year, n.month);
    // updatedAt desc — 달마다 가장 최근 기록 하나
    if (m.note == null) m.note = n.content.trim();
  }

  return {
    studentId,
    months: [...months.values()].sort((a, b) => (a.month < b.month ? 1 : -1)),
  };
}

// ─── 과제 (수행평가 진행) ────────────────────────────────────────────

const TASK_STATUS_LABEL: Record<string, string> = {
  OPEN: "진행 전",
  IN_PROGRESS: "진행 중",
  SUBMITTED: "제출 완료",
  NEEDS_REVISION: "수정 필요",
  DONE: "최종 완료",
};

export type ParentTaskItem = {
  id: string;
  subject: string;
  title: string;
  dueDate: string;
  status: string;
  statusLabel: string;
  /** 리포트 공개로 확정된 결과 점수 (없으면 null) */
  score: string | null;
};

export type ParentTasksResponse = {
  studentId: string;
  isOnlineManaged: boolean;
  counts: {
    total: number;
    open: number;
    inProgress: number;
    submitted: number;
    needsRevision: number;
    done: number;
  };
  /** 마감 전 · 완료 전 (가까운 순, 최대 10) */
  upcoming: ParentTaskItem[];
  /** 마감 지났는데 아직 제출 전 (최대 10) */
  overdue: ParentTaskItem[];
  /** 최근 완료 (최대 5) */
  recentDone: ParentTaskItem[];
};

export async function getParentTasks(studentId: string): Promise<ParentTasksResponse> {
  const [student, tasks] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId }, select: { isOnlineManaged: true } }),
    prisma.performanceTask.findMany({
      where: { studentId },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: 300,
      select: {
        id: true,
        subject: true,
        title: true,
        dueDate: true,
        status: true,
        result: { select: { score: true, includeInReport: true } },
      },
    }),
  ]);

  const today = todayKST().getTime();
  const toItem = (t: (typeof tasks)[number]): ParentTaskItem => ({
    id: t.id,
    subject: t.subject,
    title: t.title,
    dueDate: dateKey(t.dueDate),
    status: t.status,
    statusLabel: TASK_STATUS_LABEL[t.status] ?? t.status,
    score: t.result?.includeInReport ? (t.result.score ?? null) : null,
  });

  const count = (status: string) => tasks.filter((t) => t.status === status).length;
  const notDone = tasks.filter((t) => t.status !== "DONE");

  return {
    studentId,
    isOnlineManaged: !!student?.isOnlineManaged,
    counts: {
      total: tasks.length,
      open: count("OPEN"),
      inProgress: count("IN_PROGRESS"),
      submitted: count("SUBMITTED"),
      needsRevision: count("NEEDS_REVISION"),
      done: count("DONE"),
    },
    upcoming: notDone.filter((t) => t.dueDate.getTime() >= today).slice(0, 10).map(toItem),
    overdue: notDone
      .filter((t) => t.dueDate.getTime() < today && t.status !== "SUBMITTED")
      .reverse()
      .slice(0, 10)
      .map(toItem),
    recentDone: tasks
      .filter((t) => t.status === "DONE")
      .reverse()
      .slice(0, 5)
      .map(toItem),
  };
}
