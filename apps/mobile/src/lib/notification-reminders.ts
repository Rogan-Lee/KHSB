export type TaskReminderItem = {
  dueDate: string;
  id: string;
  status: string;
  subject: string;
  title: string;
};

export type TaskReminderSchedule = {
  date: Date;
  label: '내일' | '오늘';
  task: TaskReminderItem;
};

export type TaskReminderOptions = {
  /** 마감 전날 저녁 6시 (기본 켬) */
  dayBefore?: boolean;
  /** 마감 당일 아침 8시 (기본 켬) */
  sameDay?: boolean;
};

/** 마감 알림 시각 — 알림 설정 화면 문구와 같이 쓴다 */
export const REMINDER_DAY_BEFORE_HOUR = 18;
export const REMINDER_SAME_DAY_HOUR = 8;

/** 이미 끝났거나 제출해서 검토를 기다리는 과제는 마감 알림이 필요 없다 */
const NO_REMINDER_STATUSES = new Set(['DONE', 'SUBMITTED']);

export function buildTaskReminderSchedule(
  tasks: TaskReminderItem[],
  now = new Date(),
  limit = 50,
  options: TaskReminderOptions = {},
) {
  const dayBefore = options.dayBefore ?? true;
  const sameDay = options.sameDay ?? true;

  const reminders = tasks
    .filter((task) => !NO_REMINDER_STATUSES.has(task.status))
    .flatMap((task): TaskReminderSchedule[] => {
      const date = task.dueDate.slice(0, 10);
      const [year, month, day] = date.split('-').map(Number);
      if (!year || !month || !day) return [];

      const slots: TaskReminderSchedule[] = [];
      if (dayBefore) {
        slots.push({
          date: new Date(year, month - 1, day - 1, REMINDER_DAY_BEFORE_HOUR, 0, 0),
          label: '내일',
          task,
        });
      }
      if (sameDay) {
        slots.push({
          date: new Date(year, month - 1, day, REMINDER_SAME_DAY_HOUR, 0, 0),
          label: '오늘',
          task,
        });
      }
      return slots.filter((reminder) => reminder.date.getTime() > now.getTime());
    })
    .sort((left, right) => left.date.getTime() - right.date.getTime());

  return reminders.slice(0, Math.max(0, limit));
}
