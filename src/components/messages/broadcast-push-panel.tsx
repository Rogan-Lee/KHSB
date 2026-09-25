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
import { FormActions, FormField, Section, Segmented } from "@/components/backoffice/ui";
import { Send } from "lucide-react";
import { sendBroadcastPush } from "@/actions/staff-messages";

const AUDIENCE_LABEL = {
  ALL: "전체 (학생 + 직원 + 학부모)",
  STUDENTS: "학생만",
  STAFF: "직원만",
  PARENTS: "학부모만",
} as const;

type Audience = keyof typeof AUDIENCE_LABEL;

// 세그먼트 버튼용 짧은 이름 (전체 설명은 아래 도움말로)
const AUDIENCE_SHORT: Record<Audience, string> = {
  ALL: "전체",
  STUDENTS: "학생",
  STAFF: "직원",
};

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
    <Section
      title="단체 알림"
      description="모바일 앱 푸시 알림을 등록한 기기에만 발송돼요. 발송 이력은 저장되지 않아요."
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-x5">
        <FormField label="발송 대상" hint={AUDIENCE_LABEL[audience]}>
          <Segmented
            aria-label="발송 대상"
            value={audience}
            onChange={setAudience}
            options={(Object.keys(AUDIENCE_LABEL) as Audience[]).map((key) => ({
              value: key,
              label: AUDIENCE_SHORT[key],
            }))}
          />
        </FormField>

        <FormField
          label="제목"
          htmlFor="broadcast-title"
          required
          hint={<span className="tabular-nums">{title.length}/100</span>}
        >
          <Input
            id="broadcast-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="알림 제목"
            maxLength={100}
          />
        </FormField>

        <FormField
          label="내용"
          htmlFor="broadcast-body"
          required
          hint={<span className="tabular-nums">{body.length}/1000</span>}
        >
          <Textarea
            id="broadcast-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="알림 내용"
            rows={5}
            maxLength={1000}
          />
        </FormField>

        <FormActions>
          <Button
            className="w-full sm:w-auto"
            disabled={!title.trim() || !body.trim()}
            onClick={() => setConfirmOpen(true)}
          >
            <Send />
            발송하기
          </Button>
        </FormActions>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>단체 알림 발송</DialogTitle>
            <DialogDescription>
              {AUDIENCE_LABEL[audience]} 대상으로 아래 알림을 발송합니다. 발송 후
              취소할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-r3 bg-bg-layer-fill p-x4">
            <p className="t4-bold text-fg-neutral">{title}</p>
            <p className="mt-x1 whitespace-pre-wrap t4-regular text-fg-neutral-muted">{body}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isPending}>
              취소
            </Button>
            <Button onClick={handleSend} disabled={isPending}>
              {isPending ? "발송 중…" : "발송"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
