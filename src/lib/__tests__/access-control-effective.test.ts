import { describe, expect, it } from "vitest";

import { appliedEntryIds, computeEffective, kstDayMinute, nextChangeAt, scheduleMatches } from "@/lib/access-control/effective";
import type { OverrideInput, RuleInput } from "@/lib/access-control/types";

// 2026-10-12 는 월요일. KST = UTC+9
const kst = (iso: string) => new Date(`${iso}+09:00`);
const NOW = kst("2026-10-12T14:30:00");
const NO_PAUSE = { paused: false, until: null };

let seq = 0;
function rule(p: Partial<RuleInput>): RuleInput {
  seq += 1;
  return {
    id: `r${seq}`,
    action: "BLOCK",
    targetKind: "SERVICE",
    target: "youtube",
    scope: "GLOBAL",
    studentId: null,
    daysOfWeek: [],
    startMinute: null,
    endMinute: null,
    enabled: true,
    createdAt: new Date(Date.UTC(2026, 0, 1) + seq * 1000),
    ...p,
  };
}
function override(p: Partial<OverrideInput>): OverrideInput {
  seq += 1;
  return {
    id: `o${seq}`,
    action: "ALLOW",
    targetKind: "SERVICE",
    target: "youtube",
    scope: "GLOBAL",
    studentId: null,
    startAt: kst("2026-10-12T14:00:00"),
    endAt: kst("2026-10-12T15:00:00"),
    cancelledAt: null,
    createdAt: new Date(Date.UTC(2026, 5, 1) + seq * 1000),
    ...p,
  };
}
const run = (rules: RuleInput[], overrides: OverrideInput[] = [], now = NOW) =>
  computeEffective({ rules, overrides, pause: NO_PAUSE, now });

describe("kstDayMinute", () => {
  it("UTC 시각을 KST 요일·분으로 바꾼다", () => {
    expect(kstDayMinute(NOW)).toEqual({ dow: 1, minute: 14 * 60 + 30 });
    // UTC 일요일 15:30 = KST 월요일 00:30
    expect(kstDayMinute(new Date("2026-10-11T15:30:00Z"))).toEqual({ dow: 1, minute: 30 });
  });
});

describe("scheduleMatches", () => {
  const at = (iso: string) => kst(iso);
  it("요일·시간대가 없으면 항상", () => {
    expect(scheduleMatches({ daysOfWeek: [], startMinute: null, endMinute: null }, NOW)).toBe(true);
  });
  it("요일만 정하면 그 요일 종일", () => {
    const s = { daysOfWeek: [1, 3], startMinute: null, endMinute: null };
    expect(scheduleMatches(s, at("2026-10-12T00:00:00"))).toBe(true);
    expect(scheduleMatches(s, at("2026-10-13T12:00:00"))).toBe(false);
  });
  it("시간대는 시작 포함·종료 제외", () => {
    const s = { daysOfWeek: [], startMinute: 9 * 60, endMinute: 22 * 60 };
    expect(scheduleMatches(s, at("2026-10-12T08:59:00"))).toBe(false);
    expect(scheduleMatches(s, at("2026-10-12T09:00:00"))).toBe(true);
    expect(scheduleMatches(s, at("2026-10-12T21:59:00"))).toBe(true);
    expect(scheduleMatches(s, at("2026-10-12T22:00:00"))).toBe(false);
  });
  it("자정을 넘는 시간대는 시작한 날의 요일로 본다", () => {
    // 금 22:00 ~ 02:00
    const s = { daysOfWeek: [5], startMinute: 22 * 60, endMinute: 2 * 60 };
    expect(scheduleMatches(s, at("2026-10-16T23:00:00"))).toBe(true); // 금 밤
    expect(scheduleMatches(s, at("2026-10-17T01:00:00"))).toBe(true); // 토 새벽 — 금요일 것
    expect(scheduleMatches(s, at("2026-10-17T02:00:00"))).toBe(false);
    expect(scheduleMatches(s, at("2026-10-16T01:00:00"))).toBe(false); // 금 새벽 — 목요일 것이 아님
    expect(scheduleMatches(s, at("2026-10-17T23:00:00"))).toBe(false); // 토 밤
  });
});

describe("computeEffective", () => {
  it("전체 규칙이 전체 정책이 된다", () => {
    const s = run([rule({}), rule({ targetKind: "DOMAIN", target: "dcinside.com" }), rule({ enabled: false, target: "tiktok" })]);
    expect(s.global).toEqual({
      blockAll: false,
      blockedServices: ["youtube"],
      allowedServices: [],
      blockedDomains: ["dcinside.com"],
      allowedDomains: [],
    });
    expect(s.students).toEqual({});
  });

  it("시간을 정한 허용 규칙이 '항상' 차단 규칙을 이긴다 (점심시간 허용)", () => {
    const rules = [
      rule({}),
      rule({ action: "ALLOW", startMinute: 12 * 60, endMinute: 13 * 60 }),
    ];
    expect(run(rules, [], kst("2026-10-12T12:30:00")).global.blockedServices).toEqual([]);
    expect(run(rules, [], kst("2026-10-12T12:30:00")).global.allowedServices).toEqual(["youtube"]);
    expect(run(rules, [], kst("2026-10-12T13:00:00")).global.blockedServices).toEqual(["youtube"]);
  });

  it("학생 대상 일시 허용은 그 학생만 풀어 준다", () => {
    const s = run([rule({}), rule({ target: "instagram" })], [override({ scope: "STUDENT", studentId: "s1" })]);
    expect(s.global.blockedServices).toEqual(["instagram", "youtube"]);
    expect(s.students.s1.blockedServices).toEqual(["instagram"]);
    expect(s.students.s1.allowedServices).toEqual(["youtube"]);
  });

  it("시간이 지났거나 취소된 일시 조치는 빠진다", () => {
    const rules = [rule({})];
    expect(run(rules, [override({ scope: "STUDENT", studentId: "s1" })], kst("2026-10-12T15:00:00")).students).toEqual({});
    expect(run(rules, [override({ scope: "STUDENT", studentId: "s1", cancelledAt: NOW })]).students).toEqual({});
    expect(run(rules, [override({ scope: "STUDENT", studentId: "s1", startAt: kst("2026-10-12T14:40:00") })]).students).toEqual({});
  });

  it("일시 조치가 규칙보다, 학생 대상이 전체 대상보다 우선", () => {
    // 전체 일시 차단 vs 학생 허용 규칙 → 일시 조치가 이긴다
    const a = run(
      [rule({ action: "ALLOW", scope: "STUDENT", studentId: "s1" })],
      [override({ action: "BLOCK" })],
    );
    expect(a.global.blockedServices).toEqual(["youtube"]);
    expect(a.students).toEqual({});
    // 전체 일시 차단 vs 학생 일시 허용 → 학생 것이 이긴다
    const b = run([], [override({ action: "BLOCK" }), override({ scope: "STUDENT", studentId: "s1" })]);
    expect(b.students.s1.allowedServices).toEqual(["youtube"]);
    // 같은 단계의 일시 조치끼리는 나중 것이 이긴다
    const c = run([], [override({ action: "ALLOW" }), override({ action: "BLOCK" })]);
    expect(c.global.blockedServices).toEqual(["youtube"]);
  });

  it("인터넷 전체 허용(와이파이 해제)은 잠금만 풀고 개별 차단은 남긴다", () => {
    const s = run(
      [rule({ targetKind: "ALL", target: "" }), rule({})],
      [override({ targetKind: "ALL", target: "", scope: "STUDENT", studentId: "s1" })],
    );
    expect(s.global.blockAll).toBe(true);
    expect(s.students.s1.blockAll).toBe(false);
    expect(s.students.s1.blockedServices).toEqual(["youtube"]);
  });

  it("전체 정책과 같아지는 학생은 따로 두지 않는다", () => {
    const s = run([rule({}), rule({ scope: "STUDENT", studentId: "s1" })]);
    expect(s.students).toEqual({});
  });

  it("일시 중지 중에는 아무것도 막지 않고, 기한이 지나면 다시 적용된다", () => {
    const rules = [rule({})];
    const paused = computeEffective({ rules, overrides: [], pause: { paused: true, until: null }, now: NOW });
    expect(paused.paused).toBe(true);
    expect(paused.global.blockedServices).toEqual([]);
    const expired = computeEffective({
      rules,
      overrides: [],
      pause: { paused: true, until: kst("2026-10-12T14:00:00").toISOString() },
      now: NOW,
    });
    expect(expired.paused).toBe(false);
    expect(expired.global.blockedServices).toEqual(["youtube"]);
  });
});

describe("appliedEntryIds", () => {
  it("시간대가 맞아도 더 우선하는 것에 밀린 규칙은 빠진다", () => {
    const block = rule({});
    const lunch = rule({ action: "ALLOW", startMinute: 12 * 60, endMinute: 13 * 60 });
    const other = rule({ target: "instagram" });
    const input = { rules: [block, lunch, other], overrides: [], pause: NO_PAUSE };
    expect([...appliedEntryIds({ ...input, now: kst("2026-10-12T12:30:00") })].sort()).toEqual([lunch.id, other.id].sort());
    expect([...appliedEntryIds({ ...input, now: kst("2026-10-12T14:00:00") })].sort()).toEqual([block.id, other.id].sort());
  });

  it("학생 대상은 그 학생의 정책에서 이겼는지로 본다", () => {
    const block = rule({});
    const mine = rule({ action: "ALLOW", scope: "STUDENT", studentId: "s1" });
    const temp = override({ action: "BLOCK", scope: "STUDENT", studentId: "s1" });
    expect([...appliedEntryIds({ rules: [block, mine], overrides: [], pause: NO_PAUSE, now: NOW })].sort()).toEqual([block.id, mine.id].sort());
    // 학생 일시 차단이 학생 허용 규칙을 민다 — 전체 규칙은 전체 정책에서 여전히 유효
    expect([...appliedEntryIds({ rules: [block, mine], overrides: [temp], pause: NO_PAUSE, now: NOW })].sort()).toEqual([block.id, temp.id].sort());
  });

  it("일시 중지 중에는 아무것도 효력이 없다", () => {
    expect(appliedEntryIds({ rules: [rule({})], overrides: [], pause: { paused: true, until: null }, now: NOW }).size).toBe(0);
  });
});

describe("nextChangeAt", () => {
  it("가장 가까운 경계를 고른다", () => {
    const next = nextChangeAt({
      rules: [rule({ startMinute: 9 * 60, endMinute: 22 * 60 })],
      overrides: [override({ endAt: kst("2026-10-12T15:00:00") })],
      pause: NO_PAUSE,
      now: NOW,
    });
    expect(next?.toISOString()).toBe(kst("2026-10-12T15:00:00").toISOString());
  });
  it("오늘 경계가 지났으면 내일 것", () => {
    const next = nextChangeAt({
      rules: [rule({ startMinute: 9 * 60, endMinute: 10 * 60 })],
      overrides: [],
      pause: NO_PAUSE,
      now: NOW,
    });
    expect(next?.toISOString()).toBe(kst("2026-10-13T09:00:00").toISOString());
  });
  it("요일만 정한 규칙은 자정에 바뀐다", () => {
    const next = nextChangeAt({ rules: [rule({ daysOfWeek: [1] })], overrides: [], pause: NO_PAUSE, now: NOW });
    expect(next?.toISOString()).toBe(kst("2026-10-13T00:00:00").toISOString());
  });
  it("바뀔 일이 없으면 null", () => {
    expect(nextChangeAt({ rules: [rule({})], overrides: [], pause: NO_PAUSE, now: NOW })).toBeNull();
  });
});
