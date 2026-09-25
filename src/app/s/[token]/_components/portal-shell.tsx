"use client";

// 학생 포털 앱 셸 — Toss 모바일 구조.
//  · 탭 루트(홈/수행평가/질문/메시지/전체): 좌측 큰 제목 헤더 + 하단 탭바
//  · 하위 화면: 뒤로가기 + 가운데 제목 헤더, 탭바 숨김 (BottomCTA 가 바닥에 붙는다)
// 페이지는 <ScreenTitle title="..."/> 로 헤더 제목을 덮어쓸 수 있다 (예: 채팅 상대 이름).

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type TabKey = "home" | "tasks" | "qna" | "chat" | "menu";

type Screen =
  | { kind: "tab"; tab: TabKey; title: string }
  | { kind: "push"; title: string; back: string; surface?: "panel" };

const PUSH_TITLES: Record<string, string> = {
  feedback: "받은 피드백",
  vocab: "영단어 시험",
  points: "포인트",
  suggestions: "건의사항",
  nap: "쪽잠 신청",
  network: "네트워크 사용",
  schedule: "내 일정",
  exam: "모의고사 신청",
  lunch: "", // 본문에 큰 제목이 있음 (/meal 과 공용 폼)
};

function resolveScreen(pathname: string, root: string): Screen {
  const seg = pathname.slice(root.length).split("/").filter(Boolean);
  const [head, sub] = seg;
  if (!head) return { kind: "tab", tab: "home", title: "" };
  switch (head) {
    case "tasks":
      return sub
        ? { kind: "push", title: "과제", back: `${root}/tasks` }
        : { kind: "tab", tab: "tasks", title: "수행평가" };
    case "qna":
      if (!sub) return { kind: "tab", tab: "qna", title: "질문" };
      return sub === "new"
        ? { kind: "push", title: "", back: `${root}/qna`, surface: "panel" }
        : { kind: "push", title: "질문", back: `${root}/qna` };
    case "chat":
      return sub
        ? { kind: "push", title: "대화", back: `${root}/chat` }
        : { kind: "tab", tab: "chat", title: "메시지" };
    case "menu":
      return { kind: "tab", tab: "menu", title: "전체" };
    case "survey":
      return sub
        ? { kind: "push", title: "초기 설문", back: `${root}/survey`, surface: "panel" }
        : { kind: "push", title: "초기 설문", back: root };
    case "contents":
      return sub
        ? { kind: "push", title: "", back: `${root}/contents`, surface: "panel" }
        : { kind: "push", title: "콘텐츠", back: root };
    default:
      return { kind: "push", title: PUSH_TITLES[head] ?? "", back: root };
  }
}

// ─── 헤더 제목 override ──────────────────────────────────────────────

type TitleOverride = { path: string; title: string } | null;
const TitleContext = createContext<(t: TitleOverride) => void>(() => {});

/** 현재 화면의 헤더 제목을 덮어쓴다. 렌더 결과 없음. */
export function ScreenTitle({ title }: { title: string }) {
  const setOverride = useContext(TitleContext);
  const pathname = usePathname() ?? "";
  useEffect(() => {
    setOverride({ path: pathname, title });
    return () => setOverride(null);
  }, [pathname, title, setOverride]);
  return null;
}

// ─── Shell ───────────────────────────────────────────────────────────

export type PortalBadges = {
  tasks: number;
  qna: number;
  chat: number;
  /** 전체 탭 안에 숨은 항목(피드백·영단어·건의)의 합 */
  menu: number;
};

export function PortalShell({
  token,
  badges,
  children,
}: {
  token: string;
  badges: PortalBadges;
  children: ReactNode;
}) {
  const root = `/s/${token}`;
  const pathname = usePathname() ?? root;
  const screen = resolveScreen(pathname, root);
  const [override, setOverride] = useState<TitleOverride>(null);
  const stableSet = useCallback((t: TitleOverride) => setOverride(t), []);

  const title = override && override.path === pathname ? override.title : screen.title;
  const isTab = screen.kind === "tab";
  const surface = screen.kind === "push" && screen.surface === "panel" ? "panel" : "canvas";

  return (
    <TitleContext.Provider value={stableSet}>
      <div
        data-portal
        data-seed-color-mode="light-only"
        className={cn(
          "min-h-[100svh]",
          surface === "panel" ? "bg-bg-layer-default" : "bg-bg-layer-basement"
        )}
        style={
          {
            "--portal-surface":
              surface === "panel"
                ? "var(--seed-color-bg-layer-default)"
                : "var(--seed-color-bg-layer-basement)",
            paddingBottom: isTab
              ? "calc(env(safe-area-inset-bottom) + 76px)"
              : "env(safe-area-inset-bottom)",
          } as React.CSSProperties
        }
      >
        <PortalHeader screen={screen} title={title} root={root} />
        <main key={pathname} className="portal-enter mx-auto max-w-[480px] px-4 pb-8 pt-1">
          {children}
        </main>
        {isTab && <PortalTabBar root={root} active={screen.tab} badges={badges} />}
      </div>
    </TitleContext.Provider>
  );
}

// ─── Header ──────────────────────────────────────────────────────────

function useScrolled(threshold = 4) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

function PortalHeader({ screen, title, root }: { screen: Screen; title: string; root: string }) {
  const router = useRouter();
  const scrolled = useScrolled();

  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-xl transition-[box-shadow,background-color] duration-200"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        background: scrolled
          ? "color-mix(in srgb, var(--portal-surface) 86%, transparent)"
          : "var(--portal-surface)",
        boxShadow: scrolled ? "0 1px 0 var(--seed-color-stroke-neutral-subtle)" : "none",
      }}
    >
      <div className="relative mx-auto flex h-14 max-w-[480px] items-center px-2">
        {screen.kind === "tab" ? (
          screen.tab === "home" ? (
            <Link href={root} className="flex items-center gap-2 px-3" aria-label="홈">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/portal-icon.svg" alt="" className="size-x7 rounded-r2" />
              <span className="t7-bold text-fg-neutral">강한선배</span>
            </Link>
          ) : (
            <h1 className="px-3 screen-title text-fg-neutral">{title}</h1>
          )
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) router.back();
                else router.push(screen.back);
              }}
              aria-label="뒤로 가기"
              className="relative z-10 inline-flex size-x10 items-center justify-center rounded-full text-fg-neutral transition-colors active:bg-bg-transparent-pressed"
            >
              <ChevronLeft className="h-[26px] w-[26px]" strokeWidth={2.1} />
            </button>
            <h1 className="pointer-events-none absolute inset-x-16 truncate text-center t6-bold text-fg-neutral">
              {title}
            </h1>
          </>
        )}
      </div>
    </header>
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string; path: string }[] = [
  { key: "home", label: "홈", path: "" },
  { key: "tasks", label: "수행평가", path: "/tasks" },
  { key: "qna", label: "질문", path: "/qna" },
  { key: "chat", label: "메시지", path: "/chat" },
  { key: "menu", label: "전체", path: "/menu" },
];

function PortalTabBar({
  root,
  active,
  badges,
}: {
  root: string;
  active: TabKey;
  badges: PortalBadges;
}) {
  const badgeOf: Record<TabKey, number> = {
    home: 0,
    tasks: badges.tasks,
    qna: badges.qna,
    chat: badges.chat,
    menu: badges.menu,
  };
  return (
    <nav
      aria-label="학생 포털 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 bg-bg-layer-default/95 shadow-[0_-1px_0_var(--seed-color-stroke-neutral-subtle)] backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid h-[60px] max-w-[480px] grid-cols-5">
        {TABS.map((t) => {
          const isActive = t.key === active;
          const count = badgeOf[t.key];
          return (
            <li key={t.key} className="flex">
              <Link
                href={`${root}${t.path}`}
                aria-current={isActive ? "page" : undefined}
                className="flex flex-1 flex-col items-center justify-center gap-[3px] transition-transform duration-150 active:scale-[0.92]"
              >
                <span className={cn("relative", isActive ? "text-fg-neutral" : "text-fg-placeholder")}>
                  <TabIcon name={t.key} active={isActive} />
                  {count > 0 &&
                    (t.key === "menu" ? (
                      <span className="absolute -right-0.5 -top-0.5 size-x2 rounded-full bg-bg-brand-solid ring-2 ring-bg-layer-default" />
                    ) : (
                      <span className="absolute -right-2 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-bg-brand-solid px-1 t1-static-bold text-palette-static-white ring-2 ring-bg-layer-default tabular-nums">
                        {count > 9 ? "9+" : count}
                      </span>
                    ))}
                </span>
                <span
                  className={cn(
                    isActive ? "t1-bold text-fg-neutral" : "t1-medium text-fg-neutral-subtle"
                  )}
                >
                  {t.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** 탭 아이콘 — 비활성은 선, 활성은 채움 (Toss 탭바 방식) */
function TabIcon({ name, active }: { name: TabKey; active: boolean }) {
  const common = {
    width: 26,
    height: 26,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.8 };
  const solid = { fill: "currentColor", stroke: "currentColor", strokeWidth: 1.8 };
  const cut = { fill: "none", stroke: "var(--seed-color-bg-layer-default)", strokeWidth: 1.8 };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path
            d="M4 10.3 12 4l8 6.3V19a1 1 0 0 1-1 1h-4.25v-5.25h-5.5V20H5a1 1 0 0 1-1-1z"
            {...(active ? solid : line)}
          />
        </svg>
      );
    case "tasks":
      return (
        <svg {...common}>
          <path
            d="M8.5 4.5H6.75A1.75 1.75 0 0 0 5 6.25v13A1.75 1.75 0 0 0 6.75 21h10.5A1.75 1.75 0 0 0 19 19.25v-13a1.75 1.75 0 0 0-1.75-1.75H15.5"
            {...(active ? solid : line)}
          />
          <rect x="8.5" y="3" width="7" height="3.5" rx="1.2" {...(active ? solid : line)} />
          <path d="m9 13.25 2.1 2.1 4-4.1" {...(active ? cut : line)} />
        </svg>
      );
    case "qna":
      return (
        <svg {...common}>
          <path
            d="M12 3.75a8.25 8.25 0 0 0-7.2 12.28L3.75 20.25l4.3-1.02A8.25 8.25 0 1 0 12 3.75z"
            {...(active ? solid : line)}
          />
          <path d="M9.75 9.75a2.3 2.3 0 0 1 4.47.77c0 1.53-2.22 1.9-2.22 3.23" {...(active ? cut : line)} />
          <circle cx="12" cy="16.4" r="0.4" {...(active ? cut : line)} />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path
            d="M5.25 4.5h13.5c.97 0 1.75.78 1.75 1.75v9.5c0 .97-.78 1.75-1.75 1.75H12l-4.75 3.5V17.5h-2c-.97 0-1.75-.78-1.75-1.75v-9.5c0-.97.78-1.75 1.75-1.75z"
            {...(active ? solid : line)}
          />
          {[8.25, 12, 15.75].map((x) => (
            <circle
              key={x}
              cx={x}
              cy="11"
              r="0.35"
              {...(active ? { ...cut, strokeWidth: 2.2 } : { ...line, strokeWidth: 2.2 })}
            />
          ))}
        </svg>
      );
    case "menu":
      return (
        <svg {...common}>
          {[
            [4, 4],
            [13.5, 4],
            [4, 13.5],
            [13.5, 13.5],
          ].map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="6.5" height="6.5" rx="1.8" {...(active ? solid : line)} />
          ))}
        </svg>
      );
  }
}
