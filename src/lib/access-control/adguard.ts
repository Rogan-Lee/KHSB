// 정책 → AdGuard Home 설정(사용자 규칙 + 기기 클라이언트) 변환 — 순수 함수.
// 규칙을 서버에서 만들어 내려보내므로 장비 쪽 스크립트는 "받아서 넣기"만 한다
// (변환 로직을 고쳐도 시설 장비를 다시 설치할 필요가 없다).
//
// AdGuard Home v0.107.79 에서 실제 질의로 확인한 동작에만 기댄다:
//  · 우선순위: 차단 < 예외(@@) < 차단+important < 예외+important
//  · $client=이름|이름 은 그 기기에만, $ctag=~태그 는 그 태그가 붙은 기기를 빼고 적용
//  · /.*/ 는 모든 이름 차단, $dnsrewrite 규칙의 예외는 @@…$dnsrewrite 꼴
//
// 구조: 기기를 "정책이 같은 묶음"으로 나눈다.
//  · 전체 묶음 — 등록 안 된 기기 포함 모두. 규칙에 $ctag=~<태그> 를 붙여 아래 기기들을 뺀다.
//  · 학생 묶음 — 전체와 다른 정책을 받는 학생 기기. 규칙에 $client= 를 붙인다.
//  · 통제 제외 기기 — 태그만 붙고 규칙이 없다.
// 묶음끼리 규칙이 섞이지 않으므로, 한 묶음 안에서만 "더 구체적인 주소가 이긴다"를 풀면 된다.

import { createHash } from "node:crypto";

import { BYPASS_SERVICE_ID, type CatalogRules } from "./catalog";
import type { DeviceInput, EffectiveState, PolicySet } from "./types";

/** 이 연동이 만든 AdGuard 클라이언트에 붙이는 태그 (AdGuard 가 정해 둔 목록 중 하나여야 한다) */
export const MANAGED_CLIENT_TAG = "user_regular";
export const MANAGED_CLIENT_PREFIX = "srm-";
/** 사용자 규칙 안에서 이 연동이 관리하는 구간 표시 — 구간 밖 규칙은 건드리지 않는다 */
export const MANAGED_BEGIN = "! srm:begin";
export const MANAGED_END = "! srm:end";

const CLIENTS_PER_RULE = 20;

export type AdguardClient = { name: string; mac: string };

export type AdguardConfig = {
  /** 내용 해시 — 장비가 적용 여부를 비교하는 값 */
  version: string;
  rules: string[];
  clients: AdguardClient[];
  /** 카탈로그에 없어 적용하지 못한 서비스 id */
  unknownServices: string[];
};

type Entry = {
  kind: "block" | "allow";
  /** 수식어를 뺀 패턴 — 예: ||youtube.com^ (전체 차단은 정규식 한 줄) */
  pattern: string;
  /** 카탈로그 규칙에 원래 붙어 있던 수식어 */
  mods: string[];
  /** 우선순위 계산용 도메인. "" = 전체, null = 와일드카드 등 비교할 수 없는 패턴 */
  domain: string | null;
  /** 같은 도메인에 차단·허용이 겹칠 때: 2 직접 지정한 사이트 · 1 서비스에 딸린 주소 · 0 전체 */
  origin: number;
};

export const clientName = (deviceId: string) => `${MANAGED_CLIENT_PREFIX}${deviceId}`;

function parseRule(rule: string): { pattern: string; mods: string[]; domain: string | null } {
  const i = rule.indexOf("$");
  const pattern = i === -1 ? rule : rule.slice(0, i);
  const mods = i === -1 ? [] : rule.slice(i + 1).split(",").filter(Boolean);
  const m = /^\|\|?([a-z0-9.-]+)\^?$/i.exec(pattern);
  return { pattern, mods, domain: m ? m[1].toLowerCase().replace(/^\.+|\.+$/g, "") : null };
}

function buildEntries(
  policy: PolicySet,
  catalog: CatalogRules,
  opts: { alwaysAllow: string[]; hardening: boolean },
  unknown: Set<string>,
): Entry[] {
  const out: Entry[] = [];
  const addService = (id: string, kind: Entry["kind"]) => {
    const rules = catalog[id];
    if (!rules) {
      unknown.add(id);
      return;
    }
    for (const r of rules) out.push({ kind, origin: 1, ...parseRule(r) });
  };

  if (policy.blockAll) {
    out.push({ kind: "block", pattern: "/.*/", mods: [], domain: "", origin: 0 });
    // 잠금 중에도 학생 앱·포털과 와이파이 연결 확인은 통해야 한다
    for (const d of opts.alwaysAllow) out.push({ kind: "allow", pattern: `||${d}^`, mods: [], domain: d, origin: 1 });
  }
  for (const d of policy.blockedDomains) out.push({ kind: "block", pattern: `||${d}^`, mods: [], domain: d, origin: 2 });
  for (const d of policy.allowedDomains) out.push({ kind: "allow", pattern: `||${d}^`, mods: [], domain: d, origin: 2 });
  for (const s of policy.blockedServices) addService(s, "block");
  for (const s of policy.allowedServices) addService(s, "allow");
  if (opts.hardening) addService(BYPASS_SERVICE_ID, "block");
  return out;
}

/** 0 차단 · 1 예외 · 2 차단+important · 3 예외+important */
type Leveled = Entry & { level: 0 | 1 | 2 | 3 };

/**
 * 한 묶음 안에서 차단·허용 충돌을 푼다.
 *  · 같은 도메인: 직접 지정한 사이트 > 서비스에 딸린 주소. 그래도 같으면 차단.
 *  · 상·하위 도메인: 더 구체적인 쪽이 이기도록 단계를 올린다 (naver.com 허용 + comic.naver.com 차단 → 차단에 important).
 *  · 가리는 차단이 없는 허용은 쓸모가 없어 버린다.
 */
function levelEntries(entries: Entry[]): Leveled[] {
  const byDomain = new Map<string, Entry>();
  const opaque: Entry[] = [];
  for (const e of entries) {
    if (e.domain === null) {
      opaque.push(e);
      continue;
    }
    const cur = byDomain.get(e.domain);
    if (!cur) byDomain.set(e.domain, e);
    else if (cur.kind === e.kind) {
      if (e.origin > cur.origin) byDomain.set(e.domain, e);
    } else if (e.origin > cur.origin || (e.origin === cur.origin && e.kind === "block")) {
      byDomain.set(e.domain, e);
    }
  }

  const depth = (d: string) => (d === "" ? 0 : d.split(".").length);
  const sorted = [...byDomain.values()].sort((a, b) => depth(a.domain!) - depth(b.domain!));
  const level = new Map<string, Leveled>();
  const out: Leveled[] = [];
  const hasRootBlock = byDomain.get("")?.kind === "block";

  for (const e of sorted) {
    // 상위 도메인들 중 반대 종류의 최고 단계
    let maxOpposite = -1;
    let d = e.domain!;
    while (d !== "") {
      const dot = d.indexOf(".");
      d = dot === -1 ? "" : d.slice(dot + 1);
      const anc = level.get(d);
      if (anc && anc.kind !== e.kind && anc.level > maxOpposite) maxOpposite = anc.level;
    }
    if (e.kind === "allow" && maxOpposite === -1) continue;
    const lv: Leveled["level"] = e.kind === "block" ? (maxOpposite >= 1 ? 2 : 0) : maxOpposite >= 2 ? 3 : 1;
    const leveled = { ...e, level: lv };
    level.set(e.domain!, leveled);
    out.push(leveled);
  }
  for (const e of opaque) {
    // ponytail: 와일드카드 패턴은 상·하위 비교 없이 그대로 — 차단은 그대로, 허용은 전체 잠금일 때만 예외로.
    // 카탈로그 2,400줄 중 수십 줄뿐이라 정밀 처리를 생략. 이런 주소를 직접 허용·차단해야 하면 패턴 매칭을 넣는다.
    if (e.kind === "block") out.push({ ...e, level: 0 });
    else if (hasRootBlock) out.push({ ...e, level: 1 });
  }
  return out;
}

function emit(e: Leveled, scopeMod: string | null): string {
  const allow = e.kind === "allow";
  // 예외에는 카탈로그 수식어를 옮기지 않는다. 다만 $dnsrewrite 규칙의 예외는 $dnsrewrite 로만 걸린다.
  const base = allow ? (e.mods.some((m) => m.startsWith("dnsrewrite")) ? ["dnsrewrite"] : []) : e.mods;
  const mods = [...base, scopeMod, e.level >= 2 ? "important" : null].filter((m): m is string => !!m);
  return `${allow ? "@@" : ""}${e.pattern}${mods.length ? `$${mods.join(",")}` : ""}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function buildAdguardConfig(input: {
  state: EffectiveState;
  devices: DeviceInput[];
  catalog: CatalogRules;
  /** 인터넷 전체 잠금 중에도 열어 둘 도메인 */
  alwaysAllow: string[];
  /** 차단 우회 방지 규칙을 함께 넣을지 */
  hardening: boolean;
}): AdguardConfig {
  const { state, devices, catalog } = input;
  const opts = { alwaysAllow: [...new Set(input.alwaysAllow)].sort(), hardening: input.hardening };
  const unknown = new Set<string>();
  const rules: string[] = [];
  const clients: AdguardClient[] = [];

  if (!state.paused) {
    // 정책이 같은 학생 기기끼리 묶는다
    const groups = new Map<string, { policy: PolicySet; names: string[] }>();
    for (const d of [...devices].sort((a, b) => a.id.localeCompare(b.id))) {
      if (d.status === "EXEMPT") {
        clients.push({ name: clientName(d.id), mac: d.mac });
        continue;
      }
      if (d.status !== "ASSIGNED" || !d.studentId) continue;
      const policy = state.students[d.studentId];
      if (!policy) continue; // 전체 정책 그대로 — 따로 등록할 필요 없음
      const key = JSON.stringify(policy);
      const g = groups.get(key) ?? { policy, names: [] };
      g.names.push(clientName(d.id));
      groups.set(key, g);
      clients.push({ name: clientName(d.id), mac: d.mac });
    }

    const globalScope = clients.length > 0 ? `ctag=~${MANAGED_CLIENT_TAG}` : null;
    for (const e of levelEntries(buildEntries(state.global, catalog, opts, unknown))) rules.push(emit(e, globalScope));

    for (const key of [...groups.keys()].sort()) {
      const g = groups.get(key)!;
      const leveled = levelEntries(buildEntries(g.policy, catalog, opts, unknown));
      for (const names of chunk(g.names, CLIENTS_PER_RULE)) {
        const scope = `client=${names.join("|")}`;
        for (const e of leveled) rules.push(emit(e, scope));
      }
    }
  }

  clients.sort((a, b) => a.name.localeCompare(b.name));
  const version = createHash("sha256").update(JSON.stringify({ rules, clients })).digest("hex").slice(0, 16);
  return { version, rules, clients, unknownServices: [...unknown].sort() };
}
