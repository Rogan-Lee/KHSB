"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markFeedbackRead } from "@/actions/online/feedback-read";

/**
 * 페이지 진입 시 미확인 피드백을 자동으로 읽음 처리.
 * 마운트 1회만 실행 (StrictMode/리마운트 대비 ref 가드).
 */
export function FeedbackMarkRead({
  studentToken,
  hasUnread,
}: {
  studentToken: string;
  hasUnread: boolean;
}) {
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (!hasUnread || fired.current) return;
    fired.current = true;
    markFeedbackRead({ studentToken })
      .then(({ markedIds }) => {
        if (markedIds.length > 0) router.refresh();
      })
      .catch(() => {
        // 읽음 처리 실패는 사용자에게 노출하지 않음
      });
  }, [studentToken, hasUnread, router]);

  return null;
}
