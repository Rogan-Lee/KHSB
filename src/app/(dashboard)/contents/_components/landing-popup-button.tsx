"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "seed-design/ui/switch";
import { FormField, StatusBadge } from "@/components/backoffice/ui";
import { setLandingPopup, type LandingPopupInput } from "@/actions/content-posts";
import { isLandingPopupLive, type LandingPopup } from "@/lib/landing-popup";

const todayKST = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const toForm = (p: LandingPopup | null): LandingPopupInput => ({
  active: p?.active ?? false,
  title: p?.title ?? "",
  body: p?.body ?? "",
  until: p?.until ?? "",
  ctaLabel: p?.ctaLabel ?? "",
  ctaUrl: p?.ctaUrl ?? "",
});

/** 콘텐츠 페이지 머리의 '홈페이지 팝업' — 랜딩 홈 첫 화면 공지 팝업을 켜고 끄고 고친다 */
export function LandingPopupButton({ initial }: { initial: LandingPopup | null }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => toForm(initial));
  const live = isLandingPopupLive(initial, todayKST());
  const expired = !!initial?.active && !live && !!initial.until && initial.until < todayKST();

  function save() {
    startTransition(async () => {
      try {
        await setLandingPopup(form);
        toast.success(form.active ? "팝업을 저장했어요. 1분 안에 홈에 반영돼요" : "팝업을 껐어요");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장하지 못했습니다");
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setForm(toForm(initial));
          setOpen(true);
        }}
      >
        <Megaphone />
        홈페이지 팝업
        {live && <StatusBadge tone="ok">켜짐</StatusBadge>}
        {expired && <StatusBadge>기간 끝남</StatusBadge>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>홈페이지 팝업</DialogTitle>
            <DialogDescription>
              강한선배 홈 첫 화면에 뜨는 안내예요. 방문자가 &lsquo;오늘 하루 보지 않기&rsquo;로 닫아도 내용을 바꿔 저장하면 다시 떠요.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 flex-col gap-x5">
            <label className="flex cursor-pointer items-center gap-x2 t4-medium text-fg-neutral">
              <Switch
                size="24"
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
                inputProps={{ "aria-label": "팝업 켜기" }}
              />
              {form.active ? "켜짐 — 홈에 보여요" : "꺼짐"}
            </label>
            <FormField label="제목" htmlFor="popup-title" required={form.active}>
              <Input
                id="popup-title"
                value={form.title}
                maxLength={100}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="예: 2027 윈터스쿨 입실 및 수강료 납부 안내"
              />
            </FormField>
            <FormField label="내용" required={form.active}>
              <MarkdownEditor
                value={form.body}
                onChange={(v) => setForm((f) => ({ ...f, body: v }))}
                placeholder="안내 내용 (### 소제목, **굵게**, - 목록)"
              />
            </FormField>
            <div className="grid gap-x4 sm:grid-cols-3">
              <FormField label="표시 마지막 날 (선택)" htmlFor="popup-until" hint="이 날까지 보이고 다음 날 자동으로 내려가요">
                <Input
                  id="popup-until"
                  type="date"
                  value={form.until ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, until: e.target.value }))}
                  className="tabular-nums"
                />
              </FormField>
              <FormField label="버튼 문구 (선택)" htmlFor="popup-cta-label">
                <Input
                  id="popup-cta-label"
                  value={form.ctaLabel ?? ""}
                  maxLength={30}
                  onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))}
                  placeholder="예: 카카오톡으로 문의하기"
                />
              </FormField>
              <FormField label="버튼 링크 (선택)" htmlFor="popup-cta-url">
                <Input
                  id="popup-cta-url"
                  value={form.ctaUrl ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, ctaUrl: e.target.value }))}
                  placeholder="https://"
                />
              </FormField>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              취소
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
