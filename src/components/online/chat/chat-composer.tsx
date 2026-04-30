"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Paperclip, Send, X, Loader2, FileText } from "lucide-react";
import type { ChatAttachment } from "@/actions/online/portal-chat";

const MAX_ATTACHMENTS = 5;
const ALLOWED_EXT = /\.(pdf|png|jpe?g|webp|gif|docx?|hwpx?|zip)$/i;

export function ChatComposer({
  chatId,
  studentToken,
  onSend,
  disabled,
}: {
  chatId: string;
  studentToken?: string; // 학생 측이면 토큰, 직원 측이면 undefined
  onSend: (params: {
    content: string;
    attachments: ChatAttachment[];
  }) => Promise<void>;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !isPending;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.error(`최대 ${MAX_ATTACHMENTS}개까지 첨부 가능합니다`);
      return;
    }
    if (!ALLOWED_EXT.test(file.name)) {
      toast.error("허용되지 않는 파일 형식입니다");
      return;
    }
    setUploading(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("context", "chat");
      fd.append("chatId", chatId);
      if (studentToken) fd.append("studentToken", studentToken);
      const res = await fetch("/api/online/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "업로드 실패");
      setAttachments((prev) => [
        ...prev,
        {
          url: data.url,
          name: data.name,
          sizeBytes: data.sizeBytes,
          mimeType: data.mimeType,
        },
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(null);
    }
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSend = () => {
    if (!canSend) return;
    const payload = { content: text.trim(), attachments };
    startTransition(async () => {
      try {
        await onSend(payload);
        setText("");
        setAttachments([]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "전송 실패");
      }
    });
  };

  return (
    <div
      className="border-t border-line bg-panel/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {attachments.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto px-3 pb-1 pt-2">
          {attachments.map((a, i) => (
            <li
              key={i}
              className="relative shrink-0 rounded-[10px] border border-line bg-canvas-2"
            >
              {a.mimeType.startsWith("image/") ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={a.url}
                  alt={a.name}
                  className="h-14 w-14 rounded-[10px] object-cover"
                />
              ) : (
                <div className="flex h-14 w-32 items-center gap-1.5 px-2">
                  <FileText className="h-4 w-4 shrink-0 text-ink-4" />
                  <span className="truncate text-[11px] text-ink-2">
                    {a.name}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                aria-label="첨부 제거"
                className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white shadow-sm"
              >
                <X className="h-3 w-3" strokeWidth={3} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-1.5 px-2 py-2">
        <label className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-ink-3 active:bg-canvas-2">
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Paperclip className="h-5 w-5" />
          )}
          <input
            ref={fileRef}
            type="file"
            onChange={handleFileChange}
            className="hidden"
            disabled={!!uploading || isPending}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.doc,.hwp,.hwpx,.zip"
          />
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          placeholder="메시지 입력..."
          disabled={disabled || isPending}
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-[20px] border border-line bg-canvas-2 px-3.5 py-2 text-[14px] leading-tight text-ink placeholder:text-ink-5 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="전송"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white shadow-sm active:scale-95 disabled:bg-ink-5 disabled:active:scale-100 transition-transform"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" strokeWidth={2.5} />
          )}
        </button>
      </div>
    </div>
  );
}
