import { describe, expect, it } from "vitest";

import { buildTaskReminderSchedule } from "../../../apps/mobile/src/lib/notification-reminders";
import { resolveNotificationHref } from "../../../apps/mobile/src/lib/notification-routes";

describe("resolveNotificationHref", () => {
  it("maps legacy server urls to the new tab routes", () => {
    expect(resolveNotificationHref({ url: "/student-tasks" })).toBe("/(student)/(tabs)/tasks");
    expect(resolveNotificationHref({ url: "/(student)/qna" })).toBe("/(student)/(tabs)/qna");
    expect(resolveNotificationHref({ url: "/(staff)/qna" })).toBe("/(staff)/(tabs)/inbox");
    expect(resolveNotificationHref({ url: "/messages" })).toBe("/(staff)/(tabs)/inbox");
    expect(resolveNotificationHref({ url: "/(parent)/(tabs)/index" })).toBe("/(parent)/(tabs)");
  });

  it("opens the detail screen when an id is attached", () => {
    expect(resolveNotificationHref({ url: "/student-tasks", taskId: "task_1" })).toBe(
      "/(student)/tasks/task_1",
    );
    expect(resolveNotificationHref({ url: "/(student)/qna", questionId: "q1" })).toBe(
      "/(student)/qna/q1",
    );
    expect(resolveNotificationHref({ url: "/(student)/(tabs)/chat", chatId: "c1" })).toBe(
      "/(student)/chat/c1",
    );
    expect(resolveNotificationHref({ url: "/(staff)/qna", questionId: "q2" })).toBe(
      "/(staff)/qna/q2",
    );
    expect(resolveNotificationHref({ url: "/staff-tasks", taskId: "t9" })).toBe(
      "/(staff)/tasks/t9",
    );
  });

  it("accepts direct detail routes and ignores unsafe ids", () => {
    expect(resolveNotificationHref({ url: "/(student)/tasks/abc-123" })).toBe(
      "/(student)/tasks/abc-123",
    );
    expect(resolveNotificationHref({ url: "/student-tasks", taskId: "../../x" })).toBe(
      "/(student)/(tabs)/tasks",
    );
  });

  it("opens native student screens and parent report details", () => {
    expect(resolveNotificationHref({ url: "/(student)/points" })).toBe("/(student)/points");
    expect(resolveNotificationHref({ url: "/(student)/contents/post_1" })).toBe(
      "/(student)/contents/post_1",
    );
    expect(resolveNotificationHref({ url: "/(parent)/reports/monthly/r1" })).toBe(
      "/(parent)/reports/monthly/r1",
    );
    expect(resolveNotificationHref({ url: "/(parent)/reports/payroll/r1" })).toBeNull();
    expect(resolveNotificationHref({ url: "/(student)/portal" })).toBeNull();
  });

  it("rejects routes outside the allow-list", () => {
    expect(resolveNotificationHref({ url: "https://evil.example.com" })).toBeNull();
    expect(resolveNotificationHref({ url: "/(staff)/payroll" })).toBeNull();
    expect(resolveNotificationHref({ broadcast: true })).toBeNull();
    expect(resolveNotificationHref(null)).toBeNull();
  });
});

describe("buildTaskReminderSchedule options", () => {
  const task = {
    dueDate: "2026-06-25T00:00:00.000Z",
    id: "task-1",
    status: "OPEN",
    subject: "국어",
    title: "독서 보고서",
  };
  const now = new Date(2026, 5, 20, 12, 0, 0);

  it("schedules only the enabled reminder slots", () => {
    expect(
      buildTaskReminderSchedule([task], now, 50, { dayBefore: false }).map((r) => r.label),
    ).toEqual(["오늘"]);
    expect(
      buildTaskReminderSchedule([task], now, 50, { sameDay: false }).map((r) => r.label),
    ).toEqual(["내일"]);
    expect(buildTaskReminderSchedule([task], now, 50, { dayBefore: false, sameDay: false })).toEqual(
      [],
    );
  });

  it("skips tasks that are already submitted", () => {
    expect(buildTaskReminderSchedule([{ ...task, status: "SUBMITTED" }], now)).toEqual([]);
  });
});
