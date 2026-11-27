"use client";

import { useState, useRef } from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import {
  Sparkles,
  Download,
  RefreshCw,
  Megaphone,
  Lightbulb,
  Trophy,
  ImagePlus,
  Link as LinkIcon,
  X,
  ScanSearch,
  ChevronLeft,
  ChevronRight,
  DownloadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState,
  FilterChip,
  FormField,
  IconTile,
  Section,
  Segmented,
  StatusBadge,
} from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";
import {
  generateCardNewsSlides,
  analyzeReferenceImage,
  type CardNewsTemplate,
  type Slide,
  type ExtractedStyle,
  type AnnouncementInputs,
  type StudyTipInputs,
  type TopStudentInputs,
} from "@/actions/card-news";
import { AnnouncementCard } from "./templates/announcement-card";
import { StudyTipCard } from "./templates/study-tip-card";
import { TopStudentCard } from "./templates/top-student-card";

const TEMPLATES: { id: CardNewsTemplate; label: string; desc: string; icon: typeof Megaphone }[] = [
  { id: "announcement", label: "공지/이벤트", desc: "학원 공지, 행사 홍보", icon: Megaphone },
  { id: "study-tip", label: "학습 팁/동기부여", desc: "공부법, 동기부여 콘텐츠", icon: Lightbulb },
  { id: "top-student", label: "성적 우수자 발표", desc: "우수 학생 시상, 칭찬", icon: Trophy },
];

const SLIDE_LABELS: Record<string, string> = { cover: "표지", body: "본문", closing: "마무리" };

const MOOD_OPTIONS: { value: StudyTipInputs["mood"]; label: string }[] = [
  { value: "energetic", label: "활기차게" },
  { value: "calm", label: "차분하게" },
  { value: "serious", label: "진지하게" },
];

export function CardNewsClient() {
  const [template, setTemplate] = useState<CardNewsTemplate>("announcement");
  const [loading, setLoading] = useState(false);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [customStyle, setCustomStyle] = useState<ExtractedStyle | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [refUrl, setRefUrl] = useState("");
  const [refPreview, setRefPreview] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const [ann, setAnn] = useState<AnnouncementInputs>({ title: "", date: "", target: "전체 원생", details: "" });
  const [tip, setTip] = useState<StudyTipInputs>({ topic: "", keyMessage: "", mood: "energetic" });
  const [top, setTop] = useState<TopStudentInputs>({ period: "", students: "", subject: "전과목", message: "" });

  // ── 레퍼런스 파일 업로드
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setRefPreview(ev.target?.result as string); setRefUrl(""); };
    reader.readAsDataURL(file);
  }

  function clearReference() {
    setRefPreview(null); setRefUrl(""); setCustomStyle(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── 레퍼런스 분석
  async function handleAnalyze() {
    if (!refPreview && !refUrl.trim()) { toast.error("이미지를 업로드하거나 URL을 입력해주세요."); return; }
    setAnalyzing(true); setCustomStyle(null);
    let result;
    if (refPreview && refPreview.startsWith("data:")) {
      const [header, data] = refPreview.split(",");
      const mimeType = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
      result = await analyzeReferenceImage({ type: "base64", data, mimeType });
    } else {
      const url = refPreview ?? refUrl.trim();
      result = await analyzeReferenceImage({ type: "url", url });
      if (result.success) setRefPreview(url);
    }
    setAnalyzing(false);
    if (!result.success) { toast.error(result.error); return; }
    setCustomStyle(result.style);
    toast.success("레퍼런스 스타일 추출 완료!");
  }

  // ── AI 슬라이드 생성
  async function handleGenerate() {
    const inputs = template === "announcement" ? ann : template === "study-tip" ? tip : top;
    const vals = Object.values(inputs).filter((v) => typeof v === "string");
    if (vals.some((v) => v === "")) { toast.error("모든 항목을 입력해주세요."); return; }
    setLoading(true); setSlides([]); setCurrentSlide(0);
    const res = await generateCardNewsSlides(template, inputs);
    setLoading(false);
    if (!res.success) { toast.error(res.error); return; }
    setSlides(res.data.slides);
    toast.success(`카드뉴스 ${res.data.slides.length}장 생성 완료!`);
  }

  // ── 현재 슬라이드 PNG 다운로드
  async function handleDownloadCurrent() {
    if (!cardRef.current || slides.length === 0) return;
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 });
      const a = document.createElement("a");
      a.download = `카드뉴스_${template}_${currentSlide + 1}_${SLIDE_LABELS[slides[currentSlide].type]}.png`;
      a.href = dataUrl; a.click();
      toast.success("이미지 저장 완료!");
    } catch { toast.error("이미지 저장에 실패했습니다."); }
  }

  // ── 전체 슬라이드 순차 다운로드
  async function handleDownloadAll() {
    if (!cardRef.current || slides.length === 0) return;
    setDownloadingAll(true);
    for (let i = 0; i < slides.length; i++) {
      setCurrentSlide(i);
      await new Promise((r) => setTimeout(r, 300)); // DOM 업데이트 대기
      try {
        const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 });
        const a = document.createElement("a");
        a.download = `카드뉴스_${template}_${i + 1}_${SLIDE_LABELS[slides[i].type]}.png`;
        a.href = dataUrl; a.click();
        await new Promise((r) => setTimeout(r, 200));
      } catch { /* skip */ }
    }
    setDownloadingAll(false);
    toast.success("전체 이미지 저장 완료!");
  }

  const slide = slides[currentSlide];

  return (
    <div className="grid grid-cols-1 items-start gap-x6 xl:grid-cols-[400px_minmax(0,1fr)]">
      {/* ── 좌측 패널 ── */}
      <div className="flex min-w-0 flex-col gap-x4">
        {/* 템플릿 선택 */}
        <Section title="템플릿">
          <div className="flex flex-col gap-x2" role="group" aria-label="템플릿 선택">
            {TEMPLATES.map((t) => {
              const active = template === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { setTemplate(t.id); setSlides([]); setCurrentSlide(0); }}
                  className={cn(
                    "flex w-full items-center gap-x3 rounded-r3 px-x3 py-x3 text-left transition-colors",
                    active
                      ? "bg-bg-brand-weak shadow-[inset_0_0_0_1px_var(--seed-color-stroke-brand-solid)]"
                      : "bg-bg-layer-default shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-muted)] hover:bg-bg-layer-default-pressed",
                  )}
                >
                  <IconTile icon={t.icon} size={32} tone={active ? "brand" : "gray"} solid={active} />
                  <span className="min-w-0 flex-1">
                    <span className="block t4-bold text-fg-neutral">{t.label}</span>
                    <span className="mt-x0_5 block t3-regular text-fg-neutral-subtle">{t.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* 레퍼런스 스타일 */}
        <Section
          title={
            <>
              레퍼런스 스타일
              <span className="t4-regular text-fg-neutral-subtle">선택</span>
            </>
          }
          description="참고 이미지를 올리면 색상과 분위기를 뽑아 카드에 적용해요"
        >
          {!refPreview ? (
            <div className="flex flex-col gap-x3">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-x2 rounded-r3 border border-dashed border-stroke-neutral-weak py-x6 t4-medium text-fg-neutral-muted transition-colors hover:bg-bg-layer-default-pressed hover:text-fg-neutral"
              >
                <ImagePlus className="size-5" aria-hidden />
                이미지 파일 업로드
              </button>
              <div className="flex gap-x2">
                <div className="relative min-w-0 flex-1">
                  <LinkIcon
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-neutral-subtle"
                    aria-hidden
                  />
                  <Input
                    aria-label="레퍼런스 이미지 URL"
                    placeholder="이미지 URL (.jpg, .png)"
                    className="pl-x9"
                    value={refUrl}
                    onChange={(e) => setRefUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                  />
                </div>
                <Button variant="outline" onClick={handleAnalyze} disabled={analyzing || !refUrl.trim()}>
                  {analyzing ? (
                    <>
                      <RefreshCw className="animate-spin" aria-hidden />
                      분석 중…
                    </>
                  ) : (
                    "분석"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-x3">
              <div className="relative overflow-hidden rounded-r3 border border-stroke-neutral-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={refPreview} alt="레퍼런스 이미지" className="h-32 w-full object-cover" />
                <button
                  type="button"
                  onClick={clearReference}
                  aria-label="레퍼런스 이미지 지우기"
                  className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-bg-overlay text-palette-static-white transition-opacity hover:opacity-80"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              {customStyle ? (
                <div className="flex items-center gap-x2 rounded-r3 bg-bg-positive-weak px-x3 py-x2_5">
                  <div className="flex gap-x1" aria-hidden>
                    {[customStyle.background, customStyle.accentColor, customStyle.headlineColor].map((c, i) => (
                      // 추출된 색상 데이터 미리보기 — 값이 런타임 데이터라 inline style 유지
                      <span key={i} className="size-3.5 rounded-r1 border border-stroke-neutral-muted" style={{ background: c }} />
                    ))}
                  </div>
                  <span className="t3-medium text-fg-positive">스타일을 추출했어요</span>
                  <button
                    type="button"
                    onClick={() => setCustomStyle(null)}
                    className="ml-auto rounded-r2 px-x1_5 py-x1 t3-medium text-fg-neutral-muted underline-offset-2 transition-colors hover:text-fg-neutral hover:underline"
                  >
                    초기화
                  </button>
                </div>
              ) : (
                <Button className="w-full" variant="outline" onClick={handleAnalyze} disabled={analyzing}>
                  {analyzing ? (
                    <>
                      <RefreshCw className="animate-spin" aria-hidden />
                      분석 중…
                    </>
                  ) : (
                    <>
                      <ScanSearch aria-hidden />
                      스타일 분석하기
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </Section>

        {/* 소재 입력 */}
        <Section title="소재 입력">
          <div className="flex flex-col gap-x4">
            {template === "announcement" && (<>
              <FormField label="제목" htmlFor="cn-ann-title">
                <Input id="cn-ann-title" placeholder="예: 2월 학원 설명회 개최" value={ann.title} onChange={(e) => setAnn({ ...ann, title: e.target.value })} />
              </FormField>
              <FormField label="날짜/기간" htmlFor="cn-ann-date">
                <Input id="cn-ann-date" placeholder="예: 2025년 2월 15일 (토) 오후 2시" value={ann.date} onChange={(e) => setAnn({ ...ann, date: e.target.value })} />
              </FormField>
              <FormField label="대상" htmlFor="cn-ann-target">
                <Input id="cn-ann-target" placeholder="예: 전체 원생 및 학부모" value={ann.target} onChange={(e) => setAnn({ ...ann, target: e.target.value })} />
              </FormField>
              <FormField label="주요 내용" htmlFor="cn-ann-details">
                <Textarea id="cn-ann-details" placeholder="예: 신규 커리큘럼 설명, 자기소개서 특강 안내" rows={3} value={ann.details} onChange={(e) => setAnn({ ...ann, details: e.target.value })} />
              </FormField>
            </>)}

            {template === "study-tip" && (<>
              <FormField label="주제" htmlFor="cn-tip-topic">
                <Input id="cn-tip-topic" placeholder="예: 수능 D-100 시간 관리법" value={tip.topic} onChange={(e) => setTip({ ...tip, topic: e.target.value })} />
              </FormField>
              <FormField label="핵심 메시지/소재" htmlFor="cn-tip-message">
                <Textarea id="cn-tip-message" placeholder="예: 포모도로 기법 25분 집중 5분 휴식" rows={3} value={tip.keyMessage} onChange={(e) => setTip({ ...tip, keyMessage: e.target.value })} />
              </FormField>
              <FormField label="분위기">
                <Segmented
                  aria-label="분위기"
                  options={MOOD_OPTIONS}
                  value={tip.mood}
                  onChange={(m) => setTip({ ...tip, mood: m })}
                />
              </FormField>
            </>)}

            {template === "top-student" && (<>
              <FormField label="기간" htmlFor="cn-top-period">
                <Input id="cn-top-period" placeholder="예: 2025년 1월" value={top.period} onChange={(e) => setTop({ ...top, period: e.target.value })} />
              </FormField>
              <FormField label="우수 학생 이름" htmlFor="cn-top-students">
                <Input id="cn-top-students" placeholder="예: 김민준, 이서연, 박지호" value={top.students} onChange={(e) => setTop({ ...top, students: e.target.value })} />
              </FormField>
              <FormField label="과목/분야" htmlFor="cn-top-subject">
                <Input id="cn-top-subject" placeholder="예: 수학, 영어, 전과목" value={top.subject} onChange={(e) => setTop({ ...top, subject: e.target.value })} />
              </FormField>
              <FormField label="추가 메시지" htmlFor="cn-top-message">
                <Textarea id="cn-top-message" placeholder="예: 꾸준한 노력으로 놀라운 성장을 이루었습니다" rows={2} value={top.message} onChange={(e) => setTop({ ...top, message: e.target.value })} />
              </FormField>
            </>)}

            <Button size="lg" className="mt-x1 w-full" onClick={handleGenerate} disabled={loading}>
              {loading ? (
                <>
                  <RefreshCw className="animate-spin" aria-hidden />
                  AI 생성 중…
                </>
              ) : (
                <>
                  <Sparkles aria-hidden />
                  AI 카드뉴스 생성 (4장)
                </>
              )}
            </Button>
          </div>
        </Section>

        {/* 슬라이드 텍스트 편집 */}
        {slide && (
          <Section
            title="텍스트 수정"
            actions={
              <StatusBadge tone="gray">
                {SLIDE_LABELS[slide.type]} {currentSlide + 1}/{slides.length}
              </StatusBadge>
            }
          >
            <div className="flex flex-col gap-x4">
              <FormField label="헤드라인" htmlFor="cn-slide-headline">
                <Input id="cn-slide-headline" value={slide.headline} onChange={(e) => { const s = [...slides]; s[currentSlide] = { ...s[currentSlide], headline: e.target.value }; setSlides(s); }} />
              </FormField>
              <FormField label="서브 헤드라인" htmlFor="cn-slide-subheadline">
                <Input id="cn-slide-subheadline" value={slide.subheadline} onChange={(e) => { const s = [...slides]; s[currentSlide] = { ...s[currentSlide], subheadline: e.target.value }; setSlides(s); }} />
              </FormField>
              <FormField label="본문" htmlFor="cn-slide-body">
                <Textarea id="cn-slide-body" rows={3} value={slide.body} onChange={(e) => { const s = [...slides]; s[currentSlide] = { ...s[currentSlide], body: e.target.value }; setSlides(s); }} className="resize-none" />
              </FormField>
              {slide.items && (
                <FormField label="항목" htmlFor="cn-slide-items" hint="줄바꿈으로 구분해요">
                  <Textarea id="cn-slide-items" rows={3} value={slide.items.join("\n")}
                    onChange={(e) => { const s = [...slides]; s[currentSlide] = { ...s[currentSlide], items: e.target.value.split("\n").filter(Boolean) }; setSlides(s); }}
                    className="resize-none" />
                </FormField>
              )}
              {slide.callToAction !== undefined && (
                <FormField label="CTA" htmlFor="cn-slide-cta">
                  <Input id="cn-slide-cta" value={slide.callToAction ?? ""} onChange={(e) => { const s = [...slides]; s[currentSlide] = { ...s[currentSlide], callToAction: e.target.value }; setSlides(s); }} />
                </FormField>
              )}
              {slide.hashtags && (
                <FormField label="해시태그" htmlFor="cn-slide-hashtags" hint="띄어쓰기로 구분해요">
                  <Input id="cn-slide-hashtags" value={slide.hashtags.join(" ")} onChange={(e) => { const s = [...slides]; s[currentSlide] = { ...s[currentSlide], hashtags: e.target.value.split(/\s+/).filter(Boolean) }; setSlides(s); }} />
                </FormField>
              )}
            </div>
          </Section>
        )}
      </div>

      {/* ── 우측: 미리보기 ── */}
      <div className="min-w-0 xl:sticky xl:top-20">
        <Section
          title="미리보기"
          description="1080×1080"
          actions={
            customStyle || slides.length > 0 ? (
              <>
                {customStyle && <StatusBadge tone="ok">레퍼런스 적용됨</StatusBadge>}
                {slides.length > 0 && (
                  <>
                    <Button size="sm" variant="outline" onClick={handleDownloadCurrent} disabled={downloadingAll}>
                      <Download aria-hidden />
                      이 장 저장
                    </Button>
                    <Button size="sm" onClick={handleDownloadAll} disabled={downloadingAll}>
                      {downloadingAll ? <RefreshCw className="animate-spin" aria-hidden /> : <DownloadCloud aria-hidden />}
                      {downloadingAll ? "저장 중…" : `전체 ${slides.length}장 저장`}
                    </Button>
                  </>
                )}
              </>
            ) : null
          }
        >
          {/* 카드 — 좁은 화면에선 480px 를 줄이지 않고 가로 스크롤. 가운데 정렬은 바깥 래퍼가 맡는다
              (cardRef 노드가 그대로 PNG 로 저장되므로 노드 자체에 margin 을 주면 html-to-image 복제본이 밀린다) */}
          <div className="overflow-x-auto">
            <div className="mx-auto w-max">
              <div
                ref={cardRef}
                style={{ width: 480, height: 480, fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" }}
                className="overflow-hidden rounded-r4"
              >
                {slides.length === 0 ? (
                  <EmptyState
                    icon={Sparkles}
                    title={loading ? "AI가 카드뉴스를 만들고 있어요" : "소재를 입력하고 AI 생성을 눌러 주세요"}
                    description={
                      loading
                        ? "잠시만 기다려 주세요"
                        : customStyle
                          ? "추출한 레퍼런스 스타일이 적용돼요"
                          : "템플릿을 고르고 소재를 입력하면 카드 4장을 만들어요"
                    }
                    className="size-full rounded-r4 border border-dashed border-stroke-neutral-weak bg-bg-layer-fill font-sans"
                  />
                ) : slide ? (
                  <>
                    {template === "announcement" && <AnnouncementCard slide={slide} slideIndex={currentSlide} totalSlides={slides.length} inputs={ann} customStyle={customStyle ?? undefined} />}
                    {template === "study-tip" && <StudyTipCard slide={slide} slideIndex={currentSlide} totalSlides={slides.length} inputs={tip} customStyle={customStyle ?? undefined} />}
                    {template === "top-student" && <TopStudentCard slide={slide} slideIndex={currentSlide} totalSlides={slides.length} inputs={top} customStyle={customStyle ?? undefined} />}
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* 이전·다음 + 슬라이드 선택 */}
          {slides.length > 0 && (
            <div className="mt-x4 flex items-center justify-center gap-x2">
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                aria-label="이전 장"
                onClick={() => setCurrentSlide((c) => Math.max(0, c - 1))}
                disabled={currentSlide === 0 || slides.length === 0}
              >
                <ChevronLeft aria-hidden />
              </Button>
              <div className="flex flex-wrap justify-center gap-x1_5" role="group" aria-label="슬라이드 선택">
                {slides.map((s, i) => (
                  <FilterChip
                    key={i}
                    selected={i === currentSlide}
                    count={i + 1}
                    onClick={() => setCurrentSlide(i)}
                  >
                    {SLIDE_LABELS[s.type]}
                  </FilterChip>
                ))}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                aria-label="다음 장"
                onClick={() => setCurrentSlide((c) => Math.min(slides.length - 1, c + 1))}
                disabled={currentSlide >= slides.length - 1 || slides.length === 0}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
