"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Paperclip, Send, X, Loader2, FileText } from "lucide-react";
import { IconArrowUpFill, IconPlusFill } from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { ActionButton } from "seed-design/ui/action-button";
import { ProgressCircle } from "seed-design/ui/progress-circle";
import { TextField, TextFieldTextarea } from "seed-design/ui/text-field";
import type { ChatAttachment } from "@/actions/online/portal-chat";
import { Button } from "@/components/ui/button";
import { inputBaseClass } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MAX_ATTACHMENTS = 5;
// SEED TextFieldTextarea 의 props 타입(InputHTMLAttributes 기반)에 rows 가 빠져 있어 스프레드로 넘긴다.
// 런타임에는 <textarea rows={1}> 로 그대로 전달된다 — 한 줄 높이에서 시작해 입력에 따라 자동으로 늘어남.
const SINGLE_ROW = { rows: 1 };
const ALLOWED_EXT = /\.(pdf|png|jpe?g|webp|gif|docx?|hwpx?|zip)$/i;

export function ChatComposer({
  chatId,
  studentToken,
  onSend,
  disabled,
  variant = "default",
}: {
  chatId: string;
  studentToken?: string; // 학생 측이면 토큰, 직원 측이면 undefined
  onSend: (params: {
    content: string;
    attachments: ChatAttachment[];
  }) => Promise<void>;
  disabled?: boolean;
  /** "portal" = 학생 포털 SEED Design 스타일. 기본값은 직원 화면 그대로. */
  variant?: "default" | "portal";
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

  if (variant === "portal") {
    const attachBusy = !!uploading || isPending;
    return (
      <div
        className="bg-bg-layer-default shadow-[0_-1px_0_var(--seed-color-stroke-neutral-subtle)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {(attachments.length > 0 || uploading) && (
          <ul className="flex gap-x2 overflow-x-auto px-x3 pt-x3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {attachments.map((a, i) => (
              <li
                key={i}
                className="relative h-x16 shrink-0 overflow-hidden rounded-r3 bg-bg-neutral-weak"
              >
                {a.mimeType.startsWith("image/") ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={a.url} alt={a.name} className="size-x16 object-cover" />
                ) : (
                  <div className="flex h-x16 w-36 items-center gap-x2 pl-x3 pr-x8">
                    <FileText className="size-x4 shrink-0 text-fg-neutral-subtle" />
                    <span className="truncate t3-regular text-fg-neutral-muted">{a.name}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  aria-label="첨부 제거"
                  className="absolute right-1 top-1 inline-flex size-x5 items-center justify-center rounded-full bg-bg-overlay text-palette-static-white active:scale-90"
                >
                  <X className="size-x3" strokeWidth={3} />
                </button>
              </li>
            ))}
            {uploading && (
              <li
                className="flex size-x16 shrink-0 items-center justify-center rounded-r3 bg-bg-neutral-weak"
                aria-label="업로드 중"
              >
                <ProgressCircle size="24" tone="neutral" />
              </li>
            )}
          </ul>
        )}

        {/* SEED TextField(large, 16px — iOS 확대 방지) 양옆에 ActionButton(iconOnly).
            버튼(40px)은 한 줄 입력칸(52px) 가운데에 맞추고, 여러 줄로 늘어나면 아래에 붙는다. */}
        <div className="flex items-end gap-x2 px-x3 py-x2">
          <ActionButton
            type="button"
            layout="iconOnly"
            variant="neutralWeak"
            size="medium"
            aria-label="파일 첨부"
            disabled={attachBusy}
            onClick={() => fileRef.current?.click()}
            className="mb-x1_5 shrink-0"
          >
            <Icon svg={<IconPlusFill />} />
          </ActionButton>
          <input
            ref={fileRef}
            type="file"
            onChange={handleFileChange}
            className="hidden"
            disabled={attachBusy}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.doc,.hwp,.hwpx,.zip"
          />
          <div className="min-w-0 flex-1">
            <TextField
              value={text}
              onValueChange={({ value }) => setText(value)}
              disabled={disabled || isPending}
            >
              <TextFieldTextarea
                {...SINGLE_ROW}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="메시지 보내기"
                aria-label="메시지"
                style={{ minHeight: 0, maxHeight: 128 }}
              />
            </TextField>
          </div>
          <ActionButton
            type="button"
            layout="iconOnly"
            variant="brandSolid"
            size="medium"
            aria-label="전송"
            onClick={handleSend}
            disabled={!canSend}
            loading={isPending}
            className="mb-x1_5 shrink-0"
          >
            <Icon svg={<IconArrowUpFill />} />
          </ActionButton>
        </div>
      </div>
    );
  }

  // 직원 화면 — 대화 카드 하단에 붙는 입력 줄 (SEED TextInput 규격 + ActionButton)
  const attachBusy = !!uploading || isPending;
  return (
    <div
      className="shrink-0 border-t border-stroke-neutral-muted bg-bg-layer-default"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {(attachments.length > 0 || uploading) && (
        <ul className="flex gap-x2 overflow-x-auto px-x3 pt-x3 md:px-x4">
          {attachments.map((a, i) => (
            <li
              key={i}
              className="relative h-x14 shrink-0 overflow-hidden rounded-r3 bg-bg-neutral-weak"
            >
              {a.mimeType.startsWith("image/") ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={a.url} alt={a.name} className="size-x14 object-cover" />
              ) : (
                <div className="flex h-x14 w-36 items-center gap-x2 pl-x3 pr-x8">
                  <FileText className="size-4 shrink-0 text-fg-neutral-subtle" />
                  <span className="truncate t3-regular text-fg-neutral-muted">{a.name}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                aria-label="첨부 제거"
                className="absolute right-1 top-1 inline-flex size-x5 items-center justify-center rounded-full bg-bg-overlay text-palette-static-white"
              >
                <X className="size-3" strokeWidth={3} />
              </button>
            </li>
          ))}
          {uploading && (
            <li
              className="flex h-x14 w-36 shrink-0 items-center gap-x2 rounded-r3 bg-bg-neutral-weak px-x3"
              aria-label="업로드 중"
            >
              <Loader2 className="size-4 shrink-0 animate-spin text-fg-neutral-subtle" />
              <span className="truncate t3-regular text-fg-neutral-muted">{uploading}</span>
            </li>
          )}
        </ul>
      )}

      <div className="flex items-end gap-x2 px-x3 py-x3 md:px-x4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="파일 첨부"
          title="파일 첨부"
          disabled={attachBusy}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}
        </Button>
        <input
          ref={fileRef}
          type="file"
          onChange={handleFileChange}
          className="hidden"
          disabled={attachBusy}
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.doc,.hwp,.hwpx,.zip"
        />
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
          placeholder="메시지 입력 (Shift+Enter 줄바꿈)"
          aria-label="메시지"
          disabled={disabled || isPending}
          className={cn(inputBaseClass, "field-sizing-content max-h-32 min-h-10 flex-1 resize-none py-x2")}
        />
        <Button
          type="button"
          size="icon"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="전송"
          title="전송"
        >
          {isPending ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </div>
    </div>
  );
}
