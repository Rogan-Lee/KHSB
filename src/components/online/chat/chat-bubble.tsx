"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import type { ChatAttachment } from "@/actions/online/portal-chat";
import { Avatar } from "@/components/portal/ui";
import { cn } from "@/lib/utils";

export type ChatMessageView = {
  id: string;
  senderType: "STUDENT" | "STAFF";
  senderName: string | null;
  content: string;
  attachments: ChatAttachment[];
  createdAt: string; // ISO
  flaggedForDailyLogAt?: string | null;
};

function timeShort(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const h = kst.getUTCHours();
  const m = kst.getUTCMinutes();
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${ampm} ${h12}:${m.toString().padStart(2, "0")}`;
}

export function ChatAvatar({ name }: { name: string }) {
  return <Avatar name={name} size={32} />;
}

export function ChatBubble({
  message,
  viewer,
  showAvatar = true,
  showTime = true,
  authorLabel,
  variant = "default",
}: {
  message: ChatMessageView;
  viewer: "STUDENT" | "STAFF";
  showAvatar?: boolean;
  showTime?: boolean;
  authorLabel?: string;
  /** "portal" = 학생 포털 SEED Design 스타일. 기본값은 직원 화면 그대로. */
  variant?: "default" | "portal";
}) {
  const isMine = message.senderType === viewer;
  const align = isMine ? "items-end" : "items-start";
  const justify = isMine ? "justify-end" : "justify-start";

  if (variant === "portal") {
    const time = showTime ? (
      <span className="shrink-0 pb-x0_5 t2-regular tabular-nums text-fg-placeholder">
        {timeShort(new Date(message.createdAt))}
      </span>
    ) : null;
    const body = (
      <>
        {message.attachments.length > 0 &&
          message.attachments.map((a, i) => (
            <Attachment key={i} attachment={a} mine={isMine} portal />
          ))}
        {message.content && (
          <div
            className={cn(
              "whitespace-pre-wrap break-words rounded-r5 px-x3_5 py-x2 t5-regular",
              isMine
                ? cn("bg-bg-brand-solid text-palette-static-white", showTime && "rounded-br-r1_5")
                : cn("bg-bg-layer-default text-fg-neutral", showAvatar && "rounded-tl-r1_5")
            )}
          >
            {message.content}
          </div>
        )}
      </>
    );

    if (isMine) {
      return (
        <div className="flex w-full items-end justify-end gap-x1_5">
          {time}
          <div className="flex min-w-0 max-w-[75%] flex-col items-end gap-x1">{body}</div>
        </div>
      );
    }
    return (
      <div className="flex w-full items-start gap-x2">
        {showAvatar ? (
          <Avatar name={message.senderName ?? "?"} size={32} />
        ) : (
          <span className="w-x8 shrink-0" aria-hidden />
        )}
        <div className="flex min-w-0 flex-1 flex-col items-start gap-x1">
          {showAvatar && authorLabel && (
            <span className="px-x1 t3-medium text-fg-neutral-muted">{authorLabel}</span>
          )}
          <div className="flex w-full items-end gap-x1_5">
            <div className="flex min-w-0 max-w-[80%] flex-col items-start gap-x1">{body}</div>
            {time}
          </div>
        </div>
      </div>
    );
  }

  // 직원 화면 — 내 메시지(직원)는 오른쪽 brand 말풍선, 학생 메시지는 왼쪽 흰 말풍선 + 아바타
  const time = showTime ? (
    <span className="shrink-0 pb-x0_5 t2-regular tabular-nums text-fg-placeholder">
      {timeShort(new Date(message.createdAt))}
    </span>
  ) : null;
  const body = (
    <>
      {message.attachments.length > 0 && (
        <div className={cn("flex flex-col gap-x1_5", align)}>
          {message.attachments.map((a, i) => (
            <Attachment key={i} attachment={a} mine={isMine} />
          ))}
        </div>
      )}
      {message.content && (
        <div
          className={cn(
            "whitespace-pre-wrap break-words rounded-r4 px-x3_5 py-x2_5 t4-regular",
            isMine
              ? cn("bg-bg-brand-solid text-palette-static-white", showTime && "rounded-br-r1_5")
              : cn(
                  "bg-bg-layer-default text-fg-neutral shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-muted)]",
                  showAvatar && "rounded-tl-r1_5"
                )
          )}
        >
          {message.content}
        </div>
      )}
    </>
  );

  if (isMine) {
    return (
      <div className={cn("flex w-full items-end gap-x1_5", justify)}>
        {time}
        <div className={cn("flex min-w-0 max-w-[min(80%,36rem)] flex-col gap-x1", align)}>{body}</div>
      </div>
    );
  }
  return (
    <div className="flex w-full items-start gap-x2">
      {showAvatar ? (
        <ChatAvatar name={message.senderName ?? "?"} />
      ) : (
        <span className="w-x8 shrink-0" aria-hidden />
      )}
      <div className={cn("flex min-w-0 flex-1 flex-col gap-x1", align)}>
        {showAvatar && authorLabel && (
          <span className="px-x1 t3-medium text-fg-neutral-muted">{authorLabel}</span>
        )}
        <div className={cn("flex w-full items-end gap-x1_5", justify)}>
          <div className={cn("flex min-w-0 max-w-[min(80%,36rem)] flex-col gap-x1", align)}>{body}</div>
          {time}
        </div>
      </div>
    </div>
  );
}

function Attachment({
  attachment: a,
  mine,
  portal = false,
}: {
  attachment: ChatAttachment;
  mine: boolean;
  portal?: boolean;
}) {
  const isImage = a.mimeType.startsWith("image/");
  const [broken, setBroken] = useState(false);
  if (portal) {
    if (isImage && !broken) {
      return (
        <a
          href={a.url}
          target="_blank"
          rel="noopener"
          className="block max-w-[240px] overflow-hidden rounded-r4 bg-bg-neutral-weak transition-opacity active:opacity-80"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={a.url}
            alt={a.name}
            className="block max-h-[320px] w-full object-cover"
            onError={() => setBroken(true)}
          />
        </a>
      );
    }
    return (
      <a
        href={a.url}
        target="_blank"
        rel="noopener"
        download={a.name}
        className={cn(
          "flex max-w-[260px] items-center gap-x2_5 rounded-r4 px-x3_5 py-x2_5 transition-opacity active:opacity-80",
          mine
            ? "bg-bg-brand-solid text-palette-static-white"
            : "bg-bg-layer-default text-fg-neutral"
        )}
      >
        <span
          className={cn(
            "inline-flex size-x9 shrink-0 items-center justify-center rounded-full",
            mine
              ? "bg-palette-static-white-alpha-300"
              : "bg-bg-neutral-weak text-fg-neutral-muted"
          )}
        >
          <FileText className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate t4-bold">{a.name}</p>
          <p
            className={cn(
              "t2-regular tabular-nums",
              mine ? "opacity-80" : "text-fg-neutral-subtle"
            )}
          >
            {(a.sizeBytes / 1024 / 1024).toFixed(1)}MB
          </p>
        </div>
        <Download
          className={cn("size-x4 shrink-0", mine ? "opacity-80" : "text-fg-neutral-subtle")}
        />
      </a>
    );
  }
  if (isImage && !broken) {
    return (
      <a
        href={a.url}
        target="_blank"
        rel="noopener"
        className="block max-w-[260px] overflow-hidden rounded-r4 bg-bg-neutral-weak transition-opacity hover:opacity-90"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={a.url}
          alt={a.name}
          className="block max-h-[320px] w-full object-cover"
          onError={() => setBroken(true)}
        />
      </a>
    );
  }
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener"
      download={a.name}
      className={cn(
        "flex w-[260px] max-w-full items-center gap-x2_5 rounded-r4 px-x3 py-x2_5 transition-opacity hover:opacity-90",
        mine
          ? "bg-bg-brand-solid text-palette-static-white"
          : "bg-bg-layer-default text-fg-neutral shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-muted)]"
      )}
    >
      <span
        className={cn(
          "inline-flex size-x9 shrink-0 items-center justify-center rounded-full",
          mine
            ? "bg-palette-static-white-alpha-300"
            : "bg-bg-neutral-weak text-fg-neutral-muted"
        )}
      >
        <FileText className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate t3-bold">{a.name}</p>
        <p className={cn("t2-regular tabular-nums", mine ? "opacity-80" : "text-fg-neutral-subtle")}>
          {(a.sizeBytes / 1024 / 1024).toFixed(1)}MB
        </p>
      </div>
      <Download className={cn("size-4 shrink-0", mine ? "opacity-80" : "text-fg-neutral-subtle")} />
    </a>
  );
}
