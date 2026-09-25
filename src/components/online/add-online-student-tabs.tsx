"use client";

import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <div className="flex flex-col gap-x5">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "new" | "enable")}>
        <TabsList variant="segment" className="w-full sm:w-auto">
          <TabsTrigger value="new" className="flex-1 sm:flex-none">
            <UserPlus />
            신규 등록
          </TabsTrigger>
          <TabsTrigger
            value="enable"
            className="flex-1 sm:flex-none"
            disabled={offlineStudents.length === 0}
            title={
              offlineStudents.length === 0
                ? "전환 가능한 오프라인 학생이 없습니다"
                : undefined
            }
          >
            <Users />
            오프라인 학생 전환
          </TabsTrigger>
        </TabsList>
      </Tabs>

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
