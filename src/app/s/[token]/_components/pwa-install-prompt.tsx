"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Share, SquarePlus, Smartphone, X } from "lucide-react";
import { BottomSheet } from "@/components/portal/bottom-sheet";
import { Button, IconTile, PRESS } from "@/components/portal/ui";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "student-portal-pwa-dismissed";

type InstallEnv = "standalone" | "dismissed" | "ios" | "other" | "server";

function detectInstallEnv(): InstallEnv {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "standalone";
  try {
    if (window.localStorage.getItem(DISMISS_KEY)) return "dismissed";
  } catch {
    // storage 차단 환경 — 그냥 노출
  }
  const ua = window.navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
  return isIos && isSafari ? "ios" : "other";
}

const noopSubscribe = () => () => {};

export function PwaInstallPrompt() {
  const env = useSyncExternalStore(noopSubscribe, detectInstallEnv, () => "server" as const);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (env !== "other" && env !== "ios") return;
    // Android / desktop Chromium: capture beforeinstallprompt
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, [env]);

  if (hidden) return null;
  // iOS Safari 는 수동 안내, 그 외는 beforeinstallprompt 를 받은 경우만 노출
  if (!deferred && env !== "ios") return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setDeferred(null);
    setHidden(true);
    setSheetOpen(false);
  };

  const onOpen = async () => {
    if (!deferred) {
      setSheetOpen(true);
      return;
    }
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted" || outcome === "dismissed") dismiss();
  };

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          className={cn("flex w-full items-center gap-3.5 rounded-r5 bg-bg-layer-default p-5 pr-12 text-left", PRESS)}
        >
          <IconTile icon={Smartphone} tone="brand" size={44} />
          <div className="min-w-0 flex-1">
            <p className="t5-bold text-fg-neutral">
              홈 화면에 추가하기
            </p>
            <p className="t3-regular mt-0.5 text-fg-neutral-subtle">
              링크를 찾지 않아도 앱처럼 바로 열 수 있어요
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="다시 보지 않기"
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-fg-placeholder transition-colors active:bg-bg-transparent-pressed"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="홈 화면에 추가하기"
        description="Safari에서 세 단계면 끝나요."
        footer={
          <Button variant="primary" size="xl" block onClick={() => setSheetOpen(false)}>
            확인
          </Button>
        }
      >
        <ol className="space-y-4 pb-2">
          <IosStep n={1}>
            하단의 <Share className="mx-0.5 inline h-[18px] w-[18px] -translate-y-px text-fg-informative" />{" "}
            <b className="text-fg-neutral font-semibold">공유</b> 버튼을 눌러요
          </IosStep>
          <IosStep n={2}>
            <SquarePlus className="mx-0.5 inline h-[18px] w-[18px] -translate-y-px" />{" "}
            <b className="text-fg-neutral font-semibold">홈 화면에 추가</b>를 선택해요
          </IosStep>
          <IosStep n={3}>홈 화면의 아이콘으로 바로 들어와요</IosStep>
        </ol>
      </BottomSheet>
    </>
  );
}

function IosStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3.5">
      <span className="t4-bold inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-neutral-weak text-fg-neutral-muted tabular-nums">
        {n}
      </span>
      <span className="t5-regular text-fg-neutral-muted">{children}</span>
    </li>
  );
}
