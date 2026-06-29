import type {
  AttendanceType,
  MentoringStatus,
  PerformanceTaskStatus,
  Role,
} from "@/generated/prisma";

import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

const ABSENT_TYPES = new Set<AttendanceType>([
  "ABSENT",
  "APPROVED_ABSENT",
  "NOTIFIED_ABSENT",
]);

const TASK_STATUS_LABELS: Record<PerformanceTaskStatus, string> = {
  OPEN: "진행 전",
  IN_PROGRESS: "진행 중",
  SUBMITTED: "제출 완료",
  NEEDS_REVISION: "수정 필요",
  DONE: "최종 완료",
};

export function getKstDayContext(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateKey = kst.toISOString().slice(0, 10);
  const start = new Date(`${dateKey}T00:00:00+09:00`);

  return {
    date: new Date(dateKey),
    dateKey,
    dayOfWeek: kst.getUTCDay(),
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
    nowTime: kst.toISOString().slice(11, 16),
    start,
  };
}

function formatKstTime(value: Date | null) {
  if (!value) return null;
  return value.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function addMinutes(time: string, minutes: number) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute + minutes;
}

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export async function getStudentMobileOverview(
  studentId: string,
  isOnlineManaged: boolean,
) {
  const [
    openQuestions,
    unreadQuestions,
    taskCounts,
    nextTask,
    nextSession,
    unreadFeedbacks,
  ] = await Promise.all([
    prisma.studentQuestion.count({
      where: {
        studentId,
        status: { in: ["OPEN", "ANSWERED"] },
      },
    }),
    prisma.studentQuestion.count({
      where: {
        studentId,
        studentReadAt: null,
        status: { in: ["ANSWERED", "RESOLVED"] },
      },
    }),
    isOnlineManaged
      ? prisma.performanceTask.groupBy({
          by: ["status"],
          where: { studentId },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    isOnlineManaged
      ? prisma.performanceTask.findFirst({
          where: { studentId, status: { not: "DONE" } },
          orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
          select: {
            dueDate: true,
            id: true,
            status: true,
            subject: true,
            title: true,
          },
        })
      : Promise.resolve(null),
    isOnlineManaged
      ? prisma.mentoringSession.findFirst({
          where: {
            studentId,
            status: { in: ["SCHEDULED", "IN_PROGRESS"] },
            scheduledAt: { gte: new Date() },
          },
          orderBy: { scheduledAt: "asc" },
          select: {
            durationMinutes: true,
            host: { select: { name: true } },
            id: true,
            meetUrl: true,
            scheduledAt: true,
            title: true,
          },
        })
      : Promise.resolve(null),
    isOnlineManaged
      ? prisma.taskFeedback.count({
          where: {
            readByStudentAt: null,
            submission: { studentId },
          },
        })
      : Promise.resolve(0),
  ]);

  const totalTasks = taskCounts.reduce(
    (sum, item) => sum + item._count._all,
    0,
  );
  const doneTasks =
    taskCounts.find((item) => item.status === "DONE")?._count._all ?? 0;

  return {
    isOnlineManaged,
    nextSession: nextSession
      ? {
          durationMinutes: nextSession.durationMinutes,
          hostName: nextSession.host.name,
          id: nextSession.id,
          meetUrl: nextSession.meetUrl,
          scheduledAt: nextSession.scheduledAt.toISOString(),
          title: nextSession.title,
        }
      : null,
    nextTask: nextTask
      ? {
          dueDate: nextTask.dueDate.toISOString(),
          id: nextTask.id,
          status: nextTask.status,
          statusLabel: TASK_STATUS_LABELS[nextTask.status],
          subject: nextTask.subject,
          title: nextTask.title,
        }
      : null,
    stats: {
      doneTasks,
      openQuestions,
      openTasks: totalTasks - doneTasks,
      totalTasks,
      unreadFeedbacks,
      unreadQuestions,
    },
  };
}

export async function getStudentMobileQuestions(studentId: string) {
  const questions = await prisma.studentQuestion.findMany({
    where: { studentId },
    orderBy: [
      { lastMessageAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    take: 100,
    select: {
      createdAt: true,
      id: true,
      lastMessageAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          attachments: true,
          content: true,
          senderType: true,
        },
      },
      status: true,
      studentReadAt: true,
      subject: true,
      title: true,
    },
  });

  return {
    questions: questions.map((question) => {
      const lastMessage = question.messages[0] ?? null;
      return {
        hasAttachments:
          Array.isArray(lastMessage?.attachments) &&
          lastMessage.attachments.length > 0,
        hasUnreadAnswer:
          question.studentReadAt === null &&
          ["ANSWERED", "RESOLVED"].includes(question.status),
        id: question.id,
        lastMessage: lastMessage?.content ?? "",
        lastMessageAt: (
          question.lastMessageAt ?? question.createdAt
        ).toISOString(),
        lastSenderType: lastMessage?.senderType ?? null,
        status: question.status,
        subject: question.subject,
        title: question.title,
      };
    }),
  };
}

export type MobileAttendanceStatus =
  | "입실"
  | "외출"
  | "퇴실"
  | "미입실"
  | "결석";

export function resolveAttendanceStatus(record?: {
  checkIn: Date | null;
  checkOut: Date | null;
  outEnd: Date | null;
  outStart: Date | null;
  type: AttendanceType;
}): MobileAttendanceStatus {
  if (!record) return "미입실";
  if (ABSENT_TYPES.has(record.type)) return "결석";
  if (record.checkOut) return "퇴실";
  if (record.outStart && !record.outEnd) return "외출";
  if (record.checkIn) return "입실";
  return "미입실";
}

export function isAttendanceLate(
  status: MobileAttendanceStatus,
  scheduleStart: string | null,
  nowTime: string,
) {
  return (
    status === "미입실" &&
    scheduleStart !== null &&
    timeToMinutes(nowTime) >= addMinutes(scheduleStart, 30)
  );
}

export type MobileOutingStatus = "예정" | "외출중" | "복귀";

function resolveOutingStatus(
  outStart: Date | null,
  outEnd: Date | null,
): MobileOutingStatus {
  if (outStart && outEnd) return "복귀";
  if (outStart && !outEnd) return "외출중";
  return "예정";
}

export async function getStaffMobileAttendance(now = new Date()) {
  const context = getKstDayContext(now);
  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: {
      attendances: {
        where: { date: context.date },
        take: 1,
        select: {
          checkIn: true,
          checkOut: true,
          outEnd: true,
          outStart: true,
          type: true,
          notes: true,
        },
      },
      grade: true,
      id: true,
      name: true,
      schedules: {
        where: { dayOfWeek: context.dayOfWeek },
        orderBy: { startTime: "asc" },
        take: 1,
        select: { startTime: true, endTime: true },
      },
      // 정기 외출 예정 (요일 기준) — 당일 기록이 없을 때 fallback
      outings: {
        where: { dayOfWeek: context.dayOfWeek },
        orderBy: { outStart: "asc" },
        select: { outStart: true, outEnd: true, reason: true },
      },
      // 당일 외출 (실제/예정 placeholder, 다중)
      dailyOutings: {
        where: { date: context.date },
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          sequence: true,
          outStart: true,
          outEnd: true,
          reason: true,
          isPlaceholder: true,
        },
      },
      seat: true,
    },
  });

  const items = students.map((student) => {
    const attendance = student.attendances[0];
    const schedule = student.schedules[0] ?? null;
    const scheduleStart = schedule?.startTime ?? null;
    const scheduleEnd = schedule?.endTime ?? null;
    const baseStatus = resolveAttendanceStatus(attendance);

    // 외출: 당일 기록 우선, 없으면 정기 예정으로 표시
    const outings =
      student.dailyOutings.length > 0
        ? student.dailyOutings.map((o) => ({
            id: o.id,
            sequence: o.sequence,
            reason: o.reason,
            planned: o.isPlaceholder,
            start: formatKstTime(o.outStart),
            end: formatKstTime(o.outEnd),
            status: resolveOutingStatus(o.outStart, o.outEnd),
          }))
        : student.outings.map((o, index) => ({
            id: null,
            sequence: index + 1,
            reason: o.reason,
            planned: true,
            start: o.outStart,
            end: o.outEnd,
            status: "예정" as MobileOutingStatus,
          }));
    const outingActive = outings.some((o) => o.status === "외출중");

    // 외출 진행 중이면(seq≥2 포함) 상태를 "외출"로 보정
    const status: MobileAttendanceStatus =
      baseStatus === "입실" && outingActive ? "외출" : baseStatus;
    const activeOutingStart =
      outings.find((o) => o.status === "외출중")?.start ?? null;
    const eventTime =
      status === "퇴실"
        ? formatKstTime(attendance?.checkOut ?? null)
        : status === "외출"
          ? activeOutingStart ?? formatKstTime(attendance?.outStart ?? null)
          : formatKstTime(attendance?.checkIn ?? null);
    const isLate = isAttendanceLate(status, scheduleStart, context.nowTime);

    return {
      attendanceType: attendance?.type ?? null,
      // 실제 기록 시각 (HH:MM, KST) — 시트에서 직접 수정용 prefill
      checkIn: formatKstTime(attendance?.checkIn ?? null),
      checkOut: formatKstTime(attendance?.checkOut ?? null),
      outStart: formatKstTime(attendance?.outStart ?? null),
      outEnd: formatKstTime(attendance?.outEnd ?? null),
      grade: student.grade,
      id: student.id,
      isLate,
      name: student.name,
      note: attendance?.notes ?? null,
      outingActive,
      outings,
      scheduleEnd,
      scheduleStart,
      seat: student.seat,
      status,
      time: eventTime,
    };
  });

  return {
    date: context.dateKey,
    items,
    summary: {
      absent: items.filter((item) => item.status === "결석").length,
      away: items.filter((item) => item.status === "외출").length,
      late: items.filter((item) => item.isLate).length,
      outing: items.filter((item) => item.outingActive).length,
      present: items.filter((item) =>
        ["입실", "외출"].includes(item.status),
      ).length,
      total: items.length,
      withNote: items.filter((item) => !!item.note).length,
    },
  };
}

function mentoringOwnerWhere(userId: string, role: Role) {
  return role === "MENTOR" ? { mentorId: userId } : {};
}

export async function getStaffMobileMentoring(
  userId: string,
  role: Role,
  now = new Date(),
) {
  const context = getKstDayContext(now);
  const ownerWhere = mentoringOwnerWhere(userId, role);
  const statuses: MentoringStatus[] = ["SCHEDULED", "RESCHEDULED"];

  const sessions = await prisma.mentoring.findMany({
    where: {
      ...ownerWhere,
      status: { in: statuses },
      scheduledAt: {
        gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: 100,
    select: {
      id: true,
      mentor: { select: { name: true } },
      scheduledAt: true,
      scheduledTimeStart: true,
      status: true,
      student: {
        select: { grade: true, id: true, name: true },
      },
    },
  });

  const items = sessions.map((session) => {
    const scheduledTime = session.scheduledTimeStart
      ? new Date(
          `${session.scheduledAt.toISOString().slice(0, 10)}T${session.scheduledTimeStart}:00+09:00`,
        )
      : session.scheduledAt;
    const needsRecord = scheduledTime < now;

    return {
      grade: session.student.grade,
      id: session.id,
      mentorName: session.mentor.name,
      mode: "대면",
      scheduledAt: scheduledTime.toISOString(),
      status: needsRecord ? "기록 필요" : "예정",
      studentId: session.student.id,
      studentName: session.student.name,
    };
  });

  return {
    items,
    summary: {
      needsRecord: items.filter((item) => item.status === "기록 필요").length,
      today: items.filter((item) => {
        const date = new Date(item.scheduledAt);
        return date >= context.start && date < context.end;
      }).length,
    },
  };
}

export async function getStaffMobileQuestions(now = new Date()) {
  const questions = await prisma.studentQuestion.findMany({
    where: { status: "OPEN" },
    orderBy: [
      { lastMessageAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    take: 100,
    select: {
      createdAt: true,
      id: true,
      lastMessageAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          attachments: true,
          content: true,
          senderType: true,
        },
      },
      student: {
        select: { grade: true, id: true, name: true },
      },
      subject: true,
      title: true,
    },
  });

  const overdueBefore = now.getTime() - 24 * 60 * 60 * 1000;
  const items = questions.map((question) => {
    const lastMessage = question.messages[0] ?? null;
    const attachmentCount = Array.isArray(lastMessage?.attachments)
      ? lastMessage.attachments.length
      : 0;

    return {
      attachmentCount,
      createdAt: question.createdAt.toISOString(),
      grade: question.student.grade,
      id: question.id,
      lastMessage: lastMessage?.content ?? "",
      lastMessageAt: (
        question.lastMessageAt ?? question.createdAt
      ).toISOString(),
      studentId: question.student.id,
      studentName: question.student.name,
      subject: question.subject,
      title: question.title,
    };
  });

  return {
    items,
    summary: {
      open: items.length,
      overdue: items.filter(
        (item) => new Date(item.createdAt).getTime() < overdueBefore,
      ).length,
    },
  };
}

export async function getStaffMobileOverview(
  userId: string,
  role: Role,
  now = new Date(),
) {
  const context = getKstDayContext(now);
  const [attendance, openQuestions, todayMentoring] = await Promise.all([
    getStaffMobileAttendance(now),
    prisma.studentQuestion.count({ where: { status: "OPEN" } }),
    prisma.mentoring.count({
      where: {
        ...mentoringOwnerWhere(userId, role),
        scheduledAt: { gte: context.start, lt: context.end },
        status: { not: "CANCELLED" },
      },
    }),
  ]);

  return {
    date: context.dateKey,
    priorities: {
      lateStudents: attendance.summary.late,
      openQuestions,
    },
    stats: {
      currentAttendance: attendance.summary.present,
      openQuestions,
      todayMentoring,
    },
  };
}

// 운영진용 학생 상세 — 기본정보 + 과제 + 성적 (입퇴실 시트 탭)
export async function getStaffMobileStudentDetail(studentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      grade: true,
      school: true,
      classGroup: true,
      seat: true,
      phone: true,
      parentPhone: true,
      parentEmail: true,
      startDate: true,
      targetUniversity: true,
      admissionType: true,
      internalScoreRange: true,
      mockScoreRange: true,
      selectedSubjects: true,
      onlineLectures: true,
      mentoringNotes: true,
      studentInfo: true,
      changeNote: true,
      assignments: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          title: true,
          subject: true,
          dueDate: true,
          isCompleted: true,
          completedAt: true,
          description: true,
        },
      },
      examScores: {
        orderBy: { examDate: "desc" },
        take: 50,
        select: {
          id: true,
          examType: true,
          examName: true,
          examDate: true,
          subject: true,
          rawScore: true,
          grade: true,
          percentile: true,
        },
      },
    },
  });
  if (!student) throw new MobileApiError("학생을 찾을 수 없습니다", 404);

  const dateStr = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  return {
    info: {
      id: student.id,
      name: student.name,
      grade: student.grade,
      school: student.school,
      classGroup: student.classGroup,
      seat: student.seat,
      phone: student.phone,
      parentPhone: student.parentPhone,
      parentEmail: student.parentEmail,
      startDate: dateStr(student.startDate),
      targetUniversity: student.targetUniversity,
      admissionType: student.admissionType,
      internalScoreRange: student.internalScoreRange,
      mockScoreRange: student.mockScoreRange,
      selectedSubjects: student.selectedSubjects,
      onlineLectures: student.onlineLectures,
      mentoringNotes: student.mentoringNotes,
      studentInfo: student.studentInfo,
      changeNote: student.changeNote,
    },
    assignments: student.assignments.map((a) => ({
      id: a.id,
      title: a.title,
      subject: a.subject,
      dueDate: dateStr(a.dueDate),
      isCompleted: a.isCompleted,
      completedAt: dateStr(a.completedAt),
      description: a.description,
    })),
    scores: student.examScores.map((s) => ({
      id: s.id,
      examType: s.examType,
      examName: s.examName,
      examDate: dateStr(s.examDate),
      subject: s.subject,
      rawScore: s.rawScore,
      grade: s.grade,
      percentile: s.percentile,
    })),
  };
}
