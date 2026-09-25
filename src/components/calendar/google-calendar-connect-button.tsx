"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { CalendarDays, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  connected: boolean;
  connectedBy: string | null;
  justConnected: boolean;
  error?: string;
}

export function GoogleCalendarConnectButton({ connected, connectedBy, justConnected, error }: Props) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(connected);

  useEffect(() => {
    if (justConnected) toast.success("Google Calendar 연동 완료!");
    if (error === "cancelled") toast.info("Google Calendar 연동이 취소되었습니다");
    if (error === "failed") toast.error("Google Calendar 연동 실패. 다시 시도해주세요");
    if (error === "no_refresh_token") toast.error("권한 토큰을 받지 못했습니다. 다시 시도해주세요");
  }, [justConnected, error]);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/google-calendar/disconnect", { method: "POST" });
      setIsConnected(false);
      toast.success("Google Calendar 연동이 해제되었습니다");
    } catch {
      toast.error("연동 해제 실패");
    } finally {
      setDisconnecting(false);
    }
  }

  if (isConnected) {
    return (
      <div className="flex flex-wrap items-center gap-x2">
        <span className="inline-flex h-8 items-center gap-x1_5 rounded-full bg-bg-informative-weak px-x3 t3-medium text-fg-informative">
          <Check className="size-3.5" aria-hidden />
          Google Calendar 연동됨{connectedBy ? ` · ${connectedBy}` : ""}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="text-fg-neutral-subtle hover:text-fg-critical"
        >
          {disconnecting ? "해제 중…" : "연동 해제"}
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" asChild>
      <a href="/api/google-calendar/auth">
        <CalendarDays aria-hidden />
        Google Calendar 연동
      </a>
    </Button>
  );
}
