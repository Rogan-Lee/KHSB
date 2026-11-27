import { z } from "zod";

import { getAppUrl } from "@/lib/app-url";
import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────
// 학부모 앱 — 월간 리포트 네이티브 화면 데이터 (GET /api/mobile/v1/parent/reports/monthly/[id])
//
// 웹 학부모 월간 리포트(/r/monthly/[token])와 같은 조회·같은 공개 범위:
//  · 발송된(sentAt 있음) 리포트만, 이 학부모에게 연결된(ParentLink·재원) 자녀 것만. 아니면 404(존재 숨김).
//  · 원생 기록(MonthlyNote)·상벌점(MeritDemerit)은 visibleInReport=true 만.
//  · 순찰은 특이사항(NOTE)의 사유 글만 — 웹과 동일. AttendanceRecord.notes·멘토 메모 등은 조회하지 않는다.
//  · 이달의 시상은 전체 목록(웹과 동일)이지만 다른 학생의 id 는 내보내지 않고 "우리 아이"만 표시.
// 날짜 경계는 서버 시간대와 무관하게: @db.Date 컬럼은 UTC 자정 기준 그 달, 시각 컬럼은 KST 달력 기준 그 달.
// ─────────────────────────────────────────────────────────────────────

type ParentScope = { authUserId: string; children: { id: string }[] };

export type MonthlyExamType = "OFFICIAL_MOCK" | "PRIVATE_MOCK" | "SCHOOL_EXAM" | "DUFF";

export type MonthlyExamSubject = {
  subject: string;
  grade: number | null;
  percentile: number | null;
  rawScore: number | null;
};

export type MonthlyRecentExam = {
  key: string;
  name: string;
  type: MonthlyExamType;
  typeLabel: string;
  /** YYYY-MM-DD */
  date: string;
  /** 리포트 달(year·month)에 본 시험 */
  isThisMonth: boolean;
  subjects: MonthlyExamSubject[];
};

/** 추이 차트 한 점(가로축 한 칸) — 시리즈 키(시험 종류 또는 과목) → 값 */
export type MonthlyTrendRow = {
  key: string;
  /** YYYY-MM-DD */
  date: string;
  /** 시험 이름 (종류별 보기에서는 그날 본 시험들을 " · " 로) */
  title: string;
  grade: Record<string, number>;
  percentile: Record<string, number>;
};

export type MonthlyExamTrend = {
  /** 데이터에 있는 시험 종류 (공식 → 사설 → 내신 → 더프) */
  examTypes: MonthlyExamType[];
  /** 데이터에 있는 과목 (국어·수학·영어·한국사 → 그 외 가나다) */
  subjects: string[];
  /** 날짜별 · 종류별 과목 평균 (소수 둘째 자리) */
  byType: MonthlyTrendRow[];
  /** 시험(날짜+이름)별 · 과목별 값 */
  bySubject: MonthlyTrendRow[];
};

export type ParentMonthlyReport = {
  id: string;
  year: number;
  month: number;
  /** 발송 시각 ISO */
  sentAt: string;
  student: {
    id: string;
    name: string;
    school: string | null;
    grade: string;
    targetUniversity: string | null;
  };
  /** 첫 화면 요약 — 상벌점은 리포트에 보이는(visibleInReport) 것만 */
  summary: {
    mentoringCount: number;
    meritPoints: number;
    demeritPoints: number;
    /** 보이는 상벌점 건수 (0 이면 "없음") */
    meritItemCount: number;
    patrolNoteCount: number;
  };
  /** ① 월간 멘토링 종합 의견 (마크다운) */
  mentoringSummary: string | null;
  /** ② 원장님 한마디 (마크다운) */
  directorComment: string | null;
  /** ③ 모의고사 성적 — 성적이 하나도 없으면 null */
  exams: { recent: MonthlyRecentExam[]; trend: MonthlyExamTrend } | null;
  /** ④ 영단어 — 이달 시험이 없으면 null */
  vocab: {
    count: number;
    average: number;
    latest: number;
    points: { id: string; date: string; score: number; correct: number; total: number }[];
  } | null;
  /** ⑤ 원생 기록 (visibleInReport, 내용 있는 것만) */
  note: { content: string } | null;
  /** ⑤ 상벌점 (visibleInReport 만, 날짜 오름차순) */
  merits: {
    merit: { count: number; points: number };
    demerit: { count: number; points: number };
    items: {
      id: string;
      /** YYYY-MM-DD */
      date: string;
      type: "MERIT" | "DEMERIT";
      points: number;
      reason: string;
      category: string | null;
    }[];
  };
  /** ⑥ 순찰 점검 */
  patrol: {
    noteCount: number;
    absentCount: number;
    /** 특이사항 사유 (KST "M/D") */
    notes: { id: string; date: string; note: string }[];
  };
  /** ⑦ 이달의 기록 사진 (리포트에 첨부된 순서) */
  photos: { id: string; url: string; thumbnailUrl: string | null }[];
  /** ⑧ 주요 입시 정보 (학년별 → 전체) */
  admissionInfo: string | null;
  /** ⑨ 독서실 공지사항 */
  notices: {
    operations: string | null;
    awards: {
      id: string;
      name: string;
      category: string;
      categoryLabel: string;
      description: string | null;
      /** 이 리포트의 학생 */
      isMine: boolean;
    }[];
    recommendation: string | null;
  };
};

const idSchema = z.string().trim().min(1).max(64);

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 최근 성적 행 수 — 시험 하나 ≈ 과목 5~8행 */
const EXAM_SCORE_LIMIT = 160;

const TREND_EXAM_TYPES = ["OFFICIAL_MOCK", "PRIVATE_MOCK", "SCHOOL_EXAM"] as const;
const EXAM_TYPE_ORDER: MonthlyExamType[] = ["OFFICIAL_MOCK", "PRIVATE_MOCK", "SCHOOL_EXAM", "DUFF"];
export const EXAM_TYPE_LABEL: Record<MonthlyExamType, string> = {
  OFFICIAL_MOCK: "공식 모의",
  PRIVATE_MOCK: "사설 모의",
  SCHOOL_EXAM: "내신",
  DUFF: "더프",
};

const AWARD_LABEL: Record<string, string> = {
  ATTITUDE: "학습 태도 우수자",
  MENTOR_PICK: "멘토 선정 우수자",
};

// ─── 날짜 ────────────────────────────────────────────────────────────

/** 리포트 달의 조회 경계 — @db.Date 는 UTC 자정, 시각 컬럼은 KST 달력 (끝은 미포함) */
export function monthlyReportRange(year: number, month: number) {
  const dateStart = new Date(Date.UTC(year, month - 1, 1));
  const dateEnd = new Date(Date.UTC(year, month, 1));
  return {
    dateStart,
    dateEnd,
    kstStart: new Date(dateStart.getTime() - KST_OFFSET_MS),
    kstEnd: new Date(dateEnd.getTime() - KST_OFFSET_MS),
  };
}

/** @db.Date → "YYYY-MM-DD" */
function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** 시각 → KST "M/D" */
function kstMonthDay(date: Date) {
  const k = new Date(date.getTime() + KST_OFFSET_MS);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── 성적 ────────────────────────────────────────────────────────────

const SUBJECT_ORDER = ["국어", "수학", "영어", "한국사"];
function subjectRank(subject: string) {
  const i = SUBJECT_ORDER.findIndex((s) => subject.startsWith(s));
  return i === -1 ? SUBJECT_ORDER.length : i;
}
function compareSubject(a: string, b: string) {
  return subjectRank(a) - subjectRank(b) || a.localeCompare(b, "ko");
}

export type MonthlyExamScoreRow = {
  examName: string;
  examType: string;
  examDate: Date;
  subject: string;
  grade: number | null;
  percentile: number | null;
  rawScore: number | null;
};

function asExamType(value: string): MonthlyExamType {
  return (EXAM_TYPE_ORDER as string[]).includes(value) ? (value as MonthlyExamType) : "OFFICIAL_MOCK";
}

/**
 * 모의고사 성적 섹션 — 웹 월간 리포트와 같은 규칙.
 *  · 최근 응시 시험: 날짜+이름으로 묶은 최신 2개를 직전 → 최근 순으로. isThisMonth 는 리포트 달에 본 시험만.
 *  · 추이: 종류별(날짜마다 종류별 과목 평균) · 과목별(시험마다 과목 값), 등급·백분위 둘 다.
 * scores 는 날짜 오름차순.
 */
export function buildMonthlyExams(
  scores: MonthlyExamScoreRow[],
  year: number,
  month: number,
): ParentMonthlyReport["exams"] {
  if (scores.length === 0) return null;
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  // 시험(날짜+이름) 묶음
  const groups = new Map<string, MonthlyRecentExam>();
  for (const s of scores) {
    const date = dateKey(s.examDate);
    const key = `${date}__${s.examName}`;
    let g = groups.get(key);
    if (!g) {
      const type = asExamType(s.examType);
      g = {
        key,
        name: s.examName,
        type,
        typeLabel: EXAM_TYPE_LABEL[type],
        date,
        isThisMonth: date.slice(0, 7) === monthKey,
        subjects: [],
      };
      groups.set(key, g);
    }
    g.subjects.push({
      subject: s.subject,
      grade: s.grade,
      percentile: s.percentile,
      rawScore: s.rawScore,
    });
  }
  const ordered = [...groups.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "ko"),
  );
  for (const g of ordered) g.subjects.sort((a, b) => compareSubject(a.subject, b.subject));
  const recent = ordered.slice(-2);

  // 과목별 — 시험마다 과목 값 (같은 과목이 두 번이면 나중 값)
  const bySubject: MonthlyTrendRow[] = ordered.map((g) => {
    const row: MonthlyTrendRow = { key: g.key, date: g.date, title: g.name, grade: {}, percentile: {} };
    for (const s of g.subjects) {
      if (s.grade != null) row.grade[s.subject] = round2(s.grade);
      if (s.percentile != null) row.percentile[s.subject] = round2(s.percentile);
    }
    return row;
  });

  // 종류별 — 날짜마다 종류별 과목 평균
  type Acc = { names: Map<MonthlyExamType, string[]>; grade: Map<MonthlyExamType, number[]>; pct: Map<MonthlyExamType, number[]> };
  const byDate = new Map<string, Acc>();
  for (const s of scores) {
    const date = dateKey(s.examDate);
    const type = asExamType(s.examType);
    let acc = byDate.get(date);
    if (!acc) {
      acc = { names: new Map(), grade: new Map(), pct: new Map() };
      byDate.set(date, acc);
    }
    const names = acc.names.get(type) ?? [];
    if (!names.includes(s.examName)) names.push(s.examName);
    acc.names.set(type, names);
    if (s.grade != null) acc.grade.set(type, [...(acc.grade.get(type) ?? []), s.grade]);
    if (s.percentile != null) acc.pct.set(type, [...(acc.pct.get(type) ?? []), s.percentile]);
  }
  const avg = (values: number[]) => round2(values.reduce((sum, v) => sum + v, 0) / values.length);
  const byType: MonthlyTrendRow[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, acc]) => {
      const row: MonthlyTrendRow = {
        key: date,
        date,
        title: EXAM_TYPE_ORDER.flatMap((t) => acc.names.get(t) ?? []).join(" · "),
        grade: {},
        percentile: {},
      };
      for (const t of EXAM_TYPE_ORDER) {
        const g = acc.grade.get(t);
        const p = acc.pct.get(t);
        if (g?.length) row.grade[t] = avg(g);
        if (p?.length) row.percentile[t] = avg(p);
      }
      return row;
    });

  const typeSet = new Set(scores.map((s) => asExamType(s.examType)));
  return {
    recent,
    trend: {
      examTypes: EXAM_TYPE_ORDER.filter((t) => typeSet.has(t)),
      subjects: [...new Set(scores.map((s) => s.subject))].sort(compareSubject),
      byType,
      bySubject,
    },
  };
}

// ─── 마크다운 ────────────────────────────────────────────────────────

/** 앱은 웹 도메인 밖이라 상대 경로 링크·이미지(](/…))를 절대 주소로 바꾼다 */
function absolutize(markdown: string | null | undefined, appUrl: string): string | null {
  const text = markdown?.trim();
  if (!text) return null;
  return text.replace(/\]\(\/(?!\/)/g, `](${appUrl}/`);
}

// ─── 조회 ────────────────────────────────────────────────────────────

/**
 * 학부모 월간 리포트 한 건 — 라우트 GET /api/mobile/v1/parent/reports/monthly/[id] 가 호출.
 * parent 는 requireMobileParent(request) 결과(연결된 재원 자녀 목록).
 */
export async function getParentMonthlyReport(
  parent: ParentScope,
  reportId: string,
): Promise<ParentMonthlyReport> {
  const parsed = idSchema.safeParse(reportId);
  const report = parsed.success
    ? await prisma.monthlyReport.findUnique({
        where: { id: parsed.data },
        select: {
          id: true,
          studentId: true,
          year: true,
          month: true,
          sentAt: true,
          mentoringCount: true,
          mentoringSummary: true,
          overallComment: true,
          patrolNoteCount: true,
          patrolAbsentCount: true,
          attachedPhotoIds: true,
          student: {
            select: { id: true, name: true, school: true, grade: true, targetUniversity: true },
          },
        },
      })
    : null;
  if (!report || !report.sentAt || !parent.children.some((c) => c.id === report.studentId)) {
    throw new MobileApiError("리포트를 찾을 수 없어요", 404);
  }

  const { year, month, student } = report;
  const studentId = report.studentId;
  const { dateStart, dateEnd, kstStart, kstEnd } = monthlyReportRange(year, month);

  const [
    monthlyNote,
    merits,
    patrolRecords,
    examScoresDesc,
    vocabScores,
    gradeAdmission,
    commonAdmission,
    operationsNotice,
    awards,
    recommendation,
    photos,
  ] = await Promise.all([
    prisma.monthlyNote.findFirst({
      where: { studentId, year, month, visibleInReport: true },
      orderBy: { updatedAt: "desc" },
      select: { content: true },
    }),
    prisma.meritDemerit.findMany({
      where: { studentId, date: { gte: dateStart, lt: dateEnd }, visibleInReport: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { id: true, date: true, type: true, points: true, reason: true, category: true },
    }),
    prisma.patrolRecord.findMany({
      where: {
        studentId,
        status: "NOTE",
        note: { not: null },
        round: { startedAt: { gte: kstStart, lt: kstEnd } },
      },
      orderBy: { checkedAt: "asc" },
      select: { id: true, note: true, checkedAt: true },
    }),
    // 웹은 오래된 순 50행이라 기록이 많으면 최근 시험이 잘린다 → 최근 행을 받아 뒤집는다
    prisma.examScore.findMany({
      where: {
        studentId,
        examDate: { lt: dateEnd },
        examType: { in: [...TREND_EXAM_TYPES] },
      },
      orderBy: [{ examDate: "desc" }, { createdAt: "desc" }],
      take: EXAM_SCORE_LIMIT,
      select: {
        examName: true,
        examType: true,
        examDate: true,
        subject: true,
        grade: true,
        percentile: true,
        rawScore: true,
      },
    }),
    prisma.vocabTestScore.findMany({
      where: { studentId, testDate: { gte: dateStart, lt: dateEnd } },
      orderBy: [{ testDate: "asc" }, { createdAt: "asc" }],
      select: { id: true, testDate: true, totalWords: true, correctWords: true, score: true },
    }),
    prisma.monthlyAdmissionInfo.findFirst({
      where: { year, month, grade: student.grade },
      select: { content: true },
    }),
    prisma.monthlyAdmissionInfo.findFirst({
      where: { year, month, grade: null },
      select: { content: true },
    }),
    prisma.announcement.findFirst({
      where: { page: "monthly_notice" },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    }),
    prisma.monthlyAward.findMany({
      where: { year, month },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        studentId: true,
        category: true,
        description: true,
        student: { select: { name: true } },
      },
    }),
    prisma.announcement.findFirst({
      where: { page: "monthly_recommendation" },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    }),
    report.attachedPhotoIds.length > 0
      ? prisma.photo.findMany({
          where: { id: { in: report.attachedPhotoIds } },
          select: { id: true, url: true, thumbnailUrl: true },
        })
      : Promise.resolve([] as { id: string; url: string; thumbnailUrl: string | null }[]),
  ]);

  const appUrl = getAppUrl();

  const meritItems = merits.map((m) => ({
    id: m.id,
    date: dateKey(m.date),
    type: m.type,
    points: m.points,
    reason: m.reason,
    category: m.category,
  }));
  const sumOf = (type: "MERIT" | "DEMERIT") => {
    const list = meritItems.filter((m) => m.type === type);
    return { count: list.length, points: list.reduce((sum, m) => sum + m.points, 0) };
  };
  const merit = sumOf("MERIT");
  const demerit = sumOf("DEMERIT");

  const vocab =
    vocabScores.length > 0
      ? {
          count: vocabScores.length,
          average: round1(vocabScores.reduce((sum, v) => sum + v.score, 0) / vocabScores.length),
          latest: round1(vocabScores[vocabScores.length - 1].score),
          points: vocabScores.map((v) => ({
            id: v.id,
            date: dateKey(v.testDate),
            score: round1(v.score),
            correct: v.correctWords,
            total: v.totalWords,
          })),
        }
      : null;

  const photoById = new Map(photos.map((p) => [p.id, p]));
  const orderedPhotos = report.attachedPhotoIds.flatMap((pid) => {
    const p = photoById.get(pid);
    return p ? [{ id: p.id, url: p.url, thumbnailUrl: p.thumbnailUrl }] : [];
  });

  const noteContent = monthlyNote?.content?.trim() ? absolutize(monthlyNote.content, appUrl) : null;

  return {
    id: report.id,
    year,
    month,
    sentAt: report.sentAt.toISOString(),
    student: {
      id: student.id,
      name: student.name,
      school: student.school,
      grade: student.grade,
      targetUniversity: student.targetUniversity,
    },
    summary: {
      mentoringCount: report.mentoringCount,
      meritPoints: merit.points,
      demeritPoints: demerit.points,
      meritItemCount: meritItems.length,
      patrolNoteCount: report.patrolNoteCount,
    },
    mentoringSummary: absolutize(report.mentoringSummary, appUrl),
    directorComment: absolutize(report.overallComment, appUrl),
    exams: buildMonthlyExams([...examScoresDesc].reverse(), year, month),
    vocab,
    note: noteContent ? { content: noteContent } : null,
    merits: { merit, demerit, items: meritItems },
    patrol: {
      noteCount: report.patrolNoteCount,
      absentCount: report.patrolAbsentCount,
      notes: patrolRecords
        .filter((r) => r.note?.trim())
        .map((r) => ({ id: r.id, date: kstMonthDay(r.checkedAt), note: r.note!.trim() })),
    },
    photos: orderedPhotos,
    admissionInfo: absolutize((gradeAdmission ?? commonAdmission)?.content, appUrl),
    notices: {
      operations: absolutize(operationsNotice?.content, appUrl),
      awards: awards.map((a) => ({
        id: a.id,
        name: a.student.name,
        category: a.category,
        categoryLabel: AWARD_LABEL[a.category] ?? "진보상",
        description: a.description?.trim() || null,
        isMine: a.studentId === studentId,
      })),
      recommendation: absolutize(recommendation?.content, appUrl),
    },
  };
}
