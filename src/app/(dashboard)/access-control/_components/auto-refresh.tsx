"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 30_000;

/**
 * 기기 접속·장비 연결 상태가 낡지 않게, 화면이 보이는 동안 30초마다 서버 데이터를 다시 받는다.
 * 가려져 있던 탭으로 돌아오면 바로 한 번 받는다.
 */
export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(refreshIfVisible, INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router]);

  return null;
}
