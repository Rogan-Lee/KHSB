// 앱·사이트 사용 통제 — DB 접근 계층 (서버 전용).
// 서버 액션(src/actions/access-control.ts), 장비용 API(/api/access-agent/*),
// 학생 신청 승인(src/lib/network-adapter.ts)이 같이 쓴다. 인증·권한은 호출 측 책임.

import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { buildAdguardConfig, type AdguardConfig } from "./adguard";
import { builtinCatalogRules, parseAgentCatalog } from "./catalog";
import { normalizeDomain } from "./domain";
import { computeEffective, nextChangeAt } from "./effective";
import type { DeviceInput, EffectiveState, OverrideInput, PauseSetting, RuleInput } from "./types";

const SETTINGS_KEY = "access_control.settings";
const REV_KEY = "access_control.rev";

// ponytail: 30초 폴링 — 서버 푸시(SSE·웹소켓) 없이 단순하게. 바꾼 내용이 최대 30초 늦게 들어간다.
// 장비 1대가 한 달에 약 8.6만 번 부른다 (Vercel 무료 한도 100만 번의 9% 안팎). 60 으로 올리면 절반.
// 즉시 반영이 필요해지거나 장비가 여러 대로 늘어 호출 수가 부담되면 푸시로 교체.
/** 장비가 정책을 다시 확인하는 간격(초) */
export const AGENT_POLL_SECONDS = 30;
/** 확인 호출이 생존 신호를 겸한다 — DB 에는 이 간격보다 자주 쓰지 않는다 */
const HEARTBEAT_WRITE_MS = 55_000;
/** 바뀐 게 없어도 이 간격마다 정책 전체를 다시 계산해 내려 준다 */
const MAX_REFRESH_MS = 5 * 60 * 1000;
/** 장비가 서버와 이만큼 끊기면 "일시 허용을 뺀" 정책으로 물러난다 */
export const AGENT_STALE_SECONDS = 10 * 60;

// ─── 설정 (일시 중지 · 우회 방지) ────────────────────────────────────

export type AccessSettings = {
  paused: boolean;
  /** ISO. null 이면 다시 켤 때까지 */
  pausedUntil: string | null;
  pausedAt: string | null;
  pausedByName: string | null;
  /** 차단 우회(암호화 DNS·iCloud 비공개 릴레이) 방지 규칙 */
  hardening: boolean;
};

const DEFAULT_SETTINGS: AccessSettings = {
  paused: false,
  pausedUntil: null,
  pausedAt: null,
  pausedByName: null,
  hardening: true,
};

export async function getAccessSettings(): Promise<AccessSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY }, select: { value: true } });
  if (!row) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(row.value) as Partial<AccessSettings>;
    return {
      paused: parsed.paused === true,
      pausedUntil: typeof parsed.pausedUntil === "string" ? parsed.pausedUntil : null,
      pausedAt: typeof parsed.pausedAt === "string" ? parsed.pausedAt : null,
      pausedByName: typeof parsed.pausedByName === "string" ? parsed.pausedByName : null,
      hardening: parsed.hardening !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveAccessSettings(next: AccessSettings): Promise<void> {
  const value = JSON.stringify(next);
  await prisma.appSetting.upsert({ where: { key: SETTINGS_KEY }, update: { value }, create: { key: SETTINGS_KEY, value } });
}

export const toPause = (s: AccessSettings): PauseSetting => ({ paused: s.paused, until: s.pausedUntil });

// ─── 변경 번호 ───────────────────────────────────────────────────────
// 정책에 영향을 주는 변경마다 값을 바꾼다. 장비는 이 값이 그대로면 정책을 다시 받지 않는다
// (30초마다 도는 확인이 쿼리 한 번으로 끝나게 하려는 것).

export async function getAccessRev(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: REV_KEY }, select: { value: true } });
  return row?.value ?? "0";
}

export async function bumpAccessRev(): Promise<void> {
  const value = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  await prisma.appSetting.upsert({ where: { key: REV_KEY }, update: { value }, create: { key: REV_KEY, value } });
}

// ─── 변경 기록 ───────────────────────────────────────────────────────

export type AccessActor = { id: string | null; name: string | null };

/** 기록 실패가 본 동작을 막지 않게 오류는 삼킨다 */
export async function logAccessEvent(
  kind: string,
  summary: string,
  actor: AccessActor | null,
  studentId?: string | null,
): Promise<void> {
  try {
    await prisma.accessEvent.create({
      data: {
        kind,
        summary: summary.slice(0, 300),
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? null,
        studentId: studentId ?? null,
      },
    });
  } catch (e) {
    console.error("[access-control] event log failed", e);
  }
}

// ─── 정책 계산 ───────────────────────────────────────────────────────

const RULE_SELECT = {
  id: true,
  action: true,
  targetKind: true,
  target: true,
  scope: true,
  studentId: true,
  daysOfWeek: true,
  startMinute: true,
  endMinute: true,
  enabled: true,
  createdAt: true,
} as const;

const OVERRIDE_SELECT = {
  id: true,
  action: true,
  targetKind: true,
  target: true,
  scope: true,
  studentId: true,
  startAt: true,
  endAt: true,
  cancelledAt: true,
  createdAt: true,
} as const;

export type PolicyInputs = {
  rules: RuleInput[];
  overrides: OverrideInput[];
  devices: DeviceInput[];
  settings: AccessSettings;
};

/** 지금 이후에 영향을 줄 수 있는 것만 읽는다 (꺼진 규칙·끝난 일시 조치·주인 없는 기기 제외) */
export async function loadPolicyInputs(now: Date): Promise<PolicyInputs> {
  const [rules, overrides, devices, settings] = await Promise.all([
    prisma.accessRule.findMany({ where: { enabled: true }, select: RULE_SELECT }),
    prisma.accessOverride.findMany({ where: { cancelledAt: null, endAt: { gt: now } }, select: OVERRIDE_SELECT }),
    prisma.accessDevice.findMany({
      where: { status: { in: ["ASSIGNED", "EXEMPT"] } },
      select: { id: true, mac: true, status: true, studentId: true },
    }),
    getAccessSettings(),
  ]);
  return { rules, overrides, devices, settings };
}

// 인터넷 전체 잠금 중에도 열어 두는 주소 — 와이파이 연결 확인(막히면 기기가 와이파이를 버리고 LTE 로 넘어간다)과 푸시 알림
const CONNECTIVITY_DOMAINS = [
  "captive.apple.com",
  "connectivitycheck.gstatic.com",
  "connectivitycheck.android.com",
  "clients3.google.com",
  "msftconnecttest.com",
  "msftncsi.com",
  "push.apple.com",
  "mtalk.google.com",
  "time.apple.com",
  "time.android.com",
];

/**
 * 잠금 중 항상 허용할 도메인. 장비가 접속해 온 서버 주소(=학생 앱·포털이 쓰는 주소)는 자동으로 들어가고,
 * ACCESS_ALWAYS_ALLOW(쉼표 구분)로 더 넣을 수 있다.
 */
export function alwaysAllowDomains(host: string | null): string[] {
  const out = new Set<string>(CONNECTIVITY_DOMAINS);
  const extra = (process.env.ACCESS_ALWAYS_ALLOW ?? "").split(",");
  for (const raw of [host, process.env.NEXT_PUBLIC_APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, ...extra]) {
    const d = normalizeDomain(raw);
    if (d) out.add(d);
  }
  return [...out].sort();
}

export type DesiredConfig = {
  state: EffectiveState;
  config: AdguardConfig;
  /** 장비가 서버와 오래 끊겼을 때 쓸 설정. 지금 설정과 같으면 null */
  fallback: AdguardConfig | null;
  /** 이 시각이 지나면 다시 받아 가야 한다 (ISO) */
  refreshAt: string;
};

export function buildDesired(input: PolicyInputs & { catalog: unknown; host: string | null; now: Date }): DesiredConfig {
  const { rules, overrides, devices, settings, now } = input;
  const catalog = { ...parseAgentCatalog(input.catalog), ...builtinCatalogRules() };
  const alwaysAllow = alwaysAllowDomains(input.host);
  const pause = toPause(settings);

  const state = computeEffective({ rules, overrides, pause, now });
  const config = buildAdguardConfig({ state, devices, catalog, alwaysAllow, hardening: settings.hardening });

  // 끊겼을 때: 열어 준 것(일시 허용, 기한 있는 일시 중지)이 닫히지 않고 남는 일을 막는다
  const strictState = computeEffective({
    rules,
    overrides: overrides.filter((o) => o.action !== "ALLOW"),
    pause: pause.until ? { paused: false, until: null } : pause,
    now,
  });
  const strict = buildAdguardConfig({ state: strictState, devices, catalog, alwaysAllow, hardening: settings.hardening });

  const next = nextChangeAt({ rules, overrides, pause, now });
  const cap = now.getTime() + MAX_REFRESH_MS;
  const refreshAt = new Date(next ? Math.min(next.getTime(), cap) : cap).toISOString();
  return { state, config, fallback: strict.version === config.version ? null : strict, refreshAt };
}

const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return t ? t.slice(0, max) : null;
};

// ─── 장비 인증 ───────────────────────────────────────────────────────

export function generateAgentToken(): string {
  return `srmag_${randomBytes(32).toString("base64url")}`;
}

export function hashAgentToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export type AuthedAgent = {
  id: string;
  name: string;
  catalogHash: string | null;
  appliedVersion: string | null;
  lastSeenAt: Date | null;
  lastError: string | null;
};

function bearerTokenHash(authorization: string | null): string | null {
  const m = /^Bearer (srmag_[A-Za-z0-9_-]{20,100})$/.exec(authorization ?? "");
  return m ? hashAgentToken(m[1]) : null;
}

/**
 * Authorization: Bearer <장비 토큰> 확인 + 현재 변경 번호. 토큰은 해시로만 저장돼 있어 해시로 찾는다.
 * 장비가 30초마다 부르는 길이라 쿼리 한 번으로 끝낸다.
 */
export async function authenticateAgentWithRev(
  authorization: string | null,
): Promise<{ agent: AuthedAgent; rev: string } | null> {
  const tokenHash = bearerTokenHash(authorization);
  if (!tokenHash) return null;
  const rows = await prisma.$queryRaw<(AuthedAgent & { enabled: boolean; rev: string | null })[]>`
    SELECT a."id", a."name", a."enabled", a."catalogHash", a."appliedVersion", a."lastSeenAt", a."lastError",
           (SELECT s."value" FROM "AppSetting" s WHERE s."key" = ${REV_KEY}) AS "rev"
    FROM "AccessAgent" a WHERE a."tokenHash" = ${tokenHash} LIMIT 1`;
  const row = rows[0];
  if (!row || !row.enabled) return null;
  return {
    agent: {
      id: row.id,
      name: row.name,
      catalogHash: row.catalogHash,
      appliedVersion: row.appliedVersion,
      lastSeenAt: row.lastSeenAt,
      lastError: row.lastError,
    },
    rev: row.rev ?? "0",
  };
}

export async function authenticateAgent(authorization: string | null): Promise<AuthedAgent | null> {
  return (await authenticateAgentWithRev(authorization))?.agent ?? null;
}

/** 생존 신호를 DB 에 써야 하는가 — 1분에 한 번, 또는 적용 버전·오류가 달라졌을 때만 */
export function heartbeatNeeded(
  agent: Pick<AuthedAgent, "lastSeenAt" | "appliedVersion" | "lastError">,
  beat: { applied: string | null; error: string | null },
  now: Date,
): boolean {
  if (!agent.lastSeenAt || now.getTime() - agent.lastSeenAt.getTime() >= HEARTBEAT_WRITE_MS) return true;
  if (beat.applied && beat.applied !== agent.appliedVersion) return true;
  return beat.error !== agent.lastError;
}

/** 확인 호출에 실려 온 적용 버전·오류를 기록한다. 오류가 실려 오지 않았으면 오류가 풀린 것이다. */
export async function recordAgentHeartbeat(
  agent: AuthedAgent,
  raw: { applied: unknown; error: unknown },
  now: Date,
): Promise<void> {
  const beat = { applied: cleanText(raw.applied, 64), error: cleanText(raw.error, 300) };
  if (!heartbeatNeeded(agent, beat, now)) return;
  await prisma.accessAgent.update({
    where: { id: agent.id },
    data: {
      lastSeenAt: now,
      lastError: beat.error,
      ...(beat.applied && beat.applied !== agent.appliedVersion ? { appliedVersion: beat.applied, lastAppliedAt: now } : {}),
    },
  });
}

// ─── 장비 보고 ───────────────────────────────────────────────────────

const MAC_RE = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/;
const MAX_REPORTED_DEVICES = 500;

/** "0:31:92:83:F1:72" → "00:31:92:83:f1:72". 형식이 다르거나 그룹(멀티캐스트·브로드캐스트) 주소면 null */
export function normalizeMac(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const parts = input.trim().toLowerCase().split(/[:-]/);
  if (parts.length !== 6) return null;
  const mac = parts.map((p) => p.padStart(2, "0")).join(":");
  if (!MAC_RE.test(mac)) return null;
  // 첫 바이트의 최하위 비트가 1 이면 개별 기기가 아니다
  if (parseInt(mac.slice(0, 2), 16) & 1) return null;
  if (mac === "00:00:00:00:00:00") return null;
  return mac;
}

export type AgentReport = {
  agentVersion?: unknown;
  software?: unknown;
  appliedVersion?: unknown;
  error?: unknown;
  devices?: unknown;
  catalogHash?: unknown;
  catalog?: unknown;
};

/** 장비가 보낸 상태·발견 기기·서비스 목록을 반영한다. 서비스 목록이 필요하면 needCatalog 로 알린다. */
export async function recordAgentReport(
  agent: AuthedAgent,
  report: AgentReport,
  now: Date,
): Promise<{ needCatalog: boolean }> {
  const appliedVersion = cleanText(report.appliedVersion, 64);
  const catalogHash = cleanText(report.catalogHash, 64);

  let catalogStored = false;
  const catalogRules = parseAgentCatalog(report.catalog);
  if (catalogHash && Array.isArray(report.catalog) && Object.keys(catalogRules).length > 0) {
    const names = new Map<string, { name: string | null; group: string | null }>();
    for (const item of report.catalog as { id?: unknown; name?: unknown; group?: unknown }[]) {
      if (item && typeof item.id === "string") {
        names.set(item.id, { name: cleanText(item.name, 80), group: cleanText(item.group, 40) });
      }
    }
    const catalog = Object.entries(catalogRules).map(([id, rules]) => ({
      id,
      name: names.get(id)?.name ?? id,
      group: names.get(id)?.group ?? null,
      rules,
    }));
    await prisma.accessAgent.update({ where: { id: agent.id }, data: { catalog, catalogHash } });
    catalogStored = true;
  }

  await prisma.accessAgent.update({
    where: { id: agent.id },
    data: {
      lastSeenAt: now,
      agentVersion: cleanText(report.agentVersion, 40),
      software: cleanText(report.software, 80),
      lastError: cleanText(report.error, 500),
      ...(appliedVersion && appliedVersion !== agent.appliedVersion ? { appliedVersion, lastAppliedAt: now } : {}),
    },
  });

  if (Array.isArray(report.devices)) {
    const seen = new Map<string, { ip: string | null; hostname: string | null }>();
    for (const d of report.devices.slice(0, MAX_REPORTED_DEVICES) as { mac?: unknown; ip?: unknown; hostname?: unknown }[]) {
      const mac = normalizeMac(d?.mac);
      if (mac) seen.set(mac, { ip: cleanText(d.ip, 45), hostname: cleanText(d.hostname, 100) });
    }
    const macs = [...seen.keys()];
    if (macs.length > 0) {
      const existing = await prisma.accessDevice.findMany({
        where: { mac: { in: macs } },
        select: { id: true, mac: true, lastIp: true, hostname: true },
      });
      const known = new Set(existing.map((e) => e.mac));
      const fresh = macs.filter((m) => !known.has(m));
      if (fresh.length > 0) {
        await prisma.accessDevice.createMany({
          data: fresh.map((mac) => ({ mac, lastIp: seen.get(mac)!.ip, hostname: seen.get(mac)!.hostname, lastSeenAt: now })),
          skipDuplicates: true,
        });
      }
      if (existing.length > 0) {
        await prisma.accessDevice.updateMany({ where: { mac: { in: [...known] } }, data: { lastSeenAt: now } });
        // ponytail: IP·이름이 바뀐 기기만 한 건씩 update — 한 시설(수백 대)까지는 충분. 넘으면 일괄 upsert 로.
        for (const e of existing) {
          const s = seen.get(e.mac)!;
          const hostname = s.hostname ?? e.hostname;
          if (s.ip !== e.lastIp || hostname !== e.hostname) {
            await prisma.accessDevice.update({ where: { id: e.id }, data: { lastIp: s.ip, hostname } });
          }
        }
      }
    }
  }

  if (catalogStored) await bumpAccessRev();
  return { needCatalog: !catalogStored && (!agent.catalogHash || (!!catalogHash && catalogHash !== agent.catalogHash)) };
}
