"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CountBadge, PageHeader } from "@/components/backoffice/ui";
import { HandoverDashboard } from "@/components/dashboard/handover-dashboard";

type HandoverTask = {
  id: string;
  title: string;
  assigneeId: string | null;
  isCompleted: boolean;
  completedAt: Date | null;
};

// 목록은 루틴 개수·체크 수만 (맨 앞 인수인계 체크리스트는 latestChecklist)
type HandoverChecklist = { isChecked: boolean };

type RoutineItem = {
  id: string;
  templateId: string | null;
  title: string;
  shiftType: string;
  isChecked: boolean;
  order: number;
};

type Handover = {
  id: string;
  date: Date;
  content: string;
  priority: "URGENT" | "NORMAL";
  category: string | null;
  isPinned: boolean;
  authorId: string;
  authorName: string;
  reads: { userId: string; userName: string; readAt: Date; confirmedAt: Date | null }[];
  tasks: HandoverTask[];
  checklist: HandoverChecklist[];
  createdAt: Date;
};

type ChecklistTemplate = { id: string; title: string; shiftType: string; order: number; isActive: boolean };
type MonthlyNote = { id: string; studentName: string; content: string; authorName: string; createdAt: Date };
type Student = { id: string; name: string; grade: string };
type Staff = { id: string; name: string; role: string };
export type Todo = { id: string; title: string; content: string | null; dueDate: Date | null; priority: string; isCompleted: boolean; completedAt: Date | null; authorId: string; authorName: string; assigneeId: string | null; assigneeName: string | null; category: string | null; createdAt: Date };

interface Props {
  children: React.ReactNode;
  handovers: Handover[];
  latestChecklist: RoutineItem[];
  templates: ChecklistTemplate[];
  monthlyNotes: MonthlyNote[];
  students: Student[];
  staffList: Staff[];
  currentUserId: string;
  currentUserName: string;
  userName: string;
  year: number;
  month: number;
  unreadCount: number;
  /** 미완료 할 일만 */
  todos: Todo[];
  /** 완료된 할 일 개수 */
  completedTodoCount: number;
  /** 서버(KST)에서 만든 오늘 날짜 라벨 — 없으면 브라우저 시각(KST)으로 만든다 */
  dateLabel?: string;
}

type Mode = "dashboard" | "handover";

export function DashboardWrapper({
  children,
  handovers,
  latestChecklist,
  templates,
  monthlyNotes,
  students,
  staffList,
  currentUserId,
  currentUserName,
  userName,
  year,
  month,
  unreadCount,
  todos,
  completedTodoCount,
  dateLabel,
}: Props) {
  const [mode, setMode] = useState<Mode>("dashboard");

  const today =
    dateLabel ??
    new Date().toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
      timeZone: "Asia/Seoul",
    });

  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
      <PageHeader
        title={`안녕하세요, ${userName}님`}
        description={today}
        actions={
          <TabsList variant="segment" aria-label="홈 화면 보기 전환">
            <TabsTrigger value="dashboard">대시보드</TabsTrigger>
            <TabsTrigger value="handover">
              인수인계
              <CountBadge count={unreadCount} />
            </TabsTrigger>
          </TabsList>
        }
      />

      <TabsContent value="dashboard" className="mt-0">
        {children}
      </TabsContent>
      <TabsContent value="handover" className="mt-0">
        <HandoverDashboard
          handovers={handovers}
          latestChecklist={latestChecklist}
          templates={templates}
          monthlyNotes={monthlyNotes}
          students={students}
          staffList={staffList}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          year={year}
          month={month}
          todos={todos}
          completedTodoCount={completedTodoCount}
        />
      </TabsContent>
    </Tabs>
  );
}
