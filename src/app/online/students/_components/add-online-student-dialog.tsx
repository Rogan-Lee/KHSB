"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AddOnlineStudentTabs } from "@/components/online/add-online-student-tabs";

type StudentOption = { id: string; name: string; grade: string };
type UserOption = { id: string; name: string };

/** 온라인 학생 추가 — 신규 등록 / 오프라인 학생 전환을 다이얼로그로 */
export function AddOnlineStudentDialog({
  offlineStudents,
  mentors,
  consultants,
}: {
  offlineStudents: StudentOption[];
  mentors: UserOption[];
  consultants: UserOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          학생 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>온라인 학생 추가</DialogTitle>
          <DialogDescription>새 학생을 등록하거나, 재원 중인 오프라인 학생을 온라인 관리로 전환해요</DialogDescription>
        </DialogHeader>
        <AddOnlineStudentTabs offlineStudents={offlineStudents} mentors={mentors} consultants={consultants} />
      </DialogContent>
    </Dialog>
  );
}
