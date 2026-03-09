"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sendBulkMessages } from "@/actions/messages";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";

interface Student {
  id: string;
  name: string;
  grade: string;
  parentPhone: string;
}

interface Props {
  students: Student[];
}

const MESSAGE_TEMPLATES: Record<string, string> = {
  ATTENDANCE: "[독서실] {name} 학생이 정상 출석하였습니다.",
  ABSENT: "[독서실] {name} 학생이 오늘 결석하였습니다. 확인 부탁드립니다.",
  MENTORING: "[독서실] {name} 학생의 이번 달 멘토링이 완료되었습니다.",
  MONTHLY_REPORT: "[독서실] {name} 학생의 이번 달 생활 리포트가 발송되었습니다.",
  CUSTOM: "",
};

export function MessageSendPanel({ students }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [messageType, setMessageType] = useState("CUSTOM");
  const [content, setContent] = useState("");
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

  function handleTypeChange(type: string) {
    setMessageType(type);
    if (type !== "CUSTOM") {
      setContent(MESSAGE_TEMPLATES[type] || "");
    }
  }

  function handleSend() {
    if (selectedIds.length === 0) {
      toast.error("수신자를 선택하세요");
      return;
    }
    if (!content.trim()) {
      toast.error("메시지 내용을 입력하세요");
      return;
    }

    startTransition(async () => {
      try {
        const result = await sendBulkMessages(
          selectedIds,
          messageType as "CUSTOM",
          content
        );
        toast.success(`${result.sent}명에게 메시지가 발송되었습니다`);
        setSelectedIds([]);
        setContent("");
      } catch {
        toast.error("발송에 실패했습니다");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>메시지 유형</Label>
        <Select value={messageType} onValueChange={handleTypeChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CUSTOM">개별 메시지</SelectItem>
            <SelectItem value="ATTENDANCE">출석 알림</SelectItem>
            <SelectItem value="ABSENT">결석 알림</SelectItem>
            <SelectItem value="MENTORING">멘토링 알림</SelectItem>
            <SelectItem value="MONTHLY_REPORT">월간 리포트</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>내용 <span className="text-xs text-muted-foreground">({"{"}name{"}"} → 학생 이름 자동치환)</span></Label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="메시지 내용을 입력하세요..."
          rows={4}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>수신자 선택</Label>
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs text-primary hover:underline"
          >
            {selectedIds.length === students.length ? "전체 해제" : "전체 선택"}
          </button>
        </div>
        <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
          {students.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-3 px-3 py-2 hover:bg-accent cursor-pointer"
            >
              <Checkbox
                checked={selectedIds.includes(s.id)}
                onCheckedChange={() => toggleStudent(s.id)}
              />
              <span className="text-sm font-medium">{s.name}</span>
              <span className="text-xs text-muted-foreground">{s.grade}</span>
              <span className="text-xs text-muted-foreground ml-auto">{s.parentPhone}</span>
            </label>
          ))}
        </div>
      </div>

      <Button
        onClick={handleSend}
        disabled={isPending || selectedIds.length === 0}
        className="w-full"
      >
        <MessageCircle className="h-4 w-4 mr-2" />
        {isPending ? "발송 중..." : `${selectedIds.length}명에게 발송`}
      </Button>
    </div>
  );
}
