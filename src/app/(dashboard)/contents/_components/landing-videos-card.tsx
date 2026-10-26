"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, Section } from "@/components/backoffice/ui";
import { setLandingVideos } from "@/actions/content-posts";
import { LANDING_VIDEO_EXTRA_MAX, youtubeId } from "@/lib/content-posts-meta";
import type { ContentPostRow } from "./content-posts-admin";

const NONE = "__none";
const LABELS = ["기본 영상", ...Array.from({ length: LANDING_VIDEO_EXTRA_MAX }, (_, i) => `추가 영상 ${i + 1}`)];

/** 팟캐스트 탭 위 '홈페이지 영상' — 랜딩 홈 영상 칸의 기본 영상(가운데) + 추가 영상(양옆) */
export function LandingVideosCard({
  posts,
  initial,
  className,
}: {
  posts: ContentPostRow[];
  initial: { main: string | null; extra: string[] };
  className?: string;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  // 랜딩에 실제로 뜰 수 있는 것만: 공개 + 유튜브 링크인 팟캐스트
  const videos = posts.filter((p) => p.type === "podcast" && p.visible && youtubeId(p.url));
  const known = (id: string | null | undefined) => (id && videos.some((v) => v.id === id) ? id : NONE);
  const [picks, setPicks] = useState(() => [known(initial.main), ...LABELS.slice(1).map((_, i) => known(initial.extra[i]))]);

  function save() {
    const [main, ...extra] = picks.map((v) => (v === NONE ? null : v));
    startTransition(async () => {
      try {
        await setLandingVideos(main, extra.filter((v): v is string => v !== null));
        toast.success(main ? "홈페이지 영상을 저장했어요" : "최신 영상 순으로 자동으로 보여줘요");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장하지 못했습니다");
      }
    });
  }

  return (
    <Section
      className={className}
      title="홈페이지 영상"
      description="기본 영상은 홈 영상 칸 가운데에 크게, 추가 영상은 양옆에 보여요. 유튜브 링크인 공개 팟캐스트만 고를 수 있고, 저장하면 5분 안에 반영돼요."
      actions={
        <Button onClick={save} disabled={busy}>
          저장
        </Button>
      }
    >
      {videos.length === 0 ? (
        <p className="t4-regular text-fg-neutral-subtle">유튜브 링크로 팟캐스트를 먼저 추가해 주세요.</p>
      ) : (
        <div className="grid gap-x4 md:grid-cols-3">
          {LABELS.map((label, i) => (
            <FormField key={label} label={label} hint={i === 0 && picks[0] === NONE ? "고르지 않으면 최신 영상 3개를 보여줘요." : undefined}>
              <Select
                value={picks[i]}
                onValueChange={(v) => setPicks((ps) => ps.map((p, j) => (j === i ? v : p)))}
                disabled={i > 0 && picks[0] === NONE}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{i === 0 ? "자동 (최신 영상)" : "선택 안 함"}</SelectItem>
                  {videos.map((v) => (
                    <SelectItem key={v.id} value={v.id} disabled={picks.some((p, j) => j !== i && p === v.id)}>
                      {v.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          ))}
        </div>
      )}
    </Section>
  );
}
