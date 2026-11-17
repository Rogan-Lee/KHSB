import { describe, expect, it } from "vitest";

import { findNewItems } from "../new-item-toasts";

const visible = new Set(["/waitlist", "/questions"]);

describe("findNewItems", () => {
  it("alerts when a new item arrives even if another was handled meanwhile (count unchanged)", () => {
    const prev = { "/waitlist": 2, "newest:/waitlist": 1_000 };
    const next = { "/waitlist": 2, "newest:/waitlist": 2_000 };
    expect(findNewItems(prev, next, visible)).toEqual([{ href: "/waitlist", label: "입회 대기 신청·문의", added: 1 }]);
  });

  it("alerts on the first item after an empty menu", () => {
    expect(findNewItems({}, { "/questions": 3, "newest:/questions": 5 }, visible)).toEqual([
      { href: "/questions", label: "학생 질문", added: 3 },
    ]);
  });

  it("stays quiet when items were only handled", () => {
    const prev = { "/waitlist": 2, "newest:/waitlist": 2_000 };
    const next = { "/waitlist": 1, "newest:/waitlist": 1_000 };
    expect(findNewItems(prev, next, visible)).toEqual([]);
  });

  it("skips menus this staff member cannot open", () => {
    expect(findNewItems({}, { "/moderation": 1, "newest:/moderation": 9 }, visible)).toEqual([]);
  });
});
