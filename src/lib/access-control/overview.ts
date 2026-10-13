// 통제 화면(대시보드 /access-control)에 내려 주는 데이터 — 서버 전용.
// 서버 액션 getAccessOverview 가 직원 권한을 확인한 뒤 부른다.

import { prisma } from "@/lib/prisma";
import { CATALOG_GROUP_LABELS, getCatalogEntry, listCatalog, type CatalogEntry } from "./catalog";
import { appliedEntryIds, computeEffective, isOverrideActive, isPaused, scheduleMatches } from "./effective";
import { minuteToTime } from "./input";
import { getAccessSettings, toPause } from "./store";
import type { AccessAction, AccessDeviceStatus, AccessScope, AccessTargetKind, PolicySet } from "./types";

/** 장비가 이 시간 안에 확인하러 왔으면 연결된 것으로 본다 (확인 주기 30초, 기록은 1분에 한 번) */
const AGENT_CONNECTED_MS = 3 * 60 * 1000;
/** 기기가 이 시간 안에 보였으면 접속 중으로 본다 (장비의 기기 목록 보고 주기 10분 + 여유) */
const DEVICE_ONLINE_MS = 15 * 60 * 1000;

export type StudentRef = { id: string; name: string; grade: string };

export type AccessRuleView = {
  id: string;
  action: AccessAction;
  targetKind: AccessTargetKind;
  target: string;
  label: string;
  scope: AccessScope;
  student: StudentRef | null;
  daysOfWeek: number[];
  startTime: string | null;
  endTime: string | null;
  enabled: boolean;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
  /** 지금 실제로 효력이 있음 */
  activeNow: boolean;
  /** 켜져 있고 시간대도 맞지만 더 우선하는 규칙·일시 조치에 밀려 있음 */
  overriddenNow: boolean;
};

export type AccessOverrideState = "ACTIVE" | "SCHEDULED" | "ENDED" | "CANCELLED";

export type AccessOverrideView = {
  id: string;
  action: AccessAction;
  targetKind: AccessTargetKind;
  target: string;
  label: string;
  scope: AccessScope;
  student: StudentRef | null;
  startAt: string;
  endAt: string;
  reason: string | null;
  createdByName: string | null;
  cancelledAt: string | null;
  cancelledByName: string | null;
  /** 학생 신청 승인으로 만들어진 것 */
  fromRequest: boolean;
  state: AccessOverrideState;
};

export type AccessDeviceView = {
  id: string;
  mac: string;
  hostname: string | null;
  lastIp: string | null;
  label: string | null;
  status: AccessDeviceStatus;
  student: StudentRef | null;
  firstSeenAt: string;
  lastSeenAt: string;
  online: boolean;
};

export type AccessAgentView = {
  id: string;
  name: string;
  tokenHint: string;
  enabled: boolean;
  lastSeenAt: string | null;
  lastAppliedAt: string | null;
  lastError: string | null;
  software: string | null;
  agentVersion: string | null;
  connected: boolean;
};

export type AccessEventView = {
  id: string;
  kind: string;
  summary: string;
  actorName: string | null;
  studentName: string | null;
  createdAt: string;
};

export type AccessCatalogItem = CatalogEntry & { groupLabel: string };

export type AccessOverview = {
  /** 상시 규칙·일시 중지·장비를 바꿀 수 있는가 (원장급) */
  canManage: boolean;
  now: string;
  settings: {
    paused: boolean;
    pausedUntil: string | null;
    pausedByName: string | null;
    hardening: boolean;
  };
  /** 지금 시설 전체에 적용되는 정책 */
  effective: PolicySet;
  /** 전체와 다른 정책이 적용 중인 학생 */
  studentExceptions: { student: StudentRef; policy: PolicySet; deviceCount: number }[];
  rules: AccessRuleView[];
  overrides: AccessOverrideView[];
  devices: AccessDeviceView[];
  agents: AccessAgentView[];
  events: AccessEventView[];
  catalog: AccessCatalogItem[];
  students: (StudentRef & { seat: string | null })[];
  /** 규칙에 쓰였지만 시설 장비의 AdGuard Home 이 모르는 서비스 (적용되지 않음) */
  unknownServices: string[];
};

const STUDENT_SELECT = { id: true, name: true, grade: true } as const;

// ponytail: 탭 구분 없이 화면 전체를 한 번에 읽는다 (기기 500대·일시 조치 200건 상한, 페이지 없음) —
// 한 시설 규모 전제. 넘으면 탭별 조회로 쪼갠다.
/** 통제 화면 전체 데이터. 권한 확인은 호출 측(서버 액션) 책임. */
export async function loadAccessOverview(canManage: boolean): Promise<AccessOverview> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [rules, overrides, devices, agents, events, students, settings, agentCatalogs] = await Promise.all([
    prisma.accessRule.findMany({ orderBy: { createdAt: "desc" }, include: { student: { select: STUDENT_SELECT } } }),
    prisma.accessOverride.findMany({
      where: { endAt: { gt: weekAgo } },
      orderBy: { startAt: "desc" },
      take: 200,
      include: { student: { select: STUDENT_SELECT } },
    }),
    prisma.accessDevice.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: 500,
      include: { student: { select: STUDENT_SELECT } },
    }),
    prisma.accessAgent.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        tokenHint: true,
        enabled: true,
        lastSeenAt: true,
        lastAppliedAt: true,
        lastError: true,
        software: true,
        agentVersion: true,
      },
    }),
    prisma.accessEvent.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { ...STUDENT_SELECT, seat: true },
    }),
    getAccessSettings(),
    // 서비스 목록 전체(도메인 포함)는 크다 — id·이름만 뽑아 온다
    prisma.$queryRaw<{ ids: string[] | null; names: string[] | null; groups: (string | null)[] | null }[]>`
      SELECT jsonb_path_query_array("catalog", '$[*].id') AS ids,
             jsonb_path_query_array("catalog", '$[*].name') AS names,
             jsonb_path_query_array("catalog", '$[*].group') AS groups
      FROM "AccessAgent" WHERE "catalog" IS NOT NULL ORDER BY "lastSeenAt" DESC NULLS LAST LIMIT 1`,
  ]);

  const pause = toPause(settings);
  const state = computeEffective({ rules, overrides, pause, now });
  const applied = appliedEntryIds({ rules, overrides, pause, now });

  // 장비가 아는 서비스: 기본 목록에 없는 것은 고를 수 있게 추가하고, 장비가 모르는 것은 경고한다
  const agentIds = agentCatalogs[0]?.ids ?? null;
  const catalog: AccessCatalogItem[] = listCatalog().map((e) => ({ ...e, groupLabel: CATALOG_GROUP_LABELS[e.group] }));
  if (agentIds) {
    agentIds.forEach((id, i) => {
      if (typeof id === "string" && !getCatalogEntry(id)) {
        const name = agentCatalogs[0]?.names?.[i];
        catalog.push({ id, name: typeof name === "string" ? name : id, group: "etc", groupLabel: CATALOG_GROUP_LABELS.etc });
      }
    });
  }
  const agentIdSet = agentIds ? new Set(agentIds) : null;
  const unknownServices = agentIdSet
    ? [
        ...new Set(
          rules
            .filter((r) => r.enabled && r.targetKind === "SERVICE" && !r.target.includes(":") && !agentIdSet.has(r.target))
            .map((r) => r.label),
        ),
      ]
    : [];

  const studentById = new Map(students.map((s) => [s.id, s]));
  const deviceCount = new Map<string, number>();
  for (const d of devices) {
    if (d.status === "ASSIGNED" && d.studentId) deviceCount.set(d.studentId, (deviceCount.get(d.studentId) ?? 0) + 1);
  }
  const studentNames = new Map<string, string>(students.map((s) => [s.id, s.name]));
  for (const r of [...rules, ...overrides, ...devices]) if (r.student) studentNames.set(r.student.id, r.student.name);

  return {
    canManage,
    now: now.toISOString(),
    settings: {
      paused: isPaused(pause, now),
      pausedUntil: settings.pausedUntil,
      pausedByName: settings.pausedByName,
      hardening: settings.hardening,
    },
    effective: state.global,
    studentExceptions: Object.entries(state.students).flatMap(([id, policy]) => {
      const s = studentById.get(id);
      return s ? [{ student: { id: s.id, name: s.name, grade: s.grade }, policy, deviceCount: deviceCount.get(id) ?? 0 }] : [];
    }),
    rules: rules.map((r) => ({
      id: r.id,
      action: r.action,
      targetKind: r.targetKind,
      target: r.target,
      label: r.label,
      scope: r.scope,
      student: r.student,
      daysOfWeek: r.daysOfWeek,
      startTime: r.startMinute != null && r.endMinute != null ? minuteToTime(r.startMinute) : null,
      endTime: r.startMinute != null && r.endMinute != null ? minuteToTime(r.endMinute) : null,
      enabled: r.enabled,
      note: r.note,
      createdByName: r.createdByName,
      createdAt: r.createdAt.toISOString(),
      activeNow: applied.has(r.id),
      overriddenNow: !state.paused && r.enabled && scheduleMatches(r, now) && !applied.has(r.id),
    })),
    overrides: overrides.map((o) => ({
      id: o.id,
      action: o.action,
      targetKind: o.targetKind,
      target: o.target,
      label: o.label,
      scope: o.scope,
      student: o.student,
      startAt: o.startAt.toISOString(),
      endAt: o.endAt.toISOString(),
      reason: o.reason,
      createdByName: o.createdByName,
      cancelledAt: o.cancelledAt?.toISOString() ?? null,
      cancelledByName: o.cancelledByName,
      fromRequest: o.networkRequestId != null,
      state: o.cancelledAt ? "CANCELLED" : isOverrideActive(o, now) ? "ACTIVE" : o.startAt > now ? "SCHEDULED" : "ENDED",
    })),
    devices: devices.map((d) => ({
      id: d.id,
      mac: d.mac,
      hostname: d.hostname,
      lastIp: d.lastIp,
      label: d.label,
      status: d.status,
      student: d.student,
      firstSeenAt: d.firstSeenAt.toISOString(),
      lastSeenAt: d.lastSeenAt.toISOString(),
      online: now.getTime() - d.lastSeenAt.getTime() < DEVICE_ONLINE_MS,
    })),
    agents: agents.map((a) => ({
      ...a,
      lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
      lastAppliedAt: a.lastAppliedAt?.toISOString() ?? null,
      connected: a.enabled && !!a.lastSeenAt && now.getTime() - a.lastSeenAt.getTime() < AGENT_CONNECTED_MS,
    })),
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      summary: e.summary,
      actorName: e.actorName,
      studentName: e.studentId ? (studentNames.get(e.studentId) ?? null) : null,
      createdAt: e.createdAt.toISOString(),
    })),
    catalog,
    students,
    unknownServices,
  };
}
