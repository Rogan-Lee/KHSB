"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sendBroadcastPush } from "@/actions/staff-messages";

const AUDIENCE_LABEL = {
  ALL: "전체 (학생 + 직원 + 학부모)",
  STUDENTS: "학생만",
  STAFF: "직원만",
  PARENTS: "학부모만",
} as const;

type Audience = keyof typeof AUDIENCE_LABEL;

export function BroadcastPushPanel() {
  const [audience, setAudience] = useState<Audience>("ALL");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSend = () => {
    startTransition(async () => {
      try {
        const result = await sendBroadcastPush({ audience, title, body });
        setConfirmOpen(false);
        setTitle("");
        setBody("");
        toast.success(
          `발송 완료 — 대상 ${result.targets}명, 푸시 ${result.sent}건 전송`
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "발송 실패");
      }
    });
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">발송 대상</label>
        <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((key) => (
              <SelectItem key={key} value={key}>
                {AUDIENCE_LABEL[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">제목</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="알림 제목"
          maxLength={100}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">내용</label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="알림 내용"
          rows={5}
          maxLength={1000}
        />
      </div>

      <Button
        className="w-full"
        disabled={!title.trim() || !body.trim()}
        onClick={() => setConfirmOpen(true)}
      >
        발송하기
      </Button>
      <p className="text-xs text-muted-foreground">
        모바일 앱 푸시 알림을 등록한 기기에만 발송됩니다. 발송 이력은 저장되지 않습니다.
      </p>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>단체 알림 발송</DialogTitle>
            <DialogDescription>
              {AUDIENCE_LABEL[audience]} 대상으로 아래 알림을 발송합니다. 발송 후
              취소할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-semibold">{title}</p>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{body}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isPending}>
              취소
            </Button>
            <Button onClick={handleSend} disabled={isPending}>
              {isPending ? "발송 중..." : "발송"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
