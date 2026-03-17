"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createMeritDemerit } from "@/actions/merit-demerit";
import { MERIT_CATEGORIES } from "@/lib/utils";
import { toast } from "sonner";
import { MessageCircle, Check } from "lucide-react";

interface Props {
  students: { id: string; name: string; grade: string }[];
}

interface LastRecord {
  studentName: string;
  type: "MERIT" | "DEMERIT";
  points: number;
  reason: string;
}

export function MeritForm({ students }: Props) {
  const [isPending, startTransition] = useTransition();
  const [lastRecord, setLastRecord] = useState<LastRecord | null>(null);

  function handleSubmit(formData: FormData) {
    const studentId = formData.get("studentId") as string;
    const type = formData.get("type") as "MERIT" | "DEMERIT";
    const points = Number(formData.get("points"));
    const reason = formData.get("reason") as string;
    const student = students.find((s) => s.id === studentId);

    startTransition(async () => {
      try {
        await createMeritDemerit(formData);
        toast.success("상벌점이 부여되었습니다");
        if (student) {
          setLastRecord({ studentName: student.name, type, points, reason });
        }
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  async function handleShare() {
    if (!lastRecord) return;
    const typeLabel = lastRecord.type === "MERIT" ? "상점" : "벌점";
    const text = `[강한선배 관리형 독서실] ${lastRecord.studentName} 학생이 ${typeLabel} ${lastRecord.points}점을 받았습니다.\n사유: ${lastRecord.reason}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${lastRecord.studentName} ${typeLabel} 알림`, text });
      } catch {
        // 사용자 취소
      }
    } else {
      await navigator.clipboard.writeText(text);
      toast.success("메시지가 복사되었습니다. 카카오톡에 붙여넣기 하세요.");
    }
  }

  return (
    <div className="space-y-4">
      <form action={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>원생</Label>
          <Select name="studentId" required>
            <SelectTrigger>
              <SelectValue placeholder="원생 선택" />
            </SelectTrigger>
            <SelectContent>
              {students.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.grade})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>구분</Label>
            <Select name="type" defaultValue="MERIT">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MERIT">상점</SelectItem>
                <SelectItem value="DEMERIT">벌점</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="points">점수</Label>
            <Input id="points" name="points" type="number" min={1} max={100} defaultValue={1} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>카테고리</Label>
          <Select name="category">
            <SelectTrigger>
              <SelectValue placeholder="카테고리 선택" />
            </SelectTrigger>
            <SelectContent>
              {MERIT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="date">날짜</Label>
          <Input
            id="date"
            name="date"
            type="date"
            defaultValue={new Date().toISOString().split("T")[0]}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reason">사유 *</Label>
          <Textarea id="reason" name="reason" required placeholder="사유를 입력하세요" rows={2} />
        </div>

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "저장 중..." : "부여하기"}
        </Button>
      </form>

      {lastRecord && (
        <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
            <Check className="h-3.5 w-3.5" />
            {lastRecord.studentName} 학생 {lastRecord.type === "MERIT" ? "상점" : "벌점"} {lastRecord.points}점 부여 완료
          </div>
          <Button
            size="sm"
            className="w-full gap-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold"
            onClick={handleShare}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            카카오톡으로 학부모에게 알리기
          </Button>
        </div>
      )}
    </div>
  );
}
