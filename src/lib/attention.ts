import { prisma } from "@/lib/prisma";
import { offlineStudentWhere } from "@/lib/student-filters";
import { todayKST } from "@/lib/utils";

/**
 * 유의 관찰 학생(needs-attention) 판별 코어.
 *
 * 두 소스를 하나의 목록으로 합친다:
 *  1. 수동 플래그 — 운영진이 Student.attentionFlag 로 직접 지정 (항상 상단 노출)
 *  2. 자동 판별 — 기존 데이터(과제·출결·벌점·학부모 요청)로 가중치 점수 산출
 *
 * 모든 쿼리는 offlineStudentWhere 로 오프라인 ACTIVE 학생만 대상으로 하며,
 * groupBy 집계 + Promise.all 로 학생 수와 무관하게 일정한 쿼리 수를 유지한다(N+1 없음).
 */

export type AttentionSeverity = "high" | "medium" | "low";

export type AttentionReasonKind =
  | "manual"
  | "overdue_assignment"
  | "recent_absence"
  | "recent_tardy"
  | "recent_demerit"
  | "unchecked_parent_request";

export type AttentionReason = {
  kind: AttentionReasonKind;
  label: string;
  weight: number;
};

export type AttentionStudent = {
  studentId: string;
  name: string;
  grade: string;
  seat: string | null;
  /** 수동 플래그 여부 (배지 구분용) */
  isManual: boolean;
  /** 수동 플래그 사유 메모 */
  manualReason: string | null;
  /** 정렬/심각도 산출용 가중치 합 */
  score: number;
  severity: AttentionSeverity;
  reasons: AttentionReason[];
};

const DAY_MS = 86_400_000;

export async function getAttentionStudents(opts?: {
  /** 주어지면 이 학생 집합으로 결과를 제한 (예: 순찰 — 오늘 재실자) */
  rosterStudentIds?: string[];
}): Promise<AttentionStudent[]> {
  const today = todayKST();
  const since14 = new Date(today.getTime() - 14 * DAY_MS);
  const since7 = new Date(today.getTime() - 7 * DAY_MS);
  const activeOffline = offlineStudentWhere({ status: "ACTIVE" });

  const [manual, overdue, absences, tardies, demerits, parentReqs] = await Promise.all([
    prisma.student.findMany({
      where: offlineStudentWhere({ status: "ACTIVE", attentionFlag: true }),
      select: { id: true, name: true, grade: true, seat: true, attentionReason: true },
    }),
    prisma.assignment.groupBy({
      by: ["studentId"],
      where: { isCompleted: false, dueDate: { lt: today }, student: activeOffline },
      _count: { _all: true },
    }),
    prisma.attendanceRecord.groupBy({
      by: ["studentId"],
      where: {
        date: { gte: since14, lte: today },
        type: { in: ["ABSENT", "NOTIFIED_ABSENT"] },
        student: activeOffline,
      },
      _count: { _all: true },
    }),
    prisma.attendanceRecord.groupBy({
      by: ["studentId"],
      where: { date: { gte: since7, lte: today }, type: "TARDY", student: activeOffline },
      _count: { _all: true },
    }),
    prisma.meritDemerit.groupBy({
      by: ["studentId"],
      where: { type: "DEMERIT", date: { gte: since14, lte: today }, student: activeOffline },
      _count: { _all: true },
      _sum: { points: true },
    }),
    prisma.communication.groupBy({
      by: ["studentId"],
      where: { type: "PARENT_REQUEST", isChecked: false, student: activeOffline },
      _count: { _all: true },
    }),
  ]);

  const map = new Map<string, AttentionStudent>();
  const ensure = (studentId: string): AttentionStudent => {
    let s = map.get(studentId);
    if (!s) {
      s = {
        studentId,
        name: "",
        grade: "",
        seat: null,
        isManual: false,
        manualReason: null,
        score: 0,
        severity: "low",
        reasons: [],
      };
      map.set(studentId, s);
    }
    return s;
  };
  const addReason = (studentId: string, reason: AttentionReason) => {
    ensure(studentId).reasons.push(reason);
  };

  // 1) 수동 플래그 (이름/좌석 동시 확보)
  for (const m of manual) {
    const s = ensure(m.id);
    s.name = m.name;
    s.grade = m.grade;
    s.seat = m.seat;
    s.isManual = true;
    s.manualReason = m.attentionReason;
    s.reasons.push({ kind: "manual", label: m.attentionReason?.trim() || "수동 지정", weight: 0 });
  }

  // 2) 자동 신호
  for (const r of overdue) {
    const n = r._count._all;
    addReason(r.studentId, {
      kind: "overdue_assignment",
      label: `미완료 과제 ${n}건 (기한 초과)`,
      weight: Math.min(n, 5) * 8,
    });
  }
  for (const r of absences) {
    const n = r._count._all;
    addReason(r.studentId, { kind: "recent_absence", label: `최근 14일 결석 ${n}회`, weight: n * 12 });
  }
  for (const r of tardies) {
    const n = r._count._all;
    if (n < 3) continue; // 지각은 3회 이상부터 신호
    addReason(r.studentId, { kind: "recent_tardy", label: `최근 7일 지각 ${n}회`, weight: n * 5 });
  }
  for (const r of demerits) {
    const n = r._count._all;
    const pts = r._sum.points ?? 0;
    addReason(r.studentId, {
      kind: "recent_demerit",
      label: `최근 14일 벌점 ${n}건 (${pts}점)`,
      weight: Math.min(pts, 10) * 4,
    });
  }
  for (const r of parentReqs) {
    const n = r._count._all;
    addReason(r.studentId, {
      kind: "unchecked_parent_request",
      label: `미확인 학부모 요청 ${n}건`,
      weight: n * 15,
    });
  }

  // 자동 신호만 있는(이름 미확보) 학생 정보 일괄 조회
  const needInfo = [...map.values()].filter((s) => s.name === "").map((s) => s.studentId);
  if (needInfo.length > 0) {
    const infos = await prisma.student.findMany({
      where: { id: { in: needInfo } },
      select: { id: true, name: true, grade: true, seat: true },
    });
    for (const info of infos) {
      const s = map.get(info.id);
      if (s) {
        s.name = info.name;
        s.grade = info.grade;
        s.seat = info.seat;
      }
    }
  }

  let list = [...map.values()].filter((s) => s.name !== "");

  // 심각도/점수 산출 — 자동 점수 기준, 수동은 baseline medium
  for (const s of list) {
    const autoScore = s.reasons
      .filter((r) => r.kind !== "manual")
      .reduce((acc, r) => acc + r.weight, 0);
    s.score = autoScore + (s.isManual ? 1000 : 0); // 수동을 항상 최상단으로
    s.severity = autoScore >= 24 ? "high" : autoScore >= 10 ? "medium" : s.isManual ? "medium" : "low";
  }

  // 노이즈 차단: 수동이거나 자동 점수 medium 이상(>=10)만 노출
  list = list.filter((s) => s.isManual || s.score >= 10);

  if (opts?.rosterStudentIds) {
    const set = new Set(opts.rosterStudentIds);
    list = list.filter((s) => set.has(s.studentId));
  }

  list.sort((a, b) => {
    if (a.isManual !== b.isManual) return a.isManual ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name, "ko");
  });

  return list;
}
