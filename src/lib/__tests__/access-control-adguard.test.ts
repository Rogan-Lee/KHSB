import { describe, expect, it } from "vitest";

import { buildAdguardConfig, MANAGED_CLIENT_TAG } from "@/lib/access-control/adguard";
import {
  BYPASS_RULES,
  builtinCatalogRules,
  getCatalogEntry,
  matchServiceByName,
  parseAgentCatalog,
  RECOMMENDED_BLOCK_IDS,
} from "@/lib/access-control/catalog";
import { normalizeDomain } from "@/lib/access-control/domain";
import { EMPTY_POLICY, type DeviceInput, type EffectiveState, type PolicySet } from "@/lib/access-control/types";
import { mapRequestTarget } from "@/lib/network-adapter";
import { heartbeatNeeded, normalizeMac } from "@/lib/access-control/store";

const CATALOG = {
  ...builtinCatalogRules(),
  youtube: ["||youtube.com^", "||googlevideo.com^", "||ytimg.com^"],
  amazon: ["||amazonaws.com^$dnstype=~CNAME", "|ebay-*.s3.amazonaws.com^"],
  icloud_private_relay: ["||mask.icloud.com^$dnsrewrite=NXDOMAIN;;"],
};
const policy = (p: Partial<PolicySet>): PolicySet => ({ ...EMPTY_POLICY, ...p });
const state = (global: Partial<PolicySet>, students: Record<string, Partial<PolicySet>> = {}): EffectiveState => ({
  paused: false,
  global: policy(global),
  students: Object.fromEntries(Object.entries(students).map(([k, v]) => [k, policy(v)])),
});
const device = (id: string, studentId: string | null, status: DeviceInput["status"] = "ASSIGNED"): DeviceInput => ({
  id,
  mac: `aa:bb:cc:dd:ee:${id.padStart(2, "0")}`,
  status,
  studentId,
});
const build = (s: EffectiveState, devices: DeviceInput[] = [], opts: { hardening?: boolean; alwaysAllow?: string[] } = {}) =>
  buildAdguardConfig({
    state: s,
    devices,
    catalog: CATALOG,
    alwaysAllow: opts.alwaysAllow ?? ["khsb.vercel.app"],
    hardening: opts.hardening ?? false,
  });

describe("buildAdguardConfig", () => {
  it("전체 차단은 수식어 없는 규칙으로", () => {
    const c = build(state({ blockedServices: ["youtube"], blockedDomains: ["dcinside.com"] }));
    expect(c.rules).toEqual(expect.arrayContaining(["||youtube.com^", "||googlevideo.com^", "||ytimg.com^", "||dcinside.com^"]));
    expect(c.rules).toHaveLength(4);
    expect(c.clients).toEqual([]);
  });

  it("국내 서비스는 직접 적어 둔 도메인으로 펼친다", () => {
    const c = build(state({ blockedServices: ["kr:naver-webtoon"] }));
    expect(c.rules).toEqual(["||comic.naver.com^", "||series.naver.com^"]);
  });

  it("카탈로그에 없는 서비스는 건너뛰고 알려 준다", () => {
    const c = build(state({ blockedServices: ["nope", "youtube"] }));
    expect(c.unknownServices).toEqual(["nope"]);
    expect(c.rules).toContain("||youtube.com^");
  });

  it("가리는 차단이 없는 허용은 내보내지 않는다", () => {
    const c = build(state({ allowedDomains: ["ebsi.co.kr"], allowedServices: ["youtube"] }));
    expect(c.rules).toEqual([]);
  });

  it("상위 도메인을 막고 하위만 열면 예외 규칙이 된다", () => {
    const c = build(state({ blockedDomains: ["youtube.com"], allowedDomains: ["music.youtube.com"] }));
    expect(c.rules.sort()).toEqual(["@@||music.youtube.com^", "||youtube.com^"]);
  });

  it("인터넷 전체 잠금: 허용 목록·항상 허용만 예외, 허용 안의 차단은 important", () => {
    const c = build(
      state({ blockAll: true, allowedDomains: ["naver.com", "m.comic.naver.com"], blockedDomains: ["comic.naver.com"] }),
    );
    expect(c.rules).toEqual(
      expect.arrayContaining([
        "/.*/",
        "@@||khsb.vercel.app^",
        "@@||naver.com^",
        "||comic.naver.com^$important",
        "@@||m.comic.naver.com^$important",
      ]),
    );
    expect(c.rules).toHaveLength(5);
  });

  it("같은 주소가 서비스 차단과 직접 허용에 겹치면 직접 지정한 쪽이 이긴다", () => {
    const allowWins = build(state({ blockedServices: ["youtube"], allowedDomains: ["ytimg.com"] }));
    expect(allowWins.rules).not.toContain("||ytimg.com^");
    expect(allowWins.rules).toContain("||youtube.com^");
    const blockWins = build(state({ blockAll: true, allowedServices: ["youtube"], blockedDomains: ["ytimg.com"] }));
    expect(blockWins.rules).toContain("||ytimg.com^");
    expect(blockWins.rules).not.toContain("@@||ytimg.com^");
    expect(blockWins.rules).toContain("@@||youtube.com^");
  });

  it("카탈로그 수식어는 차단에 유지하고, dnsrewrite 예외는 $dnsrewrite 꼴로 낸다", () => {
    const blocked = build(state({ blockedServices: ["amazon", "icloud_private_relay"] }));
    expect(blocked.rules).toEqual(
      expect.arrayContaining([
        "||amazonaws.com^$dnstype=~CNAME",
        "|ebay-*.s3.amazonaws.com^",
        "||mask.icloud.com^$dnsrewrite=NXDOMAIN;;",
      ]),
    );
    const allowed = build(state({ blockAll: true, allowedServices: ["amazon", "icloud_private_relay"] }), [], { alwaysAllow: [] });
    expect(allowed.rules).toEqual(
      expect.arrayContaining(["/.*/", "@@||amazonaws.com^", "@@|ebay-*.s3.amazonaws.com^", "@@||mask.icloud.com^$dnsrewrite"]),
    );
  });

  it("전체와 다른 학생 기기는 $client 묶음으로 따로 내고, 전체 규칙에서는 태그로 뺀다", () => {
    const s = state(
      { blockedServices: ["youtube"], blockedDomains: ["dcinside.com"] },
      { s1: { blockedDomains: ["dcinside.com"], allowedServices: ["youtube"] } },
    );
    const c = build(s, [device("1", "s1"), device("2", "s2"), device("3", null, "UNASSIGNED")]);
    // s2 는 전체 정책 그대로라 등록하지 않는다
    expect(c.clients).toEqual([{ name: "srm-1", mac: "aa:bb:cc:dd:ee:01" }]);
    const tag = `$ctag=~${MANAGED_CLIENT_TAG}`;
    expect(c.rules).toEqual(
      expect.arrayContaining([`||youtube.com^${tag}`, `||dcinside.com^${tag}`, "||dcinside.com^$client=srm-1"]),
    );
    // 학생 묶음에는 유튜브 차단이 없다 (허용은 가리는 차단이 없어 생략)
    expect(c.rules.filter((r) => r.includes("client=srm-1"))).toEqual(["||dcinside.com^$client=srm-1"]);
  });

  it("전체가 잠금이고 학생만 풀린 경우: 학생 묶음은 잠금 없이 개별 차단만", () => {
    const s = state({ blockAll: true, blockedServices: ["youtube"] }, { s1: { blockedServices: ["youtube"] } });
    const c = build(s, [device("1", "s1")]);
    const mine = c.rules.filter((r) => r.includes("client=srm-1"));
    expect(mine.sort()).toEqual(["||googlevideo.com^$client=srm-1", "||youtube.com^$client=srm-1", "||ytimg.com^$client=srm-1"]);
    expect(c.rules).toContain(`/.*/$ctag=~${MANAGED_CLIENT_TAG}`);
  });

  it("정책이 같은 학생 기기는 한 묶음으로 합친다", () => {
    const s = state({ blockedServices: ["youtube"] }, { s1: {}, s2: {} });
    const c = build(s, [device("1", "s1"), device("2", "s2"), device("3", "s1")]);
    expect(c.clients.map((x) => x.name)).toEqual(["srm-1", "srm-2", "srm-3"]);
    // 두 학생 모두 "차단 없음" → 묶음 규칙이 없다
    expect(c.rules.every((r) => r.endsWith(`$ctag=~${MANAGED_CLIENT_TAG}`))).toBe(true);
  });

  it("통제 제외 기기는 태그만 붙고 규칙이 없다", () => {
    const c = build(state({ blockedDomains: ["dcinside.com"] }), [device("9", null, "EXEMPT")], { hardening: true });
    expect(c.clients).toEqual([{ name: "srm-9", mac: "aa:bb:cc:dd:ee:09" }]);
    expect(c.rules.some((r) => r.includes("client="))).toBe(false);
    expect(c.rules).toContain(`||dcinside.com^$ctag=~${MANAGED_CLIENT_TAG}`);
  });

  it("우회 방지 규칙은 전체와 학생 묶음 모두에 들어간다", () => {
    const s = state({ blockedDomains: ["dcinside.com"] }, { s1: {} });
    const c = build(s, [device("1", "s1")], { hardening: true });
    expect(c.rules).toContain(`||mask.icloud.com^$dnsrewrite=NXDOMAIN;;,ctag=~${MANAGED_CLIENT_TAG}`);
    expect(c.rules).toContain("||mask.icloud.com^$dnsrewrite=NXDOMAIN;;,client=srm-1");
    expect(c.rules).toContain("||dns.google^$client=srm-1");
    expect(c.rules.filter((r) => r.endsWith("client=srm-1"))).toHaveLength(BYPASS_RULES.length);
  });

  it("일시 중지면 규칙도 기기도 비운다", () => {
    const c = build({ paused: true, global: policy({}), students: {} }, [device("1", "s1"), device("9", null, "EXEMPT")], {
      hardening: true,
    });
    expect(c.rules).toEqual([]);
    expect(c.clients).toEqual([]);
  });

  it("내용이 같으면 버전이 같고, 달라지면 바뀐다", () => {
    const a = build(state({ blockedDomains: ["a.com", "b.com"] }));
    const b = build(state({ blockedDomains: ["a.com", "b.com"] }));
    const c = build(state({ blockedDomains: ["a.com"] }));
    expect(a.version).toBe(b.version);
    expect(a.version).not.toBe(c.version);
  });
});

describe("normalizeDomain", () => {
  it("주소에서 도메인만 남긴다", () => {
    expect(normalizeDomain("https://www.EBSi.co.kr/path?x=1")).toBe("ebsi.co.kr");
    expect(normalizeDomain("*.megastudy.net")).toBe("megastudy.net");
    expect(normalizeDomain("m.comic.naver.com:443")).toBe("m.comic.naver.com");
    expect(normalizeDomain(" youtube.com ")).toBe("youtube.com");
  });
  it("한글 도메인은 퓨니코드로", () => {
    expect(normalizeDomain("한국.kr")).toBe("xn--3e0b707e.kr");
  });
  it("도메인이 아닌 입력은 거른다", () => {
    for (const bad of ["", "유튜브", "localhost", "192.168.0.1", "a b.com", "http://", "||x.com^$important", "x.com\n||y.com^", null, 3]) {
      expect(normalizeDomain(bad)).toBeNull();
    }
  });
});

describe("matchServiceByName", () => {
  it("정확한 이름·별칭만 인정한다", () => {
    expect(matchServiceByName("유튜브")).toBe("youtube");
    expect(matchServiceByName("YouTube")).toBe("youtube");
    expect(matchServiceByName(" 인스타 ")).toBe("instagram");
    expect(matchServiceByName("네이버 웹툰")).toBe("kr:naver-webtoon");
    expect(matchServiceByName("클래스룸")).toBeNull();
    expect(matchServiceByName("유튜브 말고 다른 것")).toBeNull();
  });
});

describe("mapRequestTarget", () => {
  it("신청 종류별로 통제 대상을 정한다", () => {
    expect(mapRequestTarget({ kind: "WIFI_UNBLOCK", target: null })).toMatchObject({ targetKind: "ALL", target: "" });
    expect(mapRequestTarget({ kind: "DOMAIN_ALLOW", target: "https://www.ebsi.co.kr/" })).toMatchObject({
      targetKind: "DOMAIN",
      target: "ebsi.co.kr",
    });
    expect(mapRequestTarget({ kind: "APP_UNBLOCK", target: "유튜브" })).toMatchObject({ targetKind: "SERVICE", target: "youtube" });
    expect(mapRequestTarget({ kind: "APP_UNBLOCK", target: "classroom.google.com" })).toMatchObject({
      targetKind: "DOMAIN",
      target: "classroom.google.com",
    });
  });
  it("못 알아보는 대상은 null (직원이 직접 처리)", () => {
    expect(mapRequestTarget({ kind: "APP_UNBLOCK", target: "클래스룸" })).toBeNull();
    expect(mapRequestTarget({ kind: "DOMAIN_ALLOW", target: "이비에스" })).toBeNull();
  });
});

describe("장비 입력 검증", () => {
  it("MAC 을 정리하고 개별 기기가 아닌 주소는 거른다", () => {
    expect(normalizeMac("0:31:92:83:F1:72")).toBe("00:31:92:83:f1:72");
    expect(normalizeMac("AA-BB-CC-DD-EE-01")).toBe("aa:bb:cc:dd:ee:01");
    expect(normalizeMac("ff:ff:ff:ff:ff:ff")).toBeNull();
    expect(normalizeMac("01:00:5e:00:00:fb")).toBeNull();
    expect(normalizeMac("00:00:00:00:00:00")).toBeNull();
    expect(normalizeMac("not-a-mac")).toBeNull();
  });
  it("생존 신호는 1분에 한 번, 또는 적용 버전·오류가 달라졌을 때만 DB 에 쓴다", () => {
    const now = new Date("2026-10-12T05:00:00Z");
    const ago = (s: number) => new Date(now.getTime() - s * 1000);
    const agent = { lastSeenAt: ago(30), appliedVersion: "v1", lastError: null };
    expect(heartbeatNeeded(agent, { applied: "v1", error: null }, now)).toBe(false);
    expect(heartbeatNeeded({ ...agent, lastSeenAt: ago(60) }, { applied: "v1", error: null }, now)).toBe(true);
    expect(heartbeatNeeded({ ...agent, lastSeenAt: null }, { applied: null, error: null }, now)).toBe(true);
    expect(heartbeatNeeded(agent, { applied: "v2", error: null }, now)).toBe(true);
    expect(heartbeatNeeded(agent, { applied: null, error: "AdGuard Home 적용 실패" }, now)).toBe(true);
    // 오류가 풀리면 바로 지운다
    expect(heartbeatNeeded({ ...agent, lastError: "x" }, { applied: "v1", error: null }, now)).toBe(true);
    // 적용 버전을 아직 모르는 호출(막 켜진 장비)은 기록된 버전을 건드리지 않는다
    expect(heartbeatNeeded(agent, { applied: null, error: null }, now)).toBe(false);
  });

  it("장비가 올린 서비스 목록에서 형식이 다른 항목과 줄바꿈 든 규칙을 버린다", () => {
    const parsed = parseAgentCatalog([
      { id: "youtube", rules: ["||youtube.com^", "||x.com^\n||evil.com^", 3, ""] },
      { id: "bad id!", rules: ["||a.com^"] },
      { id: "norules" },
      "junk",
    ]);
    expect(parsed).toEqual({ youtube: ["||youtube.com^"] });
  });
});

describe("추천 묶음", () => {
  it("30개 모두 기본 목록에 있다 (오타면 화면에서 조용히 빠진다)", () => {
    expect(new Set(RECOMMENDED_BLOCK_IDS).size).toBe(30);
    expect(RECOMMENDED_BLOCK_IDS.filter((id) => !getCatalogEntry(id))).toEqual([]);
  });
});
