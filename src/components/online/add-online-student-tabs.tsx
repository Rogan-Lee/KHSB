"use client";

import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EnableOnlineStudentForm,
} from "@/components/online/enable-online-student-form";
import { NewOnlineStudentForm } from "@/components/online/new-online-student-form";

type StudentOption = { id: string; name: string; grade: string };
type UserOption = { id: string; name: string };

export function AddOnlineStudentTabs({
  offlineStudents,
  mentors,
  consultants,
}: {
  offlineStudents: StudentOption[];
  mentors: UserOption[];
  consultants: UserOption[];
}) {
  const [tab, setTab] = useState<"new" | "enable">("new");

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setTab("new")}
          className={cn(
            "px-3 py-1 rounded font-medium transition-colors inline-flex items-center gap-1",
            tab === "new"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground"
          )}
        >
          <UserPlus className="h-3 w-3" />
          온라인 학생 신규 등록
        </button>
        <button
          type="button"
          onClick={() => setTab("enable")}
          disabled={offlineStudents.length === 0}
          className={cn(
            "px-3 py-1 rounded font-medium transition-colors inline-flex items-center gap-1",
            tab === "enable"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground",
            offlineStudents.length === 0 && "opacity-50 cursor-not-allowed"
          )}
          title={
            offlineStudents.length === 0
              ? "전환 가능한 오프라인 학생이 없습니다"
              : undefined
          }
        >
          <Users className="h-3 w-3" />
          기존 오프라인 학생 전환
        </button>
      </div>

      {tab === "new" ? (
        <NewOnlineStudentForm mentors={mentors} consultants={consultants} />
      ) : (
        <EnableOnlineStudentForm
          offlineStudents={offlineStudents}
          mentors={mentors}
          consultants={consultants}
        />
      )}
    </div>
  );
}
