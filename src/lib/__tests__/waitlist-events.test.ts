import { describe, expect, it } from "vitest";
import { buildTimeline, lastContact, needsContact, type WaitlistEventLite } from "@/lib/waitlist-events";

const ev = (id: string, type: string, createdAt: string, extra: Partial<WaitlistEventLite> = {}): WaitlistEventLite => ({
  id, type, createdAt, method: null, status: null, detail: null, actorName: "원장", ...extra,
});
const base = {
  kind: "WAITLIST" as const,
  source: "WEB",
  status: "WAITING",
  createdAt: "2026-11-01T00:00:00.000Z",
  invitedAt: null,
  enrolledAt: null,
  cancelledAt: null,
  cancelReason: null,
  events: [] as WaitlistEventLite[],
  consultations: [] as { id: string; at: string | null; status: string }[],
};

describe("연락 전 · 마지막 연락", () => {
  it("열린 건에 연락 기록이 없으면 연락 전, 메모만으로는 안 풀린다", () => {
    expect(needsContact(base)).toBe(true);
    expect(needsContact({ ...base, events: [ev("m", "MEMO", "2026-11-02T00:00:00.000Z")] })).toBe(true);
    expect(needsContact({ ...base, events: [ev("c", "CONTACT", "2026-11-02T00:00:00.000Z", { method: "NO_ANSWER" })] })).toBe(false);
    expect(needsContact({ ...base, status: "CANCELLED" })).toBe(false);
  });

  it("가장 최근 연락을 고른다", () => {
    const events = [
      ev("a", "CONTACT", "2026-11-02T00:00:00.000Z", { method: "CALL" }),
      ev("b", "CONTACT", "2026-11-05T00:00:00.000Z", { method: "KAKAO" }),
      ev("m", "MEMO", "2026-11-06T00:00:00.000Z"),
    ];
    expect(lastContact(events)?.id).toBe("b");
  });
});

describe("진행 목록", () => {
  it("기록 전 처리 건은 상태 시각으로, 지금 상태와 맞는 것만", () => {
    const t = buildTimeline({
      ...base,
      status: "CANCELLED",
      invitedAt: "2026-11-03T00:00:00.000Z",
      enrolledAt: "2026-11-04T00:00:00.000Z", // 등원 뒤 취소 — 등원 시각은 지금 상태와 안 맞아 숨김
      cancelledAt: "2026-11-05T00:00:00.000Z",
      cancelReason: "타 독서실",
    });
    expect(t.map((i) => i.label)).toEqual(["대기 신청 접수", "등록 안내함", "대기 취소"]);
    expect(t[2].detail).toBe("타 독서실");
  });

  it("상태 기록이 있으면 옛 시각 대신 기록만, 문의 말투·직접 등록 경로·면담 일시 미정은 맨 뒤", () => {
    const t = buildTimeline({
      ...base,
      kind: "INQUIRY",
      source: "PHONE",
      status: "CANCELLED",
      cancelledAt: "2026-11-05T00:00:00.000Z",
      events: [
        ev("c", "CONTACT", "2026-11-02T00:00:00.000Z", { method: "CALL", detail: "비용 안내" }),
        ev("s", "STATUS", "2026-11-05T00:00:00.000Z", { status: "CANCELLED" }),
      ],
      consultations: [{ id: "x", at: null, status: "SCHEDULED" }],
    });
    expect(t.map((i) => i.label)).toEqual(["문의 등록 (전화)", "통화함", "응대 끝", "면담 예정"]);
    expect(t[1]).toMatchObject({ detail: "비용 안내", actor: "원장" });
  });
});
