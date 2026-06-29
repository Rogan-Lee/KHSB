import { describe, expect, it } from "vitest";

import { buildTaskReminderSchedule } from "../../../apps/mobile/src/lib/notification-reminders";

const task = {
  dueDate: "2026-06-25T00:00:00.000Z",
  id: "task-1",
  status: "OPEN",
  subject: "국어",
  title: "독서 보고서",
};

describe("buildTaskReminderSchedule", () => {
  it("creates previous-evening and due-morning reminders", () => {
    const reminders = buildTaskReminderSchedule(
      [task],
      new Date(2026, 5, 20, 12, 0, 0),
    );

    expect(reminders).toHaveLength(2);
    expect(reminders.map((reminder) => reminder.label)).toEqual(["내일", "오늘"]);
    expect(reminders[0]?.date.getDate()).toBe(24);
    expect(reminders[0]?.date.getHours()).toBe(18);
    expect(reminders[1]?.date.getDate()).toBe(25);
    expect(reminders[1]?.date.getHours()).toBe(8);
  });

  it("excludes completed and expired tasks", () => {
    const reminders = buildTaskReminderSchedule(
      [
        { ...task, status: "DONE" },
        { ...task, dueDate: "2026-06-19T00:00:00.000Z" },
      ],
      new Date(2026, 5, 20, 12, 0, 0),
    );

    expect(reminders).toEqual([]);
  });

  it("keeps the nearest reminders within the platform-safe limit", () => {
    const reminders = buildTaskReminderSchedule(
      Array.from({ length: 40 }, (_, index) => ({
        ...task,
        dueDate: `2026-07-${String((index % 20) + 1).padStart(2, "0")}T00:00:00.000Z`,
        id: `task-${index}`,
      })),
      new Date(2026, 5, 20, 12, 0, 0),
    );

    expect(reminders).toHaveLength(50);
    expect(
      reminders.every(
        (reminder, index) =>
          index === 0 ||
          reminder.date.getTime() >= reminders[index - 1]!.date.getTime(),
      ),
    ).toBe(true);
  });
});
