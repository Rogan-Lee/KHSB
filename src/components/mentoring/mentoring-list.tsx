"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STATUS_MAP = {
  SCHEDULED: { label: "예정", variant: "secondary" as const },
  COMPLETED: { label: "완료", variant: "default" as const },
  CANCELLED: { label: "취소", variant: "destructive" as const },
  RESCHEDULED: { label: "일정변경", variant: "outline" as const },
};

type Mentoring = {
  id: string;
  scheduledAt: Date;
  scheduledTimeStart: string | null;
  scheduledTimeEnd: string | null;
  status: keyof typeof STATUS_MAP;
  notes: string | null;
  student: { id: string; name: string; grade: string };
  mentor: { id: string; name: string };
};

type Mentor = { id: string; name: string };

type Props = {
  mentorings: Mentoring[];
  mentors: Mentor[];
  isDirector: boolean;
};

export function MentoringList({ mentorings, mentors, isDirector }: Props) {
  const [selectedMentorId, setSelectedMentorId] = useState<string>("all");

  const filtered = selectedMentorId === "all"
    ? mentorings
    : mentorings.filter((m) => m.mentor.id === selectedMentorId);

  return (
    <div className="space-y-3">
      {isDirector && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">담당 멘토</span>
          <Select value={selectedMentorId} onValueChange={setSelectedMentorId}>
            <SelectTrigger className="w-40 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {mentors.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedMentorId !== "all" && (
            <span className="text-xs text-muted-foreground">{filtered.length}건</span>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">예정일</TableHead>
              <TableHead className="whitespace-nowrap">원생</TableHead>
              {isDirector && <TableHead className="whitespace-nowrap">멘토</TableHead>}
              <TableHead className="whitespace-nowrap">시간</TableHead>
              <TableHead className="whitespace-nowrap">상태</TableHead>
              <TableHead>메모</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  멘토링 기록이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(m.scheduledAt)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="font-medium">{m.student.name}</span>
                    <span className="text-xs text-muted-foreground ml-1">{m.student.grade}</span>
                  </TableCell>
                  {isDirector && <TableCell className="whitespace-nowrap">{m.mentor.name}</TableCell>}
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {m.scheduledTimeStart && m.scheduledTimeEnd
                      ? `${m.scheduledTimeStart}~${m.scheduledTimeEnd}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_MAP[m.status].variant}>
                      {STATUS_MAP[m.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground line-clamp-1 max-w-48">
                    {m.notes || "—"}
                  </TableCell>
                  <TableCell>
                    <Link href={`/mentoring/${m.id}`}>
                      <Button variant="ghost" size="sm">기록 작성</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
