import { describe, expect, it } from "vitest";

import {
  MAX_DISMISSED,
  addDismissed,
  bannerKey,
  parseDismissed,
  shouldShowBanner,
} from "../../../apps/mobile/src/features/tuition/banner-state";
import {
  bannerSubtitle,
  bannerTitle,
  dueMeta,
  nextPaymentText,
  won,
} from "../../../apps/mobile/src/features/tuition/format";
import {
  checkoutFailurePlan,
  invoiceCheckState,
  isPaidSync,
  runPaymentCheck,
  type InvoiceCheckState,
} from "../../../apps/mobile/src/features/tuition/pay-flow";

const requested = { invoiceId: "inv-1", overdue: false };
const overdue = { invoiceId: "inv-1", overdue: true };

describe("bannerKey", () => {
  it("includes the invoice state so an overdue invoice gets a new key", () => {
    expect(bannerKey(requested)).toBe("inv-1:REQUESTED");
    expect(bannerKey(overdue)).toBe("inv-1:OVERDUE");
  });
});

describe("shouldShowBanner", () => {
  it("hides when there is no banner", () => {
    expect(shouldShowBanner(null, [])).toBe(false);
    expect(shouldShowBanner(undefined, [])).toBe(false);
  });

  it("shows a banner that was never dismissed", () => {
    expect(shouldShowBanner(requested, [])).toBe(true);
    expect(shouldShowBanner(requested, ["other:REQUESTED"])).toBe(true);
  });

  it("hides a dismissed banner", () => {
    expect(shouldShowBanner(requested, [bannerKey(requested)])).toBe(false);
  });

  it("shows again once the dismissed invoice becomes overdue", () => {
    const dismissed = addDismissed([], bannerKey(requested));
    expect(shouldShowBanner(requested, dismissed)).toBe(false);
    expect(shouldShowBanner(overdue, dismissed)).toBe(true);
  });

  it("stays hidden after the overdue banner is dismissed too", () => {
    const dismissed = addDismissed(addDismissed([], bannerKey(requested)), bannerKey(overdue));
    expect(shouldShowBanner(overdue, dismissed)).toBe(false);
  });

  it("shows a different invoice", () => {
    const dismissed = addDismissed([], bannerKey(requested));
    expect(shouldShowBanner({ invoiceId: "inv-2", overdue: false }, dismissed)).toBe(true);
  });
});

describe("addDismissed", () => {
  it("appends without mutating the input", () => {
    const before = ["a:REQUESTED"];
    const after = addDismissed(before, "b:REQUESTED");
    expect(after).toEqual(["a:REQUESTED", "b:REQUESTED"]);
    expect(before).toEqual(["a:REQUESTED"]);
  });

  it("does not duplicate a key and moves it to the most recent slot", () => {
    const keys = addDismissed(["a:REQUESTED", "b:REQUESTED"], "a:REQUESTED");
    expect(keys).toEqual(["b:REQUESTED", "a:REQUESTED"]);
  });

  it("keeps only the most recent keys", () => {
    let keys: string[] = [];
    for (let i = 0; i < MAX_DISMISSED + 5; i += 1) keys = addDismissed(keys, `inv-${i}:REQUESTED`);
    expect(keys).toHaveLength(MAX_DISMISSED);
    expect(keys[0]).toBe("inv-5:REQUESTED");
    expect(keys[keys.length - 1]).toBe(`inv-${MAX_DISMISSED + 4}:REQUESTED`);
  });

  it("respects a custom cap", () => {
    expect(addDismissed(["a", "b", "c"], "d", 2)).toEqual(["c", "d"]);
  });
});

describe("parseDismissed", () => {
  it("reads a stored list", () => {
    expect(parseDismissed(JSON.stringify(["a:REQUESTED", "b:OVERDUE"]))).toEqual(["a:REQUESTED", "b:OVERDUE"]);
  });

  it("treats missing or broken values as empty", () => {
    expect(parseDismissed(null)).toEqual([]);
    expect(parseDismissed("")).toEqual([]);
    expect(parseDismissed("{not json")).toEqual([]);
    expect(parseDismissed(JSON.stringify({ a: 1 }))).toEqual([]);
  });

  it("drops non-string entries", () => {
    expect(parseDismissed(JSON.stringify(["a:REQUESTED", 3, null]))).toEqual(["a:REQUESTED"]);
  });
});

describe("tuition format", () => {
  it("formats money without relying on Intl", () => {
    expect(won(690000)).toBe("690,000원");
    expect(won(2070000)).toBe("2,070,000원");
    expect(won(900)).toBe("900원");
    expect(won(undefined)).toBe("0원");
  });

  it("builds the banner lines", () => {
    const banner = { title: "11월 수강료", amount: 690000, dueDate: "2026-11-05", overdue: false };
    expect(bannerTitle(banner)).toBe("11월 수강료 690,000원");
    expect(bannerSubtitle(banner)).toBe("11월 5일까지 납부해 주세요");
    expect(bannerSubtitle({ ...banner, overdue: true })).toBe("납부 기한이 지났어요");
  });

  it("labels the days left until the due date", () => {
    expect(dueMeta(3)).toEqual({ label: "D-3", tone: "warn" });
    expect(dueMeta(10)).toEqual({ label: "D-10", tone: "gray" });
    expect(dueMeta(0)).toEqual({ label: "오늘까지", tone: "warn" });
    expect(dueMeta(-2)).toEqual({ label: "2일 지남", tone: "bad" });
  });

  it("describes the next payment", () => {
    expect(nextPaymentText({ date: "2026-11-05", basis: "DUE", coverageEnd: null }, "2026-11-01")).toBe(
      "11월 5일까지 납부해 주세요",
    );
    expect(nextPaymentText({ date: "2026-11-05", basis: "DUE", coverageEnd: null }, "2026-11-08")).toBe(
      "납부 기한(11월 5일)이 지났어요. 확인하고 납부해 주세요",
    );
    expect(
      nextPaymentText({ date: "2026-12-01", basis: "COVERAGE_END", coverageEnd: "2026-11-30" }, "2026-11-10"),
    ).toBe("이용 기간이 2026.11.30에 끝나요. 다음 수강료는 12월 1일부터예요. 청구서가 나오면 알려 드릴게요");
    expect(nextPaymentText({ date: null, basis: "NONE", coverageEnd: null })).toBeNull();
    expect(nextPaymentText(undefined)).toBeNull();
  });
});

describe("checkoutFailurePlan", () => {
  it("treats an already paid invoice as good news and refreshes", () => {
    expect(checkoutFailurePlan("ALREADY_PAID", "이미 납부되었습니다")).toEqual({
      message: "이미 납부된 수강료예요",
      tone: "success",
      refresh: true,
    });
  });

  it("asks to withdraw the on-site request first", () => {
    const plan = checkoutFailurePlan("ONSITE_REQUEST_EXISTS", "서버 문구");
    expect(plan.message).toBe("현장 결제 신청을 철회한 뒤 결제해 주세요");
    expect(plan.tone).toBe("error");
  });

  it("shows the server message and refreshes when online payment is off", () => {
    const serverMessage = "지금은 현장 결제만 받고 있어요. 독서실에서 결제해 주세요.";
    expect(checkoutFailurePlan("ONLINE_DISABLED", serverMessage)).toEqual({
      message: serverMessage,
      tone: "error",
      refresh: true,
    });
  });

  it("keeps the screen as is for retryable provider failures", () => {
    for (const code of ["PROVIDER_UNAVAILABLE", "PROVIDER_REJECTED", "BUSY", "SOMETHING_NEW"]) {
      const plan = checkoutFailurePlan(code, "잠시 후 다시 시도해 주세요");
      expect(plan).toEqual({ message: "잠시 후 다시 시도해 주세요", tone: "error", refresh: false });
    }
  });

  it("falls back to a generic message when the server sends none", () => {
    expect(checkoutFailurePlan("INTERNAL", "").message).toBe("결제를 시작하지 못했어요. 잠시 후 다시 시도해 주세요");
    expect(checkoutFailurePlan(undefined, undefined).refresh).toBe(false);
  });
});

describe("isPaidSync", () => {
  it("is true only for a settled invoice that was actually paid", () => {
    expect(isPaidSync({ settled: true, status: "PAID" })).toBe(true);
    expect(isPaidSync({ settled: true, status: "PARTIALLY_REFUNDED" })).toBe(true);
    expect(isPaidSync({ settled: false, status: "REQUESTED" })).toBe(false);
    expect(isPaidSync({ settled: false, status: "OVERDUE" })).toBe(false);
  });

  it("does not report a canceled or refunded invoice as paid", () => {
    expect(isPaidSync({ settled: true, status: "CANCELED" })).toBe(false);
    expect(isPaidSync({ settled: true, status: "REFUNDED" })).toBe(false);
  });

  it("trusts settled when the status is missing", () => {
    expect(isPaidSync({ settled: true })).toBe(true);
    expect(isPaidSync(null)).toBe(false);
  });
});

describe("invoiceCheckState", () => {
  const open = { id: "inv-1", status: "REQUESTED", linkPending: { deposit: null } };

  it("reads the invoice from the open list", () => {
    expect(invoiceCheckState({ open: [open], history: [] }, "inv-1")).toBe("open");
    expect(
      invoiceCheckState({ open: [{ ...open, linkPending: { deposit: { bank: "은행" } } }], history: [] }, "inv-1"),
    ).toBe("deposit");
  });

  it("sees a paid invoice in the history", () => {
    expect(invoiceCheckState({ open: [], history: [{ id: "inv-1", status: "PAID" }] }, "inv-1")).toBe("settled");
  });

  it("reports a canceled or missing invoice as gone", () => {
    expect(invoiceCheckState({ open: [], history: [{ id: "inv-1", status: "CANCELED" }] }, "inv-1")).toBe("gone");
    expect(invoiceCheckState({ open: [], history: [] }, "inv-1")).toBe("gone");
    expect(invoiceCheckState({}, "inv-1")).toBe("gone");
  });

  it("returns null when nothing was loaded", () => {
    expect(invoiceCheckState(null, "inv-1")).toBeNull();
  });
});

describe("runPaymentCheck", () => {
  /** 호출 횟수를 세는 가짜 의존성 — 대기는 즉시 끝난다 */
  function harness(script: {
    sync: (call: number) => boolean | null | Promise<boolean | null>;
    reload?: (call: number) => InvoiceCheckState | null;
    cancelAfterSync?: number;
  }) {
    const calls = { sync: 0, reload: 0, waits: [] as number[] };
    let cancelled = false;
    const deps = {
      sync: async () => {
        calls.sync += 1;
        const result = await script.sync(calls.sync);
        if (script.cancelAfterSync === calls.sync) cancelled = true;
        return result;
      },
      reload: async () => {
        calls.reload += 1;
        return script.reload ? script.reload(calls.reload) : "open";
      },
      wait: async (ms: number) => {
        calls.waits.push(ms);
      },
      isCancelled: () => cancelled,
    };
    return { calls, deps };
  }

  it("finishes right away when the first sync is settled", async () => {
    const { calls, deps } = harness({ sync: () => true });
    await expect(runPaymentCheck(deps)).resolves.toBe("settled");
    expect(calls).toEqual({ sync: 1, reload: 0, waits: [] });
  });

  it("polls every 2.5 s and stops as soon as the payment settles", async () => {
    const { calls, deps } = harness({ sync: (n) => n === 3 });
    await expect(runPaymentCheck(deps)).resolves.toBe("settled");
    expect(calls.sync).toBe(3);
    expect(calls.waits).toEqual([2500, 2500]);
  });

  it("stops without settling when the invoice is waiting for a deposit", async () => {
    const { calls, deps } = harness({ sync: () => false, reload: (n) => (n === 2 ? "deposit" : "open") });
    await expect(runPaymentCheck(deps)).resolves.toBe("deposit");
    expect(calls.sync).toBe(2);
  });

  it("notices a payment that the reload shows as settled", async () => {
    const { deps } = harness({ sync: () => false, reload: () => "settled" });
    await expect(runPaymentCheck(deps)).resolves.toBe("settled");
  });

  it("gives up quietly after the first check plus eight polls", async () => {
    const { calls, deps } = harness({ sync: () => false });
    await expect(runPaymentCheck(deps)).resolves.toBe("pending");
    expect(calls.sync).toBe(9);
    expect(calls.reload).toBe(9);
    expect(calls.waits).toHaveLength(8);
  });

  it("keeps polling through network errors", async () => {
    const { calls, deps } = harness({
      sync: (n) => {
        if (n < 3) throw new Error("network");
        return true;
      },
      reload: () => null,
    });
    await expect(runPaymentCheck(deps)).resolves.toBe("settled");
    expect(calls.sync).toBe(3);
  });

  it("stops when the invoice disappears", async () => {
    const { calls, deps } = harness({ sync: () => null, reload: () => "gone" });
    await expect(runPaymentCheck(deps)).resolves.toBe("gone");
    expect(calls.sync).toBe(1);
  });

  it("makes no further requests once cancelled", async () => {
    const { calls, deps } = harness({ sync: () => false, cancelAfterSync: 2 });
    await expect(runPaymentCheck(deps)).resolves.toBe("cancelled");
    expect(calls.sync).toBe(2);
    expect(calls.reload).toBe(1);
  });
});
