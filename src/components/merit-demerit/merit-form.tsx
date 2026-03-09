"use client";

import { useTransition } from "react";
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

interface Props {
  students: { id: string; name: string; grade: string }[];
}

export function MeritForm({ students }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await createMeritDemerit(formData);
        toast.success("상벌점이 부여되었습니다");
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  return (
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
  );
}
