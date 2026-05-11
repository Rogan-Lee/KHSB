"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Loader2, FileText } from "lucide-react";
import type { QuestionAttachment } from "@/actions/student-questions";
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

function AttachmentGrid({ attachments }: { attachments: QuestionAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      {attachments.map((a, i) =>
        a.mimeType.startsWith("image/") ? (
          <a
            key={`${a.url}-${i}`}
            href={a.url}
            target="_blank"
            rel="noopener"
            className="block overflow-hidden rounded-[10px] border border-line bg-canvas-2"
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
            className="flex items-center gap-1.5 rounded-[10px] border border-line bg-canvas-2 px-2.5 py-2 text-[12px] text-ink-2"
          >
            <FileText className="h-4 w-4 shrink-0 text-ink-4" />
            <span className="truncate">{a.name}</span>
          </a>
        )
      )}
    </div>
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

  return (
    <div className="space-y-3">
      {messages.length === 0 && emptyHint ? (
        <p className="rounded-[12px] border border-dashed border-line bg-canvas-2/40 px-4 py-8 text-center text-[13px] text-ink-4">
          {emptyHint}
        </p>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => {
            const mine =
              (viewer === "STUDENT" && m.senderType === "STUDENT") ||
              (viewer === "STAFF" && m.senderType === "STAFF");
            return (
              <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                  <span className="px-1 text-[10.5px] text-ink-4">
                    {m.senderType === "STAFF" ? `${m.senderName} 멘토` : m.senderName} ·{" "}
                    {fmtTime(m.createdAt)}
                  </span>
                  <div
                    className={`mt-0.5 rounded-[14px] px-3.5 py-2.5 text-[14px] leading-relaxed ${
                      mine
                        ? "bg-brand text-white"
                        : m.senderType === "STAFF"
                          ? "bg-ok-soft text-ink"
                          : "bg-canvas-2 text-ink"
                    }`}
                  >
                    {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                    <AttachmentGrid attachments={m.attachments} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!disabled && (
        <div className="rounded-[14px] border border-line bg-panel p-3">
          <PhotoUploader
            attachments={attachments}
            onChange={setAttachments}
            studentToken={studentToken}
            disabled={isPending}
            label={uploaderLabel}
          />
          <div className="mt-2 flex items-end gap-1.5">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder={composerPlaceholder}
              disabled={isPending}
              className="max-h-40 min-h-[44px] flex-1 resize-none rounded-[12px] border border-line bg-canvas-2 px-3 py-2 text-[14px] leading-snug text-ink placeholder:text-ink-5 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[12px] bg-brand px-4 text-[13.5px] font-semibold text-white active:scale-[0.98] disabled:bg-ink-5 disabled:active:scale-100 transition-transform"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" strokeWidth={2.5} />
              )}
              {composerLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
