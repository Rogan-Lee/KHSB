"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Loader2, FileText, MessagesSquare } from "lucide-react";
import { IconPaperplaneFill } from "@karrotmarket/react-monochrome-icon";
import { PrefixIcon } from "@seed-design/react";
import { TextField, TextFieldTextarea } from "seed-design/ui/text-field";
import type { QuestionAttachment } from "@/actions/student-questions";
import { Avatar, Button } from "@/components/portal/ui";
import { Button as StaffButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";
import { PhotoUploader } from "./photo-uploader";

export type ThreadMessage = {
  id: string;
  senderType: "STUDENT" | "STAFF";
  senderName: string;
  content: string;
  attachments: QuestionAttachment[];
  createdAt: string;
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ─── default variant (직원 화면) 전용 ───────────────────────────────────

function AttachmentGrid({ attachments, mine }: { attachments: QuestionAttachment[]; mine: boolean }) {
  if (attachments.length === 0) return null;
  return (
    <div
      className={cn(
        "grid w-full max-w-[360px] gap-x1_5",
        attachments.length > 1 ? "grid-cols-2" : "grid-cols-1",
      )}
    >
      {attachments.map((a, i) =>
        a.mimeType.startsWith("video/") ? (
          <video
            key={`${a.url}-${i}`}
            controls
            preload="metadata"
            className="col-span-full max-w-full rounded-r3 bg-bg-neutral-weak"
            src={a.url}
          />
        ) : a.mimeType.startsWith("image/") ? (
          <a
            key={`${a.url}-${i}`}
            href={a.url}
            target="_blank"
            rel="noopener"
            className="block overflow-hidden rounded-r3 border border-stroke-neutral-muted bg-bg-neutral-weak transition-opacity hover:opacity-90"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt={a.name} className="max-h-64 w-full object-cover" />
          </a>
        ) : (
          <a
            key={`${a.url}-${i}`}
            href={a.url}
            target="_blank"
            rel="noopener"
            className={cn(
              "col-span-full flex items-center gap-x2 rounded-r3 border border-stroke-neutral-muted bg-bg-layer-default px-x3 py-x2_5 t4-medium text-fg-neutral transition-colors hover:bg-bg-layer-default-pressed",
              mine && "ml-auto",
            )}
          >
            <FileText className="size-4 shrink-0 text-fg-neutral-subtle" />
            <span className="truncate">{a.name}</span>
          </a>
        )
      )}
    </div>
  );
}

// ─── portal variant (학생 포털 — SEED 토큰 말풍선) ──────────────────────

const KST_OFFSET = 9 * 60 * 60 * 1000;

function fmtBubbleTime(iso: string): string {
  const k = new Date(new Date(iso).getTime() + KST_OFFSET);
  const now = new Date(Date.now() + KST_OFFSET);
  const h = k.getUTCHours();
  const time = `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${k
    .getUTCMinutes()
    .toString()
    .padStart(2, "0")}`;
  const sameDay =
    k.getUTCFullYear() === now.getUTCFullYear() &&
    k.getUTCMonth() === now.getUTCMonth() &&
    k.getUTCDate() === now.getUTCDate();
  return sameDay ? time : `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 ${time}`;
}

function PortalAttachments({ attachments }: { attachments: QuestionAttachment[] }) {
  if (attachments.length === 0) return null;
  const images = attachments.filter((a) => a.mimeType.startsWith("image/"));
  const videos = attachments.filter((a) => a.mimeType.startsWith("video/"));
  const files = attachments.filter(
    (a) => !a.mimeType.startsWith("image/") && !a.mimeType.startsWith("video/")
  );
  return (
    <>
      {images.length > 0 && (
        <div
          className={cn(
            "grid max-w-full gap-x1 overflow-hidden rounded-r4",
            images.length > 1 ? "w-[248px] grid-cols-2" : "w-[232px]"
          )}
        >
          {images.map((a, i) => (
            <a
              key={`${a.url}-${i}`}
              href={a.url}
              target="_blank"
              rel="noopener"
              className="block bg-bg-neutral-weak transition-opacity active:opacity-80"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.name}
                className={cn(
                  "block w-full object-cover",
                  images.length > 1 ? "aspect-square" : "max-h-80"
                )}
              />
            </a>
          ))}
        </div>
      )}
      {videos.map((a, i) => (
        <video
          key={`${a.url}-${i}`}
          controls
          playsInline
          preload="metadata"
          className="w-[248px] max-w-full rounded-r4 bg-bg-neutral-weak"
          src={a.url}
        />
      ))}
      {files.map((a, i) => (
        <a
          key={`${a.url}-${i}`}
          href={a.url}
          target="_blank"
          rel="noopener"
          className="flex max-w-[248px] items-center gap-x2_5 rounded-r4 bg-bg-layer-default px-x3_5 py-x3 t4-regular text-fg-neutral-muted transition-colors duration-color-transition active:bg-bg-layer-default-pressed"
        >
          <FileText className="size-x5 shrink-0 text-fg-neutral-subtle" strokeWidth={2} />
          <span className="truncate t4-medium">{a.name}</span>
        </a>
      ))}
    </>
  );
}

function PortalMessage({ m, mine }: { m: ThreadMessage; mine: boolean }) {
  const hasBody = m.content.length > 0;
  if (mine) {
    return (
      <li className="flex flex-col items-end">
        <div className="flex max-w-[82%] flex-col items-end gap-x1_5">
          <PortalAttachments attachments={m.attachments} />
          {hasBody && (
            <p className="whitespace-pre-wrap break-words rounded-r5 rounded-br-r1_5 bg-bg-brand-solid px-x4 py-x2_5 t5-regular text-palette-static-white">
              {m.content}
            </p>
          )}
        </div>
        <span className="mt-x1 px-x1 t2-regular tabular-nums text-fg-placeholder">
          {fmtBubbleTime(m.createdAt)}
        </span>
      </li>
    );
  }
  const name = m.senderType === "STAFF" ? `${m.senderName} 멘토` : m.senderName;
  return (
    <li className="flex items-start gap-x2">
      <Avatar name={m.senderName || "?"} size={32} />
      <div className="flex min-w-0 max-w-[80%] flex-col items-start">
        <span className="mb-x1 px-x1 t3-medium text-fg-neutral-muted">{name}</span>
        <div className="flex max-w-full flex-col items-start gap-x1_5">
          <PortalAttachments attachments={m.attachments} />
          {hasBody && (
            <p className="whitespace-pre-wrap break-words rounded-r5 rounded-tl-r1_5 bg-bg-layer-default px-x4 py-x2_5 t5-regular text-fg-neutral">
              {m.content}
            </p>
          )}
        </div>
        <span className="mt-x1 px-x1 t2-regular tabular-nums text-fg-placeholder">
          {fmtBubbleTime(m.createdAt)}
        </span>
      </div>
    </li>
  );
}

export function QuestionThread({
  viewer,
  messages,
  onSend,
  studentToken,
  composerPlaceholder = "메시지 입력...",
  composerLabel = "전송",
  uploaderLabel = "사진 추가",
  disabled,
  emptyHint,
  variant = "default",
}: {
  viewer: "STUDENT" | "STAFF";
  messages: ThreadMessage[];
  onSend: (params: { content: string; attachments: QuestionAttachment[] }) => Promise<void>;
  studentToken?: string;
  composerPlaceholder?: string;
  composerLabel?: string;
  uploaderLabel?: string;
  disabled?: boolean;
  emptyHint?: string;
  /** "portal" = 학생 포털 SEED Design 스타일. 기본값은 직원 화면 마크업 그대로. */
  variant?: "default" | "portal";
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<QuestionAttachment[]>([]);
  const [isPending, startTransition] = useTransition();

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !isPending && !disabled;

  const handleSend = () => {
    if (!canSend) return;
    const payload = { content: text.trim(), attachments };
    startTransition(async () => {
      try {
        await onSend(payload);
        setText("");
        setAttachments([]);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "전송에 실패했어요");
      }
    });
  };

  if (variant === "portal") {
    return (
      <div className="flex flex-col gap-x5">
        {messages.length === 0 && emptyHint ? (
          <p className="py-x10 text-center t4-regular text-fg-neutral-subtle">{emptyHint}</p>
        ) : (
          <ul className="flex flex-col gap-x4">
            {messages.map((m) => (
              <PortalMessage
                key={m.id}
                m={m}
                mine={
                  (viewer === "STUDENT" && m.senderType === "STUDENT") ||
                  (viewer === "STAFF" && m.senderType === "STAFF")
                }
              />
            ))}
          </ul>
        )}

        {!disabled && (
          <div className="rounded-r5 bg-bg-layer-default p-x4">
            <TextField
              value={text}
              onValueChange={({ value }) => setText(value)}
              disabled={isPending}
            >
              <TextFieldTextarea
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={composerPlaceholder}
                aria-label="메시지"
                // 기존 rows={3} 높이 → SEED textarea 는 minHeight 로 지정(자동 높이 조절 유지)
                style={{ minHeight: 96, maxHeight: 192 }}
              />
            </TextField>
            <PhotoUploader
              attachments={attachments}
              onChange={setAttachments}
              studentToken={studentToken}
              disabled={isPending}
              label={uploaderLabel}
              variant="portal"
            />
            <Button
              variant="primary"
              size="lg"
              block
              onClick={handleSend}
              disabled={!canSend}
              loading={isPending}
              className="mt-x3"
            >
              <PrefixIcon svg={<IconPaperplaneFill />} />
              {composerLabel}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ─── default variant (직원 화면) — SEED 토큰 대화 타임라인 ───
  return (
    <div className="flex flex-col gap-x5">
      {messages.length === 0 && emptyHint ? (
        <div className="rounded-r4 bg-bg-layer-fill">
          <EmptyState compact icon={MessagesSquare} title={emptyHint} />
        </div>
      ) : (
        <ul className="flex flex-col gap-x4">
          {messages.map((m) => {
            const mine =
              (viewer === "STUDENT" && m.senderType === "STUDENT") ||
              (viewer === "STAFF" && m.senderType === "STAFF");
            const name = m.senderType === "STAFF" ? `${m.senderName} 멘토` : m.senderName;
            return (
              <li key={m.id} className={cn("flex gap-x2_5", mine ? "justify-end" : "justify-start")}>
                {!mine && <Avatar name={m.senderName || "?"} size={32} className="mt-x0_5" />}
                <div className={cn("flex min-w-0 max-w-[80%] flex-col gap-x1", mine ? "items-end" : "items-start")}>
                  <span className="flex items-center gap-x1_5 px-x0_5 t2-regular text-fg-neutral-subtle">
                    <span className="t2-medium text-fg-neutral-muted">{name}</span>
                    <span className="tabular-nums">{fmtTime(m.createdAt)}</span>
                  </span>
                  {m.content && (
                    <p
                      className={cn(
                        "whitespace-pre-wrap break-words rounded-r4 px-x4 py-x2_5 t4-regular",
                        mine
                          ? "rounded-tr-r1 bg-bg-brand-solid text-palette-static-white"
                          : m.senderType === "STAFF"
                            ? "rounded-tl-r1 bg-bg-positive-weak text-fg-neutral"
                            : "rounded-tl-r1 bg-bg-neutral-weak text-fg-neutral",
                      )}
                    >
                      {m.content}
                    </p>
                  )}
                  <AttachmentGrid attachments={m.attachments} mine={mine} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!disabled && (
        <div className="flex flex-col gap-x3 rounded-r4 bg-bg-layer-fill p-x3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={3}
            placeholder={composerPlaceholder}
            disabled={isPending}
            aria-label="답변 내용"
            className="max-h-60 resize-y"
          />
          <div className="flex flex-wrap items-end justify-between gap-x3">
            <PhotoUploader
              attachments={attachments}
              onChange={setAttachments}
              studentToken={studentToken}
              disabled={isPending}
              label={uploaderLabel}
            />
            <StaffButton onClick={handleSend} disabled={!canSend} className="ml-auto">
              {isPending ? <Loader2 className="animate-spin" /> : <Send />}
              {isPending ? "보내는 중…" : composerLabel}
            </StaffButton>
          </div>
        </div>
      )}
    </div>
  );
}
