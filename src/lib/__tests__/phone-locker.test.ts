import { describe, expect, it } from "vitest";

import {
  completionTargets,
  phoneCheckReference,
  phoneSlotState,
  PHONE_LOCKER_ROWS,
  slotKind,
} from "@/lib/phone-locker";

const at = (hhmm: string, date = "2026-11-13") => new Date(`${date}T${hhmm}:00+09:00`);

describe("휴대폰 보관함 판정", () => {
  it("기준 시각 — 오늘 지금 교시·입실은 지금, 지난 교시는 시작 10분 뒤, 지난 날 입실은 없음", () => {
    const now = at("18:20"); // 학기 중 금요일 3교시
    expect(phoneCheckReference("2026-11-13", 3, now)).toEqual({ ref: now.getTime(), live: true });
    expect(phoneCheckReference("2026-11-13", 0, now)).toEqual({ ref: now.getTime(), live: true });
    expect(phoneCheckReference("2026-11-13", 2, now)).toEqual({ ref: at("17:10").getTime(), live: false });
    expect(phoneCheckReference("2026-11-12", 0, now)).toEqual({ ref: null, live: false });
  });

  it("자리 판정 — 외출 중·교시 중 퇴실은 비어 있어야 하는 칸", () => {
    const ref = at("18:10").getTime();
    const span = { checkIn: at("16:00"), checkOut: null };
    expect(phoneSlotState(undefined, [], ref)).toBe("NONE");
    expect(phoneSlotState(span, [], ref)).toBe("HERE");
    expect(phoneSlotState({ checkIn: at("18:30"), checkOut: null }, [], ref)).toBe("NONE");
    expect(phoneSlotState({ checkIn: at("16:00"), checkOut: at("18:05") }, [], ref)).toBe("LEFT");
    expect(phoneSlotState(span, [{ outStart: at("18:00"), outEnd: null }], ref)).toBe("OUTING");
    expect(phoneSlotState(span, [{ outStart: at("17:00"), outEnd: at("18:00") }], ref)).toBe("HERE");
    expect(phoneSlotState(span, [{ outStart: null, outEnd: null }], ref)).toBe("HERE"); // 예정만 있는 외출
    expect(phoneSlotState({ checkIn: at("13:00"), checkOut: at("15:00") }, [], null)).toBe("HERE");
  });

  it("칸 모습과 완료 대상 — 면제는 이어 받고, 기록 있는 칸은 건드리지 않는다", () => {
    const here = { checkedIn: true, prior: null, record: null };
    expect(slotKind(here)).toBe("todo");
    expect(slotKind({ ...here, record: { status: "SUBMITTED" } })).toBe("ok");
    expect(slotKind({ ...here, record: { status: "NOT_SUBMITTED" } })).toBe("missing");
    expect(slotKind({ ...here, prior: "EXEMPT" })).toBe("exempt");
    expect(slotKind({ ...here, prior: "EXEMPT", record: { status: "NOT_SUBMITTED" } })).toBe("missing");
    expect(slotKind({ ...here, checkedIn: false })).toBe("away");
    expect(slotKind({ ...here, checkedIn: false, record: { status: "SUBMITTED" } })).toBe("extra");

    const rows = [
      { ...here, studentId: "a" },
      { ...here, studentId: "b", prior: "EXEMPT" as const },
      { ...here, studentId: "c", record: { status: "NOT_SUBMITTED" as const } },
      { ...here, studentId: "d", checkedIn: false },
    ];
    expect(completionTargets(rows)).toEqual({ submitted: ["a"], exempt: ["b"] });
  });

  it("임시 배치는 좌석 1~89 를 5칸씩 빠짐없이", () => {
    const seats = PHONE_LOCKER_ROWS.flat().filter((n) => n !== null);
    expect(seats).toHaveLength(89);
    expect(new Set(seats).size).toBe(89);
    expect(PHONE_LOCKER_ROWS.every((r) => r.length === 5)).toBe(true);
  });
});
