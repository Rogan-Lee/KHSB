"use server";

// 앱·사이트 사용 통제 — 직원용 서버 액션.
// 권한: 조회·일시 조치·기기 배정 = 직원 전체 / 상시 규칙·전체 일시 중지·시설 장비 = 원장급.
// 입력 오류는 { ok: false, error } 로 돌려준다 (운영 빌드는 throw 한 메시지를 화면에 넘기지 않는다).

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isFullAccess, requireFullAccess, requireStaff } from "@/lib/roles";
import { getCatalogEntry } from "@/lib/access-control/catalog";
import {
  ALL_TARGET_LABEL,
  cleanDaysOfWeek,
  minuteToTime,
  parseTimeToMinute,
  resolveTarget,
  type ResolvedTarget,
} from "@/lib/access-control/input";
import { loadAccessOverview, type AccessOverview, type StudentRef } from "@/lib/access-control/overview";
import {
  bumpAccessRev,
  generateAgentToken,
  getAccessSettings,
  hashAgentToken,
  logAccessEvent,
  saveAccessSettings,
  type AccessActor,
} from "@/lib/access-control/store";
import type { AccessAction, AccessDeviceStatus, AccessScope, AccessTargetKind } from "@/lib/access-control/types";
import { DAY_NAMES } from "@/lib/utils";

const PATH = "/access-control";
const MAX_TARGETS = 30;
const MAX_DELETE_RULES = 200;
const MAX_OVERRIDE_ROWS = 60;
const MAX_OVERRIDE_MINUTES = 24 * 60;

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

async function staffActor(): Promise<AccessActor & { role: string }> {
  const session = await auth();
  requireStaff(session?.user?.role);
  return { id: session!.user.id, name: session!.user.name ?? null, role: session!.user.role };
}

async function fullAccessActor(): Promise<AccessActor> {
  const session = await auth();
  requireFullAccess(session?.user?.role);
  return { id: session!.user.id, name: session!.user.name ?? null };
}

// ─────────────────────────── 조회 ───────────────────────────

export type {
  AccessAgentView,
  AccessCatalogItem,
  AccessDeviceView,
  AccessEventView,
  AccessOverrideState,
  AccessOverrideView,
  AccessOverview,
  AccessRuleView,
} from "@/lib/access-control/overview";

/** 통제 화면 전체 데이터. 직원. */
export async function getAccessOverview(): Promise<AccessOverview> {
  const actor = await staffActor();
  return loadAccessOverview(isFullAccess(actor.role));
}

// ─────────────────────────── 입력 정리 ───────────────────────────

/** 대상 여러 개를 한 번에 받는다 (서비스·사이트). 인터넷 전체는 targets 를 보지 않는다. */
async function resolveTargets(kind: unknown, targets: unknown): Promise<{ ok: true; value: ResolvedTarget[] } | Fail> {
  if (kind === "ALL") return { ok: true, value: [{ targetKind: "ALL", target: "", label: ALL_TARGET_LABEL }] };
  const list = Array.isArray(targets) ? targets : [];
  if (list.length === 0) return fail(kind === "SERVICE" ? "앱·서비스를 하나 이상 골라 주세요" : "사이트 주소를 입력해 주세요");
  if (list.length > MAX_TARGETS) return fail(`한 번에 ${MAX_TARGETS}개까지 추가할 수 있어요`);

  // 기본 목록에 없는 서비스는 시설 장비가 올린 목록에서 확인한다
  let extra: Set<string> | undefined;
  if (kind === "SERVICE" && list.some((t) => typeof t === "string" && !getCatalogEntry(t))) {
    const rows = await prisma.$queryRaw<{ ids: string[] | null }[]>`
      SELECT jsonb_path_query_array("catalog", '$[*].id') AS ids FROM "AccessAgent" WHERE "catalog" IS NOT NULL`;
    extra = new Set(rows.flatMap((r) => r.ids ?? []));
  }

  const out = new Map<string, ResolvedTarget>();
  for (const raw of list) {
    const r = resolveTarget(kind, raw, extra);
    if (!r.ok) return fail(typeof raw === "string" && raw.trim() ? `${r.error} — "${raw.trim().slice(0, 60)}"` : r.error);
    out.set(r.value.target, r.value);
  }
  return { ok: true, value: [...out.values()] };
}

const STUDENT_SELECT = { id: true, name: true, grade: true } as const;

async function findStudents(ids: string[]): Promise<StudentRef[]> {
  if (ids.length === 0) return [];
  return prisma.student.findMany({ where: { id: { in: ids } }, select: STUDENT_SELECT });
}

const cleanNote = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

const actionLabel = (a: AccessAction) => (a === "BLOCK" ? "차단" : "허용");

function scheduleLabel(days: number[], start: number | null, end: number | null): string {
  const d = days.length === 0 || days.length === 7 ? "" : days.map((x) => DAY_NAMES[x]).join("·");
  const t = start != null && end != null ? `${minuteToTime(start)}~${minuteToTime(end)}` : "";
  return [d, t].filter(Boolean).join(" ") || "항상";
}

// ─────────────────────────── 상시 규칙 (원장급) ───────────────────────────

export type AccessRuleInput = {
  action: AccessAction;
  targetKind: AccessTargetKind;
  /** SERVICE: 카탈로그 id 들, DOMAIN: 주소들. ALL 이면 무시 */
  targets?: string[];
  scope: AccessScope;
  studentId?: string | null;
  /** 0(일)~6(토). 비우면 매일 */
  daysOfWeek?: number[];
  /** "HH:MM" (KST). 둘 다 비우면 종일 */
  startTime?: string | null;
  endTime?: string | null;
  note?: string | null;
};

function parseRuleSchedule(input: AccessRuleInput):
  | { ok: true; days: number[]; start: number | null; end: number | null }
  | Fail {
  const days = cleanDaysOfWeek(input.daysOfWeek);
  const hasStart = !!input.startTime;
  const hasEnd = !!input.endTime;
  if (hasStart !== hasEnd) return fail("시작과 종료 시간을 모두 입력해 주세요");
  if (!hasStart) return { ok: true, days: days.length === 7 ? [] : days, start: null, end: null };
  const start = parseTimeToMinute(input.startTime);
  const end = parseTimeToMinute(input.endTime);
  if (start == null || end == null) return fail("시간 형식을 확인해 주세요 (예: 09:00)");
  if (start === end) return fail("시작과 종료 시간이 같아요");
  return { ok: true, days: days.length === 7 ? [] : days, start, end };
}

/** 규칙 추가 — 대상 여러 개면 대상마다 규칙을 하나씩 만든다. 원장급. */
export async function createAccessRules(input: AccessRuleInput): Promise<{ ok: true; created: number } | Fail> {
  const actor = await fullAccessActor();
  if (input.action !== "BLOCK" && input.action !== "ALLOW") return fail("차단·허용을 선택해 주세요");
  if (input.scope !== "GLOBAL" && input.scope !== "STUDENT") return fail("적용 범위를 선택해 주세요");

  const targets = await resolveTargets(input.targetKind, input.targets);
  if (!targets.ok) return targets;
  const schedule = parseRuleSchedule(input);
  if (!schedule.ok) return schedule;

  let student: StudentRef | null = null;
  if (input.scope === "STUDENT") {
    student = typeof input.studentId === "string" ? ((await findStudents([input.studentId]))[0] ?? null) : null;
    if (!student) return fail("학생을 찾을 수 없습니다");
  }

  // 같은 내용의 규칙은 다시 만들지 않는다
  const existing = await prisma.accessRule.findMany({
    where: { action: input.action, scope: input.scope, studentId: student?.id ?? null, targetKind: targets.value[0].targetKind },
    select: { target: true, daysOfWeek: true, startMinute: true, endMinute: true },
  });
  const dup = new Set(
    existing
      .filter(
        (e) =>
          e.startMinute === schedule.start &&
          e.endMinute === schedule.end &&
          e.daysOfWeek.join() === schedule.days.join(),
      )
      .map((e) => e.target),
  );
  const fresh = targets.value.filter((t) => !dup.has(t.target));
  if (fresh.length === 0) return fail("같은 규칙이 이미 있어요");

  const note = cleanNote(input.note, 200);
  await prisma.accessRule.createMany({
    data: fresh.map((t) => ({
      action: input.action,
      targetKind: t.targetKind,
      target: t.target,
      label: t.label,
      scope: input.scope,
      studentId: student?.id ?? null,
      daysOfWeek: schedule.days,
      startMinute: schedule.start,
      endMinute: schedule.end,
      note,
      createdById: actor.id,
      createdByName: actor.name,
    })),
  });
  await bumpAccessRev();
  await logAccessEvent(
    "RULE_CREATED",
    `규칙 추가 — ${actionLabel(input.action)} · ${fresh.map((t) => t.label).join(", ")} (${student ? student.name : "전체"}, ${scheduleLabel(schedule.days, schedule.start, schedule.end)})`,
    actor,
    student?.id,
  );
  revalidatePath(PATH);
  return { ok: true, created: fresh.length };
}

/** 규칙 켜기·끄기. 원장급. */
export async function setAccessRuleEnabled(id: string, enabled: boolean): Promise<{ ok: true } | Fail> {
  const actor = await fullAccessActor();
  const rule = await prisma.accessRule.findUnique({ where: { id }, select: { label: true, action: true, studentId: true } });
  if (!rule) return fail("규칙을 찾을 수 없습니다");
  await prisma.accessRule.update({ where: { id }, data: { enabled: enabled === true } });
  await bumpAccessRev();
  await logAccessEvent(
    enabled ? "RULE_ENABLED" : "RULE_DISABLED",
    `규칙 ${enabled ? "켬" : "끔"} — ${actionLabel(rule.action)} · ${rule.label}`,
    actor,
    rule.studentId,
  );
  revalidatePath(PATH);
  return { ok: true };
}

/** 규칙의 요일·시간대·메모 변경 (대상·범위는 지우고 새로 만든다). 원장급. */
export async function updateAccessRuleSchedule(
  id: string,
  input: Pick<AccessRuleInput, "daysOfWeek" | "startTime" | "endTime" | "note">,
): Promise<{ ok: true } | Fail> {
  const actor = await fullAccessActor();
  const rule = await prisma.accessRule.findUnique({ where: { id }, select: { label: true, action: true, studentId: true } });
  if (!rule) return fail("규칙을 찾을 수 없습니다");
  const schedule = parseRuleSchedule(input as AccessRuleInput);
  if (!schedule.ok) return schedule;
  await prisma.accessRule.update({
    where: { id },
    data: {
      daysOfWeek: schedule.days,
      startMinute: schedule.start,
      endMinute: schedule.end,
      note: cleanNote(input.note, 200),
    },
  });
  await bumpAccessRev();
  await logAccessEvent(
    "RULE_UPDATED",
    `규칙 시간 변경 — ${actionLabel(rule.action)} · ${rule.label} (${scheduleLabel(schedule.days, schedule.start, schedule.end)})`,
    actor,
    rule.studentId,
  );
  revalidatePath(PATH);
  return { ok: true };
}

/** 규칙 삭제 (한 개·여러 개). 원장급. */
export async function deleteAccessRules(ids: string[]): Promise<{ ok: true; deleted: number } | Fail> {
  const actor = await fullAccessActor();
  const unique = [...new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [])];
  if (unique.length === 0) return fail("삭제할 규칙을 골라 주세요");
  if (unique.length > MAX_DELETE_RULES) return fail(`한 번에 ${MAX_DELETE_RULES}개까지 삭제할 수 있어요`);
  const rules = await prisma.accessRule.findMany({
    where: { id: { in: unique } },
    select: { id: true, label: true, action: true, studentId: true },
  });
  if (rules.length === 0) return fail("규칙을 찾을 수 없습니다");
  await prisma.accessRule.deleteMany({ where: { id: { in: rules.map((r) => r.id) } } });
  await bumpAccessRev();
  await Promise.all(
    rules.map((r) => logAccessEvent("RULE_DELETED", `규칙 삭제 — ${actionLabel(r.action)} · ${r.label}`, actor, r.studentId)),
  );
  revalidatePath(PATH);
  return { ok: true, deleted: rules.length };
}

// ─────────────────────────── 일시 조치 (직원) ───────────────────────────

export type AccessOverrideInput = {
  action: AccessAction;
  targetKind: AccessTargetKind;
  targets?: string[];
  scope: AccessScope;
  /** scope 가 STUDENT 일 때 대상 학생들 */
  studentIds?: string[];
  /** 지금부터 몇 분 동안 */
  minutes: number;
  reason?: string | null;
};

/** 지금부터 일정 시간 동안 차단·허용. 규칙보다 우선한다. 직원. */
export async function createAccessOverrides(input: AccessOverrideInput): Promise<{ ok: true; created: number } | Fail> {
  const actor = await staffActor();
  if (input.action !== "BLOCK" && input.action !== "ALLOW") return fail("차단·허용을 선택해 주세요");
  if (input.scope !== "GLOBAL" && input.scope !== "STUDENT") return fail("적용 범위를 선택해 주세요");
  const minutes = Math.floor(Number(input.minutes));
  if (!Number.isFinite(minutes) || minutes < 1) return fail("적용 시간을 입력해 주세요");
  if (minutes > MAX_OVERRIDE_MINUTES) return fail("일시 조치는 최대 24시간까지 가능해요. 더 길게는 규칙으로 만들어 주세요.");

  const targets = await resolveTargets(input.targetKind, input.targets);
  if (!targets.ok) return targets;

  let students: (StudentRef | null)[] = [null];
  if (input.scope === "STUDENT") {
    const ids = [...new Set((Array.isArray(input.studentIds) ? input.studentIds : []).filter((s): s is string => typeof s === "string"))];
    if (ids.length === 0) return fail("학생을 선택해 주세요");
    const found = await findStudents(ids);
    if (found.length !== ids.length) return fail("학생을 찾을 수 없습니다");
    students = found;
  }
  if (students.length * targets.value.length > MAX_OVERRIDE_ROWS) {
    return fail(`한 번에 너무 많아요 (학생 × 대상 ${MAX_OVERRIDE_ROWS}건까지)`);
  }

  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + minutes * 60_000);
  const reason = cleanNote(input.reason, 200);
  await prisma.accessOverride.createMany({
    data: students.flatMap((s) =>
      targets.value.map((t) => ({
        action: input.action,
        targetKind: t.targetKind,
        target: t.target,
        label: t.label,
        scope: input.scope,
        studentId: s?.id ?? null,
        startAt,
        endAt,
        reason,
        createdById: actor.id,
        createdByName: actor.name,
      })),
    ),
  });
  await bumpAccessRev();
  const who = input.scope === "GLOBAL" ? "전체" : students.map((s) => s!.name).join(", ");
  await logAccessEvent(
    "OVERRIDE_CREATED",
    `일시 ${actionLabel(input.action)} — ${targets.value.map((t) => t.label).join(", ")} (${who}, ${minutes}분)`,
    actor,
    students.length === 1 ? students[0]?.id : null,
  );
  revalidatePath(PATH);
  return { ok: true, created: students.length * targets.value.length };
}

/** 일시 조치 즉시 종료(회수). 직원. */
export async function cancelAccessOverride(id: string): Promise<{ ok: true } | Fail> {
  const actor = await staffActor();
  const now = new Date();
  const o = await prisma.accessOverride.findUnique({
    where: { id },
    select: { label: true, action: true, studentId: true, cancelledAt: true, endAt: true },
  });
  if (!o) return fail("일시 조치를 찾을 수 없습니다");
  if (o.cancelledAt || o.endAt <= now) return fail("이미 끝난 조치예요");
  await prisma.accessOverride.update({ where: { id }, data: { cancelledAt: now, cancelledByName: actor.name } });
  await bumpAccessRev();
  await logAccessEvent("OVERRIDE_CANCELLED", `일시 ${actionLabel(o.action)} 종료 — ${o.label}`, actor, o.studentId);
  revalidatePath(PATH);
  return { ok: true };
}

// ─────────────────────────── 기기 (직원) ───────────────────────────

export type AccessDeviceInput = {
  status: AccessDeviceStatus;
  studentId?: string | null;
  label?: string | null;
};

/** 발견된 기기를 학생에게 배정하거나, 통제 제외(직원·공용 기기)로 두거나, 배정을 푼다. 직원. */
export async function updateAccessDevice(id: string, input: AccessDeviceInput): Promise<{ ok: true } | Fail> {
  const actor = await staffActor();
  if (!["UNASSIGNED", "ASSIGNED", "EXEMPT"].includes(input.status)) return fail("기기 상태를 선택해 주세요");
  const device = await prisma.accessDevice.findUnique({ where: { id }, select: { mac: true, hostname: true, label: true } });
  if (!device) return fail("기기를 찾을 수 없습니다");

  let student: StudentRef | null = null;
  if (input.status === "ASSIGNED") {
    student = typeof input.studentId === "string" ? ((await findStudents([input.studentId]))[0] ?? null) : null;
    if (!student) return fail("학생을 선택해 주세요");
  }
  const label = cleanNote(input.label, 40);
  await prisma.accessDevice.update({
    where: { id },
    data: { status: input.status, studentId: student?.id ?? null, label },
  });
  await bumpAccessRev();
  const name = label ?? device.hostname ?? device.mac;
  await logAccessEvent(
    "DEVICE_UPDATED",
    input.status === "ASSIGNED"
      ? `기기 배정 — ${name} → ${student!.name}`
      : input.status === "EXEMPT"
        ? `기기 통제 제외 — ${name}`
        : `기기 배정 해제 — ${name}`,
    actor,
    student?.id,
  );
  revalidatePath(PATH);
  return { ok: true };
}

/** 기기 기록 삭제 — 다시 와이파이에 붙으면 "미배정"으로 새로 잡힌다. 직원. */
export async function deleteAccessDevice(id: string): Promise<{ ok: true } | Fail> {
  const actor = await staffActor();
  const device = await prisma.accessDevice.findUnique({ where: { id }, select: { mac: true, hostname: true, label: true } });
  if (!device) return fail("기기를 찾을 수 없습니다");
  await prisma.accessDevice.delete({ where: { id } });
  await bumpAccessRev();
  await logAccessEvent("DEVICE_DELETED", `기기 삭제 — ${device.label ?? device.hostname ?? device.mac}`, actor);
  revalidatePath(PATH);
  return { ok: true };
}

// ─────────────────────────── 전체 설정 (원장급) ───────────────────────────

/**
 * 통제 전체 일시 중지·재개. minutes 가 null 이면 다시 켤 때까지 중지.
 * 중지 중에는 규칙·일시 조치가 모두 적용되지 않는다 (지우지는 않는다).
 */
export async function setAccessPause(input: { paused: boolean; minutes?: number | null }): Promise<{ ok: true } | Fail> {
  const actor = await fullAccessActor();
  const settings = await getAccessSettings();
  const now = new Date();
  if (input.paused) {
    let until: string | null = null;
    if (input.minutes != null) {
      const minutes = Math.floor(Number(input.minutes));
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 7 * 24 * 60) return fail("중지 시간을 확인해 주세요");
      until = new Date(now.getTime() + minutes * 60_000).toISOString();
    }
    await saveAccessSettings({ ...settings, paused: true, pausedUntil: until, pausedAt: now.toISOString(), pausedByName: actor.name });
    await logAccessEvent("PAUSED", `통제 전체 중지 — ${input.minutes != null ? `${Math.floor(Number(input.minutes))}분` : "다시 켤 때까지"}`, actor);
  } else {
    await saveAccessSettings({ ...settings, paused: false, pausedUntil: null, pausedAt: null, pausedByName: null });
    await logAccessEvent("RESUMED", "통제 다시 시작", actor);
  }
  await bumpAccessRev();
  revalidatePath(PATH);
  return { ok: true };
}

/** 차단 우회 방지(암호화 DNS·iCloud 비공개 릴레이 차단) 켜기·끄기. 원장급. */
export async function setAccessHardening(enabled: boolean): Promise<{ ok: true } | Fail> {
  const actor = await fullAccessActor();
  const settings = await getAccessSettings();
  await saveAccessSettings({ ...settings, hardening: enabled === true });
  await bumpAccessRev();
  await logAccessEvent("HARDENING", `우회 방지 ${enabled ? "켬" : "끔"}`, actor);
  revalidatePath(PATH);
  return { ok: true };
}

// ─────────────────────────── 시설 장비 (원장급) ───────────────────────────

/** 시설 장비 등록 — 토큰은 이 응답에서 한 번만 보여 준다 (DB 에는 해시만). 원장급. */
export async function registerAccessAgent(name: string): Promise<{ ok: true; id: string; token: string } | Fail> {
  const actor = await fullAccessActor();
  const clean = cleanNote(name, 40);
  if (!clean) return fail("장비 이름을 입력해 주세요");
  const token = generateAgentToken();
  const agent = await prisma.accessAgent.create({
    data: { name: clean, tokenHash: hashAgentToken(token), tokenHint: token.slice(-4), createdByName: actor.name },
    select: { id: true },
  });
  await logAccessEvent("AGENT_REGISTERED", `시설 장비 등록 — ${clean}`, actor);
  revalidatePath(PATH);
  return { ok: true, id: agent.id, token };
}

/** 장비 연결 끊기 — 토큰이 즉시 무효가 된다. 원장급. */
export async function deleteAccessAgent(id: string): Promise<{ ok: true } | Fail> {
  const actor = await fullAccessActor();
  const agent = await prisma.accessAgent.findUnique({ where: { id }, select: { name: true } });
  if (!agent) return fail("장비를 찾을 수 없습니다");
  await prisma.accessAgent.delete({ where: { id } });
  await logAccessEvent("AGENT_DELETED", `시설 장비 삭제 — ${agent.name}`, actor);
  revalidatePath(PATH);
  return { ok: true };
}
