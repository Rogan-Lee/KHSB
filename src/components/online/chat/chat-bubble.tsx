"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import type { ChatAttachment } from "@/actions/online/portal-chat";

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
  const code = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const tone = `av-tone-${(code % 6) + 1}`;
  return (
    <span
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white ${tone}`}
      aria-hidden
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function ChatBubble({
  message,
  viewer,
  showAvatar = true,
  showTime = true,
  authorLabel,
}: {
  message: ChatMessageView;
  viewer: "STUDENT" | "STAFF";
  showAvatar?: boolean;
  showTime?: boolean;
  authorLabel?: string;
}) {
  const isMine = message.senderType === viewer;
  const align = isMine ? "items-end" : "items-start";
  const justify = isMine ? "justify-end" : "justify-start";

  return (
    <div className={`flex flex-col ${align} gap-1`}>
      {!isMine && showAvatar && authorLabel && (
        <span className="ml-10 text-[11px] font-medium text-ink-4">
          {authorLabel}
        </span>
      )}
      <div className={`flex ${justify} items-end gap-1.5 max-w-full`}>
        {!isMine && showAvatar && (
          <ChatAvatar name={message.senderName ?? "?"} />
        )}
        {!isMine && !showAvatar && <span className="w-8 shrink-0" />}

        <div className="flex max-w-[80%] flex-col gap-1">
          {message.attachments.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {message.attachments.map((a, i) => (
                <Attachment key={i} attachment={a} mine={isMine} />
              ))}
            </div>
          )}
          {message.content && (
            <div
              className={`whitespace-pre-wrap break-words rounded-[14px] px-3 py-2 text-[14px] leading-relaxed ${
                isMine
                  ? "bg-brand text-white"
                  : "border border-line bg-panel text-ink"
              }`}
            >
              {message.content}
            </div>
          )}
        </div>

        {showTime && (
          <span className="self-end pb-0.5 text-[10.5px] tabular-nums text-ink-5">
            {timeShort(new Date(message.createdAt))}
          </span>
        )}
      </div>
    </div>
  );
}

function Attachment({
  attachment: a,
  mine,
}: {
  attachment: ChatAttachment;
  mine: boolean;
}) {
  const isImage = a.mimeType.startsWith("image/");
  const [broken, setBroken] = useState(false);
  if (isImage && !broken) {
    return (
      <a
        href={a.url}
        target="_blank"
        rel="noopener"
        className="overflow-hidden rounded-[14px] border border-line bg-canvas-2 max-w-[260px]"
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
      className={`flex items-center gap-2 rounded-[12px] px-3 py-2 text-[12.5px] ${
        mine
          ? "bg-brand text-white"
          : "border border-line bg-panel text-ink"
      }`}
    >
      <FileText className={`h-4 w-4 shrink-0 ${mine ? "" : "text-ink-4"}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{a.name}</p>
        <p className={`text-[10.5px] ${mine ? "opacity-80" : "text-ink-5"}`}>
          {(a.sizeBytes / 1024 / 1024).toFixed(1)}MB
        </p>
      </div>
      <Download
        className={`h-3.5 w-3.5 shrink-0 ${mine ? "" : "text-ink-4"}`}
      />
    </a>
  );
}
