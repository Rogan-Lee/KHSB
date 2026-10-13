#!/usr/bin/env node
// 사용 통제 동기화 에이전트 — 시설에 둔 AdGuard Home 옆에서 돈다 (Node.js 18 이상, 추가 설치 없음).
//
// 하는 일은 세 가지뿐이다. 무엇을 막을지는 전부 서버가 정한다.
//   1. 서버에서 "지금 적용할 설정"(AdGuard 사용자 규칙 + 기기 목록)을 받아 온다.
//   2. AdGuard Home 에 그대로 넣는다. 기기는 MAC 으로 내려오므로 이 장비가 아는 MAC↔IP 표로 IP 를 채운다.
//   3. 와이파이에서 보이는 기기와 적용 결과를 서버에 알린다.
//
// 서버 호출은 30초에 한 번(확인)이 거의 전부다. 기기 목록 보고는 새 기기가 보일 때와 10분마다만 한다.
//
// 리눅스·윈도우·macOS 에서 돈다. 서버 쪽으로만 접속하므로 공유기 포트를 열 필요가 없다.
// 서버와 끊겨도 마지막 설정은 유지되고, 오래 끊기면 "일시 허용을 뺀" 설정으로 물러난다.
//
// 설정(환경변수 또는 같은 폴더의 .env): SRM_URL, SRM_TOKEN, ADGUARD_URL, ADGUARD_USER, ADGUARD_PASSWORD
// 실행: node agent.mjs            계속 실행
//       node agent.mjs --once     한 번만 맞추고 종료 (점검용)
//       node agent.mjs --remove   이 에이전트가 넣은 규칙·기기를 AdGuard Home 에서 지우고 종료

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AGENT_VERSION = "1.0.0";
const HERE = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);

// ─── 설정 ────────────────────────────────────────────────────────────

function loadDotEnv() {
  const file = join(HERE, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith("#")) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}
loadDotEnv();

const env = (name, fallback) => {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
};

const SRM_URL = env("SRM_URL", "").replace(/\/+$/, "");
const SRM_TOKEN = env("SRM_TOKEN", "");
const ADGUARD_URL = env("ADGUARD_URL", "http://127.0.0.1:3000").replace(/\/+$/, "");
const ADGUARD_USER = env("ADGUARD_USER", "");
const ADGUARD_PASSWORD = env("ADGUARD_PASSWORD", "");
const STATE_FILE = env("STATE_FILE", join(HERE, "state.json"));
const MODE = process.argv.includes("--remove") ? "remove" : process.argv.includes("--once") ? "once" : "loop";

const DEFAULT_MANAGED = { begin: "! srm:begin", end: "! srm:end", clientPrefix: "srm-", clientTag: "user_regular" };
/** 새 기기·주소 변경을 알리는 최소 간격 */
const DEVICE_NEW_MS = 60_000;
/** 바뀐 게 없어도 보이는 기기 목록을 다시 알리는 간격 (대시보드의 "접속 중" 표시용) */
const DEVICE_REPORT_MS = 10 * 60_000;
const CATALOG_REFRESH_MS = 6 * 60 * 60_000;
const HTTP_TIMEOUT_MS = 15_000;

// LOG_FILE 을 주면 파일에도 남긴다 — 윈도우의 예약 작업처럼 화면 출력이 어디에도 남지 않는 실행 방식용
const LOG_FILE = env("LOG_FILE", "");
const log = (...a) => {
  const line = [new Date().toISOString(), ...a].join(" ");
  console.log(line);
  if (LOG_FILE) {
    try {
      // ponytail: 5MB 넘으면 통째로 비운다 — 돌려쓰기(rotate) 없이 디스크만 지킨다
      if (existsSync(LOG_FILE) && statSync(LOG_FILE).size > 5_000_000) writeFileSync(LOG_FILE, "");
      appendFileSync(LOG_FILE, `${line}\n`);
    } catch {
      /* 로그 실패가 동기화를 막지 않게 */
    }
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (v) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex").slice(0, 16);

// ─── HTTP ────────────────────────────────────────────────────────────

async function http(url, { method = "GET", headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${new URL(url).pathname} → ${res.status} ${text.slice(0, 200).trim()}`);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const srm = (path, opts = {}) =>
  http(`${SRM_URL}${path}`, { ...opts, headers: { Authorization: `Bearer ${SRM_TOKEN}`, ...(opts.headers ?? {}) } });

const adguardAuth = ADGUARD_USER
  ? { Authorization: `Basic ${Buffer.from(`${ADGUARD_USER}:${ADGUARD_PASSWORD}`).toString("base64")}` }
  : {};
const adguard = (path, opts = {}) =>
  http(`${ADGUARD_URL}/control${path}`, { ...opts, headers: { ...adguardAuth, ...(opts.headers ?? {}) } });

// ─── 이 장비가 아는 MAC ↔ IP ─────────────────────────────────────────

/** "0:31:92:83:F1:72" → "00:31:92:83:f1:72". 개별 기기 주소가 아니면 null */
export function normalizeMac(raw) {
  const parts = String(raw).trim().toLowerCase().split(/[:-]/);
  if (parts.length !== 6 || !parts.every((p) => /^[0-9a-f]{1,2}$/.test(p))) return null;
  const mac = parts.map((p) => p.padStart(2, "0")).join(":");
  if (parseInt(mac.slice(0, 2), 16) & 1) return null; // 멀티캐스트·브로드캐스트
  return mac === "00:00:00:00:00:00" ? null : mac;
}

/** `ip neigh show` (리눅스) 출력 → [{ mac, ip }] */
export function parseIpNeigh(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const m = /^(\S+)\s+dev\s+\S+\s+lladdr\s+(\S+)\s+(?:router\s+)?(\S+)/.exec(line.trim());
    if (!m || /FAILED|INCOMPLETE|NOARP/.test(m[3])) continue;
    const mac = normalizeMac(m[2]);
    if (mac) out.push({ mac, ip: m[1].toLowerCase() });
  }
  return out;
}

/** `arp -an` (macOS·BSD) 출력 → [{ mac, ip }] */
export function parseArp(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const m = /\(([^)]+)\)\s+at\s+(\S+)/.exec(line);
    if (!m) continue;
    const mac = normalizeMac(m[2]);
    if (mac) out.push({ mac, ip: m[1].toLowerCase() });
  }
  return out;
}

/**
 * `arp -a` (윈도우) 출력 → [{ mac, ip }]. 머리글과 "동적/정적" 같은 낱말은 언어마다 달라서 보지 않고,
 * "IP  MAC" 꼴의 줄만 읽는다.
 */
export function parseWindowsArp(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const m = /^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-f]{2}(?:-[0-9a-f]{2}){5})\b/i.exec(line);
    if (!m) continue;
    const mac = normalizeMac(m[2]);
    if (mac) out.push({ mac, ip: m[1] });
  }
  return out;
}

// ponytail: 이웃 기기 표(ARP·NDP)로만 MAC↔IP 를 안다 — 이 장비와 같은 네트워크 구간의 기기만 보인다.
// 공유기 모드 AP 뒤처럼 다른 구간까지 봐야 하면 DHCP 서버(공유기) 연동이 필요.
async function readNeighbors() {
  if (process.platform === "win32") {
    try {
      // ponytail: 윈도우에서는 IPv4 이웃만 본다 (IPv6 는 netsh 출력이 언어마다 달라 생략 — 공유기 IPv6 는 어차피 끄게 안내한다)
      return parseWindowsArp((await run("arp", ["-a"], { windowsHide: true })).stdout);
    } catch (e) {
      log("이웃 기기 표를 읽지 못했습니다:", e.message);
      return [];
    }
  }
  try {
    return parseIpNeigh((await run("ip", ["neigh", "show"])).stdout);
  } catch {
    try {
      return parseArp((await run("arp", ["-an"])).stdout);
    } catch (e) {
      log("이웃 기기 표를 읽지 못했습니다:", e.message);
      return [];
    }
  }
}

/** 와이파이에서 보이는 기기 — { mac → { ips, hostname } }. AdGuard Home 이 DHCP 를 맡고 있으면 그 임대 목록도 쓴다. */
async function discoverDevices() {
  const devices = new Map();
  const touch = (mac) => {
    if (!devices.has(mac)) devices.set(mac, { ips: new Set(), hostname: null });
    return devices.get(mac);
  };
  for (const n of await readNeighbors()) touch(n.mac).ips.add(n.ip);

  const nameByIp = new Map();
  try {
    const dhcp = await adguard("/dhcp/status");
    for (const lease of [...(dhcp?.leases ?? []), ...(dhcp?.static_leases ?? [])]) {
      const mac = normalizeMac(lease.mac ?? "");
      if (!mac) continue;
      const d = touch(mac);
      if (lease.ip) d.ips.add(String(lease.ip).toLowerCase());
      if (lease.hostname) d.hostname = String(lease.hostname);
    }
  } catch {
    /* DHCP 를 안 쓰는 구성 — 무시 */
  }
  try {
    const clients = await adguard("/clients");
    for (const c of clients?.auto_clients ?? []) if (c.name && c.ip) nameByIp.set(String(c.ip).toLowerCase(), String(c.name));
  } catch {
    /* 이름 없이 진행 */
  }
  for (const d of devices.values()) {
    if (!d.hostname) for (const ip of d.ips) if (nameByIp.has(ip)) d.hostname = nameByIp.get(ip);
  }
  return devices;
}

// ─── AdGuard Home 에 맞추기 ──────────────────────────────────────────

/** 사용자 규칙에서 관리 구간을 떼어 낸다 → { before, managed, after } */
export function splitManaged(userRules, managed) {
  const b = userRules.indexOf(managed.begin);
  const e = userRules.indexOf(managed.end);
  if (b === -1 || e === -1 || e < b) return { before: userRules.filter((l) => l !== managed.begin && l !== managed.end), managed: [], after: [] };
  return { before: userRules.slice(0, b), managed: userRules.slice(b + 1, e), after: userRules.slice(e + 1) };
}

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

function clientBody(name, ids, tag, base = {}) {
  return {
    use_global_settings: true,
    filtering_enabled: true,
    parental_enabled: false,
    safebrowsing_enabled: false,
    safesearch_enabled: false,
    use_global_blocked_services: true,
    blocked_services: [],
    upstreams: [],
    ...base,
    name,
    ids,
    tags: [tag],
  };
}

/**
 * 받은 설정을 AdGuard Home 에 맞춘다. 이미 같으면 아무것도 쓰지 않는다.
 * 순서: 기기(지울 것·줄일 것 먼저 — IP 는 한 기기에만 줄 수 있다) → 규칙.
 */
async function applyConfig(config, devices) {
  const managed = config.managed ?? DEFAULT_MANAGED;
  let changed = 0;

  // 1) 기기
  const current = await adguard("/clients");
  const all = current?.clients ?? [];
  const mine = new Map(all.filter((c) => c.name.startsWith(managed.clientPrefix)).map((c) => [c.name, c]));
  // 직접 만든 클라이언트가 쓰는 주소는 건드리지 않는다
  const taken = new Set(all.filter((c) => !c.name.startsWith(managed.clientPrefix)).flatMap((c) => c.ids.map((i) => i.toLowerCase())));

  const wanted = new Map();
  const ipOwner = new Map();
  for (const c of config.clients) {
    const ips = [...(devices.get(c.mac)?.ips ?? [])].filter((ip) => !taken.has(ip)).sort();
    const ids = [c.mac];
    for (const ip of ips) {
      if (ipOwner.has(ip)) continue;
      ipOwner.set(ip, c.name);
      ids.push(ip);
    }
    if (!taken.has(c.mac)) wanted.set(c.name, ids);
  }

  for (const name of mine.keys()) {
    if (wanted.has(name)) continue;
    await adguard("/clients/delete", { method: "POST", body: { name } });
    changed++;
  }
  const pending = [];
  for (const [name, ids] of wanted) {
    const cur = mine.get(name);
    if (!cur) {
      pending.push({ name, ids, grow: true });
      continue;
    }
    const curIds = cur.ids.map((i) => i.toLowerCase()).sort();
    if (sameList(curIds, [...ids].sort()) && (cur.tags ?? []).includes(managed.clientTag)) continue;
    pending.push({ name, ids, cur, grow: ids.some((i) => !curIds.includes(i)) });
  }
  // 주소를 내놓기만 하는 변경을 먼저 — 다른 기기가 그 주소를 받을 수 있게
  for (const p of pending.sort((a, b) => Number(a.grow) - Number(b.grow))) {
    if (p.cur) {
      await adguard("/clients/update", { method: "POST", body: { name: p.name, data: clientBody(p.name, p.ids, managed.clientTag, p.cur) } });
    } else {
      await adguard("/clients/add", { method: "POST", body: clientBody(p.name, p.ids, managed.clientTag) });
    }
    changed++;
  }

  // 2) 규칙 — 관리 구간만 바꾸고 직접 적어 둔 규칙은 그대로 둔다
  const status = await adguard("/filtering/status");
  const parts = splitManaged(status?.user_rules ?? [], managed);
  if (!sameList(parts.managed, config.rules) || (config.rules.length === 0 && (status?.user_rules ?? []).includes(managed.begin))) {
    const block = config.rules.length > 0 ? [managed.begin, ...config.rules, managed.end] : [];
    await adguard("/filtering/set_rules", { method: "POST", body: { rules: [...parts.before, ...block, ...parts.after] } });
    changed++;
  }
  return changed;
}

// ─── 서비스 목록 ─────────────────────────────────────────────────────

async function readCatalog() {
  const data = await adguard("/blocked_services/all");
  const services = (data?.blocked_services ?? []).map((s) => ({ id: s.id, name: s.name, group: s.group_id ?? null, rules: s.rules ?? [] }));
  return { services, hash: sha(services.map((s) => [s.id, s.rules])) };
}

// ─── 상태 ────────────────────────────────────────────────────────────

/** @type {{ rev: string|null, refreshAt: string|null, config: any, fallback: any, lastContact: number, pollSeconds: number, staleSeconds: number }} */
let state = { rev: null, refreshAt: null, config: null, fallback: null, lastContact: 0, pollSeconds: 30, staleSeconds: 600 };

function loadState() {
  try {
    const saved = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    if (saved?.config?.rules) state = { ...state, ...saved, rev: null, refreshAt: null };
  } catch {
    /* 첫 실행 */
  }
}

function saveState() {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch (e) {
    log("상태 파일을 쓰지 못했습니다:", e.message);
  }
}

/**
 * 서버에 "바뀐 것 있나" 묻는다. 이 호출이 생존 신호도 겸한다 — 적용한 버전·오류·서비스 목록 해시를 실어 보내므로
 * 따로 보고할 일이 줄어든다 (서버 호출 수를 아끼려는 것).
 */
async function pullConfig({ applied, error, catalogHash }) {
  const q = new URLSearchParams();
  if (state.rev) q.set("rev", state.rev);
  if (state.refreshAt) q.set("until", state.refreshAt);
  if (state.config) {
    q.set("v", state.config.version);
    q.set("fv", state.fallback?.version ?? "");
  }
  if (applied) q.set("applied", applied);
  if (error) q.set("err", error.slice(0, 200));
  if (catalogHash) q.set("ch", catalogHash);
  const res = await srm(`/api/access-agent/state?${q}`);
  state.lastContact = Date.now();
  state.rev = res.rev ?? state.rev;
  state.refreshAt = res.refreshAt ?? state.refreshAt;
  state.pollSeconds = Math.max(5, Number(res.pollSeconds) || state.pollSeconds);
  state.staleSeconds = Math.max(60, Number(res.staleSeconds) || state.staleSeconds);
  const needCatalog = !!res.needCatalog;
  if (res.unchanged) return { pulled: false, needCatalog };
  state.config = { version: res.version, rules: res.rules ?? [], clients: res.clients ?? [], managed: res.managed ?? DEFAULT_MANAGED };
  state.fallback = res.fallback
    ? { version: res.fallbackVersion, rules: res.fallback.rules ?? [], clients: res.fallback.clients ?? [], managed: state.config.managed }
    : null;
  saveState();
  if (res.unknownServices?.length) log("AdGuard Home 이 모르는 서비스(적용 안 됨):", res.unknownServices.join(", "));
  return { pulled: true, needCatalog };
}

/** 서버와 오래 끊겼으면 물러난 설정을 쓴다 */
function activeConfig() {
  if (!state.config) return null;
  const stale = state.lastContact > 0 && Date.now() - state.lastContact > state.staleSeconds * 1000;
  return stale && state.fallback ? state.fallback : state.config;
}

// ─── 실행 ────────────────────────────────────────────────────────────

async function removeAll() {
  await applyConfig({ rules: [], clients: [], managed: state.config?.managed ?? DEFAULT_MANAGED }, new Map());
  log("이 에이전트가 넣은 규칙과 기기를 AdGuard Home 에서 지웠습니다.");
}

async function main() {
  loadState();
  if (MODE === "remove") return removeAll();
  if (!SRM_URL || !SRM_TOKEN) {
    console.error("SRM_URL 과 SRM_TOKEN 을 설정해 주세요 (.env 또는 환경변수).");
    process.exit(1);
  }

  let software = null;
  let catalog = null;
  let catalogAt = 0;
  let lastReport = 0;
  /** 서버에 알린 기기 — mac → ip. 새 기기·주소 변경만 바로 알리고, 사라진 것은 정기 보고에 맡긴다 */
  const reported = new Map();
  let lastAppliedVersion = null;
  let lastError = null;
  let quietTicks = 0;

  log(`사용 통제 에이전트 ${AGENT_VERSION} 시작 — 서버 ${SRM_URL}, AdGuard Home ${ADGUARD_URL}`);

  for (let tick = 1; ; tick++) {
    let error = null;
    let pulled = false;
    let sendCatalog = false;
    try {
      ({ pulled, needCatalog: sendCatalog } = await pullConfig({
        applied: lastError ? null : lastAppliedVersion,
        error: lastError,
        catalogHash: catalog?.hash,
      }));
    } catch (e) {
      error = `서버 연결 실패: ${e.message}`;
    }

    let devices = new Map();
    try {
      if (!software) {
        const st = await adguard("/status");
        software = `AdGuard Home ${st?.version ?? ""}`.trim();
      }
      if (!catalog || Date.now() - catalogAt > CATALOG_REFRESH_MS) {
        catalog = await readCatalog();
        catalogAt = Date.now();
      }
      devices = await discoverDevices();
      const config = activeConfig();
      if (config) {
        const changed = await applyConfig(config, devices);
        if (changed > 0 || config.version !== lastAppliedVersion) {
          const note = config === state.fallback ? " (서버와 끊겨 물러난 설정)" : "";
          log(`적용 완료 — 버전 ${config.version}, 규칙 ${config.rules.length}줄, 기기 ${config.clients.length}대${note}`);
        }
        lastAppliedVersion = config.version;
      }
    } catch (e) {
      error = `AdGuard Home 적용 실패: ${e.message}`;
    }
    if (error && error !== lastError) log(error);

    // 보고(POST)는 드물게: 처음 한 번, 서버가 서비스 목록을 달라고 할 때, 새 기기·주소 변경(1분에 한 번까지), 10분마다.
    const now = Date.now();
    const deviceList = [...devices].map(([mac, d]) => ({
      mac,
      ip: [...d.ips].find((ip) => !ip.includes(":")) ?? [...d.ips][0] ?? null,
      hostname: d.hostname,
    }));
    const fresh = deviceList.some((d) => reported.get(d.mac) !== d.ip);
    const withDevices =
      deviceList.length > 0 && ((fresh && now - lastReport > DEVICE_NEW_MS) || now - lastReport > DEVICE_REPORT_MS);
    if (lastReport === 0 || sendCatalog || withDevices) {
      try {
        await srm("/api/access-agent/report", {
          method: "POST",
          body: {
            agentVersion: AGENT_VERSION,
            software,
            appliedVersion: error ? null : lastAppliedVersion,
            error,
            catalogHash: catalog?.hash ?? null,
            ...(sendCatalog && catalog ? { catalog: catalog.services } : {}),
            ...(deviceList.length > 0 ? { devices: deviceList } : {}),
          },
        });
        lastReport = now;
        for (const d of deviceList) reported.set(d.mac, d.ip);
      } catch (e) {
        if (!error) log(`보고 실패: ${e.message}`);
      }
    }
    lastError = error;

    // 새 설정을 넣었거나 서비스 목록을 올린 직후에는 바로 한 번 더 돈다 (적용 결과 알림 · 서버가 다시 만든 규칙 받기)
    const busy = pulled || sendCatalog;
    quietTicks = busy ? 0 : quietTicks + 1;
    if (MODE === "once" && (quietTicks >= 1 || tick >= 6)) {
      if (error) process.exitCode = 1;
      return;
    }
    await sleep((busy ? 1 : state.pollSeconds) * 1000);
  }
}

// 테스트에서 import 할 때는 실행하지 않는다
const samePath = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && samePath(fileURLToPath(import.meta.url), resolve(process.argv[1]))) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
