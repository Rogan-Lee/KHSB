import { useCallback, useEffect, useState } from 'react';

import { authenticatedFetch } from '@/lib/session';

export type StudentOverviewResponse = {
  isOnlineManaged: boolean;
  nextSession: {
    durationMinutes: number;
    hostName: string;
    id: string;
    meetUrl: string | null;
    scheduledAt: string;
    title: string;
  } | null;
  nextTask: {
    dueDate: string;
    id: string;
    status: string;
    statusLabel: string;
    subject: string;
    title: string;
  } | null;
  stats: {
    doneTasks: number;
    openQuestions: number;
    openTasks: number;
    totalTasks: number;
    unreadFeedbacks: number;
    unreadQuestions: number;
  };
};

export type StudentQuestionsResponse = {
  questions: {
    hasAttachments: boolean;
    hasUnreadAnswer: boolean;
    id: string;
    lastMessage: string;
    lastMessageAt: string;
    lastSenderType: 'STUDENT' | 'STAFF' | null;
    status: 'OPEN' | 'ANSWERED' | 'RESOLVED' | 'ARCHIVED';
    subject: string | null;
    title: string;
  }[];
};

export type QuestionThreadResponse = {
  messages: {
    attachments: unknown[];
    content: string;
    createdAt: string;
    id: string;
    senderName: string;
    senderType: 'STUDENT' | 'STAFF';
  }[];
  question: {
    claimedBy?: { id: string; name: string } | null;
    createdAt: string;
    id: string;
    status: 'OPEN' | 'ANSWERED' | 'RESOLVED' | 'ARCHIVED';
    student?: {
      grade: string;
      id: string;
      name: string;
      school: string | null;
    };
    subject: string | null;
    title: string;
  };
};

export type StaffOverviewResponse = {
  date: string;
  priorities: {
    lateStudents: number;
    openQuestions: number;
  };
  stats: {
    currentAttendance: number;
    openQuestions: number;
    todayMentoring: number;
  };
};

export type StaffAttendanceResponse = {
  date: string;
  items: {
    attendanceType: string | null;
    grade: string;
    id: string;
    isLate: boolean;
    name: string;
    scheduleStart: string | null;
    seat: string | null;
    status: '입실' | '외출' | '퇴실' | '미입실' | '결석';
    time: string | null;
  }[];
  summary: {
    absent: number;
    away: number;
    late: number;
    present: number;
    total: number;
  };
};

export type StaffMentoringResponse = {
  items: {
    grade: string;
    id: string;
    mentorName: string;
    mode: string;
    scheduledAt: string;
    status: '예정' | '기록 필요';
    studentId: string;
    studentName: string;
  }[];
  summary: {
    needsRecord: number;
    today: number;
  };
};

export type MentoringRecordResponse = {
  content: string | null;
  id: string;
  improvements: string | null;
  nextGoals: string | null;
  notes: string | null;
  scheduledAt: string;
  scheduledTimeStart: string | null;
  status: string;
  student: {
    grade: string;
    id: string;
    mentoringNotes: string | null;
    name: string;
    school: string | null;
  };
  weaknesses: string | null;
};

export type StaffQuestionsResponse = {
  items: {
    attachmentCount: number;
    createdAt: string;
    grade: string;
    id: string;
    lastMessage: string;
    lastMessageAt: string;
    studentId: string;
    studentName: string;
    subject: string | null;
    title: string;
  }[];
  summary: {
    open: number;
    overdue: number;
  };
};

export class MobileApiError extends Error {}

export async function requestMobileApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await authenticatedFetch(path, {
    cache: 'no-store',
    ...init,
  });
  const body = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new MobileApiError(body?.error ?? '데이터를 불러오지 못했습니다.');
  }

  return body as T;
}

export function mutateMobileApi<T>(
  path: string,
  method: 'PATCH' | 'POST',
  body: unknown,
) {
  return requestMobileApi<T>(path, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  });
}

export function useMobileQuery<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const nextData = await requestMobileApi<T>(path);
        setData(nextData);
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : '데이터를 불러오지 못했습니다.',
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [path],
  );

  useEffect(() => {
    let active = true;

    void requestMobileApi<T>(path)
      .then((nextData) => {
        if (active) setData(nextData);
      })
      .catch((nextError) => {
        if (!active) return;
        setError(
          nextError instanceof Error ? nextError.message : '데이터를 불러오지 못했습니다.',
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [path]);

  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

  return {
    data,
    error,
    isLoading,
    isRefreshing,
    refresh,
    retry: load,
  };
}
