"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { generateMonthlyReport } from "@/actions/reports";
import { sendBulkMessages } from "@/actions/messages";
import { toast } from "sonner";
import { FileText, Send } from "lucide-react";

interface Student {
  id: string;
  name: string;
  grade: string;
}

interface Props {
  students: Student[];
  year: number;
  month: number;
}

export function ReportGeneratorPanel({ students, year, month }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function toggleAll() {
    setSelectedIds(
      selectedIds.length === students.length ? [] : students.map((s) => s.id)
    );
  }

  function toggleStudent(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  function handleGenerate() {
    if (selectedIds.length === 0) {
      toast.error("원생을 선택하세요");
      return;
    }
    startTransition(async () => {
      try {
        await Promise.all(
          selectedIds.map((id) => generateMonthlyReport(id, year, month))
        );
        toast.success(`${selectedIds.length}명의 리포트가 생성되었습니다`);
      } catch {
        toast.error("리포트 생성에 실패했습니다");
      }
    });
  }

  function handleSend() {
    if (selectedIds.length === 0) {
      toast.error("원생을 선택하세요");
      return;
    }
    startTransition(async () => {
      try {
        const content = `[독서실] {name} 학생의 ${year}년 ${month}월 생활 리포트입니다. 담당 멘토에게 문의하세요.`;
        const result = await sendBulkMessages(
          selectedIds,
          "MONTHLY_REPORT",
          content
        );
        toast.success(`${result.sent}명에게 리포트가 발송되었습니다`);
      } catch {
        toast.error("발송에 실패했습니다");
      }
    });
  }

  return (
    <div className="flex flex-col gap-x4">
      <p className="t4-regular text-fg-neutral-muted">
        선택한 원생의 {year}년 {month}월 출결·상벌점·멘토링 통계를 모아요.
      </p>

      <div className="flex flex-col gap-x2">
        <div className="flex items-center justify-between">
          <Label>원생 선택</Label>
          <Button type="button" variant="link" onClick={toggleAll}>
            {selectedIds.length === students.length ? "전체 해제" : "전체 선택"}
          </Button>
        </div>
        <div className="max-h-64 divide-y divide-stroke-neutral-muted overflow-y-auto rounded-r3 border border-stroke-neutral-muted">
          {students.map((s) => (
            <label
              key={s.id}
              className="flex cursor-pointer items-center gap-x3 px-x4 py-x2_5 transition-colors hover:bg-bg-layer-default-pressed"
            >
              <Checkbox
                checked={selectedIds.includes(s.id)}
                onCheckedChange={() => toggleStudent(s.id)}
              />
              <span className="t4-medium text-fg-neutral">{s.name}</span>
              <span className="t3-regular text-fg-neutral-subtle">{s.grade}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-x2">
        <Button
          onClick={handleGenerate}
          disabled={isPending || selectedIds.length === 0}
          variant="outline"
          className="flex-1"
        >
          <FileText />
          {isPending ? "생성 중…" : "리포트 생성"}
        </Button>
        <Button
          onClick={handleSend}
          disabled={isPending || selectedIds.length === 0}
          className="flex-1"
        >
          <Send />
          {isPending ? "발송 중…" : "카카오 발송"}
        </Button>
      </div>
    </div>
  );
}
