"use client";

import { useState } from "react";
import { LayoutDashboard, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { HandoverDashboard } from "@/components/dashboard/handover-dashboard";

type HandoverTask = {
  id: string;
  title: string;
  content: string;
  assigneeId: string | null;
  assigneeName: string | null;
  order: number;
  isCompleted: boolean;
  completedAt: Date | null;
};

type HandoverChecklist = {
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
  recipientId: string | null;
  recipientName: string | null;
  reads: { userId: string; userName: string; readAt: Date }[];
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
  todos: Todo[];
}

export function DashboardWrapper({
  children,
  handovers,
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
}: Props) {
  const [mode, setMode] = useState<"dashboard" | "handover">("dashboard");

  return (
    <div className="space-y-4">
      {/* Header with toggle */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">안녕하세요, {userName}님</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date().toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl shrink-0">
          <button
            onClick={() => setMode("dashboard")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              mode === "dashboard" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            대시보드
          </button>
          <button
            onClick={() => setMode("handover")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all relative",
              mode === "handover" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            인수인계
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      {mode === "dashboard" ? (
        children
      ) : (
        <HandoverDashboard
          handovers={handovers}
          templates={templates}
          monthlyNotes={monthlyNotes}
          students={students}
          staffList={staffList}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          year={year}
          month={month}
          todos={todos}
        />
      )}
    </div>
  );
}
