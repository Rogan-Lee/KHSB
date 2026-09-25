"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GraduationCap, CheckCircle2 } from "lucide-react";
import { submitExamApplication, cancelExamApplication } from "@/actions/exam-application";
import type { ExamApplicationSession } from "@/lib/exam-application-data";
import { Badge, Button, EmptyState, Notice, Section } from "@/components/portal/ui";
import { BottomSheet } from "@/components/portal/bottom-sheet";
import { TextField, TextFieldTextarea } from "seed-design/ui/text-field";

function dateLabel(ymd: string): string {
  return new Date(ymd + "T00:00:00+09:00").toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export function ExamApplicationForm({
  token,
  sessions,
}: {
  token: string;
  sessions: ExamApplicationSession[];
}) {
  return (
    <div className="flex flex-col gap-x3">
      <p className="px-x1 pb-x1 pt-x3 t5-regular text-fg-neutral-muted">
        응시할 모의고사를 골라 신청해 주세요. 운영진이 확인한 뒤 최종 확정돼요.
      </p>

      {sessions.length === 0 ? (
        <Section>
          <EmptyState
            icon={GraduationCap}
            title="접수 중인 모의고사가 없어요"
            description="신청이 열리면 여기에서 바로 신청할 수 있어요."
            className="py-x8"
          />
        </Section>
      ) : (
        sessions.map((s) => <SessionCard key={s.sessionId} token={token} session={s} />)
      )}
    </div>
  );
}

function SessionCard({ token, session }: { token: string; session: ExamApplicationSession }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [memo, setMemo] = useState(session.myMemo);
  const [cancelOpen, setCancelOpen] = useState(false);
  const applied = session.myStatus === "PENDING" || session.myStatus === "CONFIRMED";
  const confirmed = session.myStatus === "CONFIRMED";

  function apply() {
    startTransition(async () => {
      try {
        await submitExamApplication(token, session.sessionId, memo);
        toast.success("신청이 접수되었어요");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "신청에 실패했어요");
      }
    });
  }
  function cancel() {
    startTransition(async () => {
      try {
        await cancelExamApplication(token, session.sessionId);
        toast.success("신청을 취소했어요");
        setCancelOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "취소에 실패했어요");
      }
    });
  }

  return (
    <Section>
      <div className="flex items-start justify-between gap-x3">
        <div className="min-w-0">
          <h2 className="t6-bold text-fg-neutral">{session.title}</h2>
          <p className="mt-x1 t4-regular text-fg-neutral-subtle">
            {dateLabel(session.examDate)} · {session.examTypeLabel}
          </p>
        </div>
        {/* SEED Badge 는 텍스트 전용 — 아이콘 없이 톤으로 상태 구분 */}
        {confirmed ? (
          <Badge tone="ok" size="md">
            확정
          </Badge>
        ) : applied ? (
          <Badge tone="warn" size="md">
            신청 접수됨
          </Badge>
        ) : null}
      </div>

      {session.subjects.length > 0 && (
        <div className="mt-x3 flex flex-wrap gap-x1">
          {session.subjects.map((subject, i) => (
            <Badge key={`${i}-${subject}`} tone="gray">
              {subject}
            </Badge>
          ))}
        </div>
      )}
      {session.notes && (
        <p className="mt-x3 whitespace-pre-wrap t4-regular text-fg-neutral-muted">
          {session.notes}
        </p>
      )}

      {confirmed ? (
        <Notice tone="ok" icon={CheckCircle2} className="mt-x4">
          응시가 확정됐어요. 변경이 필요하면 운영진에게 문의해 주세요.
        </Notice>
      ) : (
        <>
          {!applied && (
            <div className="mt-x4">
              <TextField
                label="요청사항"
                indicator="선택"
                value={memo}
                onValueChange={({ slicedValue }) => setMemo(slicedValue)}
                maxGraphemeCount={300}
              >
                <TextFieldTextarea maxLength={300} />
              </TextField>
            </div>
          )}
          <div className="mt-x3">
            {applied ? (
              <Button
                variant="gray"
                size="lg"
                block
                loading={busy}
                onClick={() => setCancelOpen(true)}
              >
                신청 취소
              </Button>
            ) : (
              <Button variant="primary" size="lg" block loading={busy} onClick={apply}>
                신청하기
              </Button>
            )}
          </div>
        </>
      )}

      <BottomSheet
        open={cancelOpen}
        onOpenChange={(o) => {
          if (!busy) setCancelOpen(o);
        }}
        title="신청을 취소할까요?"
        description={`‘${session.title}’ 신청이 취소돼요.`}
        footer={
          <>
            <Button
              variant="gray"
              size="xl"
              className="flex-1"
              disabled={busy}
              onClick={() => setCancelOpen(false)}
            >
              닫기
            </Button>
            <Button variant="primary" size="xl" className="flex-1" loading={busy} onClick={cancel}>
              신청 취소
            </Button>
          </>
        }
      />
    </Section>
  );
}
