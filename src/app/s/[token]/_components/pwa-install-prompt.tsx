"use client";

import { useEffect, useState } from "react";
import { Smartphone, Share, X, Plus } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "student-portal-pwa-dismissed";

export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [showIosHint, setShowIosHint] = useState(false);
  const [open, setOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already in standalone (installed)
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
    if (standalone) return;

    // User dismissed previously?
    if (window.localStorage.getItem(DISMISS_KEY)) return;

    // Android / desktop Chromium: capture beforeinstallprompt
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS Safari fallback
    const ua = window.navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
    if (isIos && isSafari) {
      setShowIosHint(true);
    }

    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (isStandalone) return null;
  if (!deferred && !showIosHint) return null;

  const dismiss = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setDeferred(null);
    setShowIosHint(false);
    setOpen(false);
  };

  const triggerInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted" || outcome === "dismissed") {
      dismiss();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-[14px] border border-line bg-panel p-4 text-left active:bg-canvas-2 transition-colors"
      >
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-brand/12 text-brand">
          <Smartphone className="h-5 w-5" strokeWidth={2.4} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-semibold text-ink">
            앱처럼 홈 화면에서 열기
          </p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-4">
            매번 링크를 찾을 필요 없이 한 번에 열 수 있어요
          </p>
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-[14px] border border-line bg-panel p-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-brand/12 text-brand">
          <Smartphone className="h-5 w-5" strokeWidth={2.4} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-semibold text-ink">
            홈 화면에 추가하기
          </p>
          {deferred ? (
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-4">
              버튼을 누르면 브라우저가 설치 안내를 띄워줘요.
            </p>
          ) : (
            <ol className="mt-2 space-y-1.5 text-[12px] text-ink-3">
              <li className="flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-canvas-2 text-[10px] font-bold text-ink-3">
                  1
                </span>
                Safari 하단의{" "}
                <Share className="inline h-3.5 w-3.5 align-text-bottom" /> 공유
                버튼을 눌러요
              </li>
              <li className="flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-canvas-2 text-[10px] font-bold text-ink-3">
                  2
                </span>
                <Plus className="inline h-3.5 w-3.5" /> 홈 화면에 추가를
                선택해요
              </li>
              <li className="flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-canvas-2 text-[10px] font-bold text-ink-3">
                  3
                </span>
                홈 화면 아이콘으로 바로 접속해요
              </li>
            </ol>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="닫기"
          className="-mr-1.5 -mt-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-4 active:bg-canvas-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {deferred && (
        <button
          type="button"
          onClick={triggerInstall}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-[12px] bg-ink px-4 py-2.5 text-[13.5px] font-semibold text-white active:scale-[0.98] transition-transform"
        >
          설치하기
        </button>
      )}
    </div>
  );
}
