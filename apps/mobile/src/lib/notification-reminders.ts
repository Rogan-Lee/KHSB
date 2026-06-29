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

export function buildTaskReminderSchedule(
  tasks: TaskReminderItem[],
  now = new Date(),
  limit = 50,
) {
  const reminders = tasks
    .filter((task) => task.status !== 'DONE')
    .flatMap((task): TaskReminderSchedule[] => {
      const date = task.dueDate.slice(0, 10);
      const [year, month, day] = date.split('-').map(Number);
      if (!year || !month || !day) return [];

      return [
        {
          date: new Date(year, month - 1, day - 1, 18, 0, 0),
          label: '내일' as const,
          task,
        },
        {
          date: new Date(year, month - 1, day, 8, 0, 0),
          label: '오늘' as const,
          task,
        },
      ].filter((reminder) => reminder.date.getTime() > now.getTime());
    })
    .sort((left, right) => left.date.getTime() - right.date.getTime());

  return reminders.slice(0, Math.max(0, limit));
}
