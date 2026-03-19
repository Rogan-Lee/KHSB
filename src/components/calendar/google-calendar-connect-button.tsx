"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-[#1a73e8] bg-[#e8f0fe] border border-[#c5d8fd] rounded-full px-3 py-1.5">
          <span className="font-bold">G</span>
          <span>연동됨{connectedBy ? ` · ${connectedBy}` : ""}</span>
        </div>
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded border border-transparent hover:border-destructive/30"
        >
          {disconnecting ? "해제 중..." : "연동 해제"}
        </button>
      </div>
    );
  }

  return (
    <a
      href="/api/google-calendar/auth"
      className={cn(
        "flex items-center gap-1.5 text-xs border rounded-full px-3 py-1.5 transition-colors",
        "border-border text-muted-foreground hover:bg-[#e8f0fe] hover:border-[#c5d8fd] hover:text-[#1a73e8]"
      )}
    >
      <span className="font-bold">G</span>
      <span>Google Calendar 연동</span>
    </a>
  );
}
