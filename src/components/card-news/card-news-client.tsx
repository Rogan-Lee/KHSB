"use client";

import { useState, useRef } from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Sparkles, Download, RefreshCw, Megaphone, Lightbulb, Trophy, ImagePlus, Link, X, ScanSearch, ChevronLeft, ChevronRight, DownloadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const TEMPLATES: { id: CardNewsTemplate; label: string; desc: string; icon: React.ElementType; color: string }[] = [
  { id: "announcement", label: "공지/이벤트", desc: "학원 공지, 행사 홍보", icon: Megaphone, color: "text-blue-600" },
  { id: "study-tip", label: "학습 팁/동기부여", desc: "공부법, 동기부여 콘텐츠", icon: Lightbulb, color: "text-amber-500" },
  { id: "top-student", label: "성적 우수자 발표", desc: "우수 학생 시상, 칭찬", icon: Trophy, color: "text-emerald-600" },
];

const SLIDE_LABELS: Record<string, string> = { cover: "표지", body: "본문", closing: "마무리" };

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
    <div className="grid grid-cols-[400px_1fr] gap-6 items-start">
      {/* ── 좌측 패널 ── */}
      <div className="space-y-5">
        {/* 템플릿 선택 */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">템플릿 선택</Label>
          <div className="grid grid-cols-1 gap-2">
            {TEMPLATES.map((t) => {
              const Icon = t.icon;
              const active = template === t.id;
              return (
                <button key={t.id} onClick={() => { setTemplate(t.id); setSlides([]); setCurrentSlide(0); }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${active ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/50"}`}>
                  <Icon className={`h-4 w-4 shrink-0 ${active ? t.color : "text-muted-foreground"}`} />
                  <div>
                    <p className={`text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{t.label}</p>
                    <p className="text-xs text-muted-foreground/70">{t.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 레퍼런스 스타일 */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ScanSearch className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">레퍼런스 스타일 (선택)</p>
          </div>
          <p className="text-xs text-muted-foreground/70">참고 이미지를 올리면 색상·분위기를 추출해 카드에 적용합니다.</p>

          {!refPreview ? (
            <div className="space-y-2">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-5 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 transition-all text-sm text-muted-foreground hover:text-foreground">
                <ImagePlus className="h-4 w-4" />이미지 파일 업로드
              </button>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="이미지 URL (.jpg, .png)" className="pl-8 text-xs" value={refUrl}
                    onChange={(e) => setRefUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAnalyze()} />
                </div>
                <Button size="sm" variant="outline" onClick={handleAnalyze} disabled={analyzing || !refUrl.trim()}>
                  {analyzing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "분석"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative rounded-lg overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={refPreview} alt="레퍼런스" className="w-full h-28 object-cover" />
                <button onClick={clearReference} className="absolute top-1.5 right-1.5 p-1 rounded-full bg-background/80 border border-border hover:bg-accent transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {customStyle ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-50 border border-green-200">
                  <div className="flex gap-1">
                    {[customStyle.background, customStyle.accentColor, customStyle.headlineColor].map((c, i) => (
                      <div key={i} style={{ background: c, width: 14, height: 14, borderRadius: 3, border: "1px solid rgba(0,0,0,0.1)" }} />
                    ))}
                  </div>
                  <span className="text-xs text-green-700 font-medium">스타일 추출 완료</span>
                  <button onClick={() => setCustomStyle(null)} className="ml-auto text-xs text-green-600 hover:text-green-800 underline">초기화</button>
                </div>
              ) : (
                <Button className="w-full" variant="outline" size="sm" onClick={handleAnalyze} disabled={analyzing}>
                  {analyzing ? <><RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />분석 중...</> : <><ScanSearch className="h-3.5 w-3.5 mr-2" />스타일 분석하기</>}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* 소재 입력 */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">소재 입력</p>

          {template === "announcement" && (<>
            <div className="space-y-1"><Label className="text-xs">제목</Label><Input placeholder="예: 2월 학원 설명회 개최" value={ann.title} onChange={(e) => setAnn({ ...ann, title: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">날짜/기간</Label><Input placeholder="예: 2025년 2월 15일 (토) 오후 2시" value={ann.date} onChange={(e) => setAnn({ ...ann, date: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">대상</Label><Input placeholder="예: 전체 원생 및 학부모" value={ann.target} onChange={(e) => setAnn({ ...ann, target: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">주요 내용</Label><Textarea placeholder="예: 신규 커리큘럼 설명, 자기소개서 특강 안내" rows={3} value={ann.details} onChange={(e) => setAnn({ ...ann, details: e.target.value })} /></div>
          </>)}

          {template === "study-tip" && (<>
            <div className="space-y-1"><Label className="text-xs">주제</Label><Input placeholder="예: 수능 D-100 시간 관리법" value={tip.topic} onChange={(e) => setTip({ ...tip, topic: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">핵심 메시지/소재</Label><Textarea placeholder="예: 포모도로 기법 25분 집중 5분 휴식" rows={3} value={tip.keyMessage} onChange={(e) => setTip({ ...tip, keyMessage: e.target.value })} /></div>
            <div className="space-y-1">
              <Label className="text-xs">분위기</Label>
              <div className="flex gap-2">
                {(["energetic", "calm", "serious"] as const).map((m) => {
                  const labels = { energetic: "활기차게", calm: "차분하게", serious: "진지하게" };
                  return (
                    <button key={m} onClick={() => setTip({ ...tip, mood: m })}
                      className={`flex-1 py-1.5 text-xs rounded-md border transition-all ${tip.mood === m ? "border-primary bg-primary/5 text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                      {labels[m]}
                    </button>
                  );
                })}
              </div>
            </div>
          </>)}

          {template === "top-student" && (<>
            <div className="space-y-1"><Label className="text-xs">기간</Label><Input placeholder="예: 2025년 1월" value={top.period} onChange={(e) => setTop({ ...top, period: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">우수 학생 이름</Label><Input placeholder="예: 김민준, 이서연, 박지호" value={top.students} onChange={(e) => setTop({ ...top, students: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">과목/분야</Label><Input placeholder="예: 수학, 영어, 전과목" value={top.subject} onChange={(e) => setTop({ ...top, subject: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">추가 메시지</Label><Textarea placeholder="예: 꾸준한 노력으로 놀라운 성장을 이루었습니다" rows={2} value={top.message} onChange={(e) => setTop({ ...top, message: e.target.value })} /></div>
          </>)}

          <Button className="w-full" onClick={handleGenerate} disabled={loading}>
            {loading ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />AI 생성 중...</> : <><Sparkles className="h-4 w-4 mr-2" />AI 카드뉴스 생성 (4장)</>}
          </Button>
        </div>

        {/* 슬라이드 텍스트 편집 */}
        {slide && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">텍스트 수정</p>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{SLIDE_LABELS[slide.type]} {currentSlide + 1}/{slides.length}</span>
            </div>
            <div className="space-y-2">
              <div className="space-y-1"><Label className="text-xs">헤드라인</Label>
                <Input value={slide.headline} onChange={(e) => { const s = [...slides]; s[currentSlide] = { ...s[currentSlide], headline: e.target.value }; setSlides(s); }} className="text-sm font-semibold" />
              </div>
              <div className="space-y-1"><Label className="text-xs">서브 헤드라인</Label>
                <Input value={slide.subheadline} onChange={(e) => { const s = [...slides]; s[currentSlide] = { ...s[currentSlide], subheadline: e.target.value }; setSlides(s); }} className="text-sm" />
              </div>
              <div className="space-y-1"><Label className="text-xs">본문</Label>
                <Textarea rows={3} value={slide.body} onChange={(e) => { const s = [...slides]; s[currentSlide] = { ...s[currentSlide], body: e.target.value }; setSlides(s); }} className="text-sm resize-none" />
              </div>
              {slide.items && (
                <div className="space-y-1"><Label className="text-xs">항목 (줄바꿈으로 구분)</Label>
                  <Textarea rows={3} value={slide.items.join("\n")}
                    onChange={(e) => { const s = [...slides]; s[currentSlide] = { ...s[currentSlide], items: e.target.value.split("\n").filter(Boolean) }; setSlides(s); }}
                    className="text-sm resize-none" />
                </div>
              )}
              {slide.callToAction !== undefined && (
                <div className="space-y-1"><Label className="text-xs">CTA</Label>
                  <Input value={slide.callToAction ?? ""} onChange={(e) => { const s = [...slides]; s[currentSlide] = { ...s[currentSlide], callToAction: e.target.value }; setSlides(s); }} className="text-sm" />
                </div>
              )}
              {slide.hashtags && (
                <div className="space-y-1"><Label className="text-xs">해시태그</Label>
                  <Input value={slide.hashtags.join(" ")} onChange={(e) => { const s = [...slides]; s[currentSlide] = { ...s[currentSlide], hashtags: e.target.value.split(/\s+/).filter(Boolean) }; setSlides(s); }} className="text-xs text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 우측: 미리보기 ── */}
      <div className="space-y-3 sticky top-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">미리보기 (1080×1080)</Label>
            {customStyle && <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full font-medium">레퍼런스 적용됨</span>}
          </div>
          {slides.length > 0 && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleDownloadCurrent} disabled={downloadingAll}>
                <Download className="h-3.5 w-3.5 mr-1.5" />이 장
              </Button>
              <Button size="sm" onClick={handleDownloadAll} disabled={downloadingAll}>
                {downloadingAll ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <DownloadCloud className="h-3.5 w-3.5 mr-1.5" />}
                전체 {slides.length}장
              </Button>
            </div>
          )}
        </div>

        {/* 카드 + 좌우 네비게이션 */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentSlide((c) => Math.max(0, c - 1))}
            disabled={currentSlide === 0 || slides.length === 0}
            className="h-10 w-10 rounded-full border border-border bg-background flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 shrink-0">
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex-1 flex justify-center">
            <div ref={cardRef} style={{ width: 480, height: 480, fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" }}
              className="shrink-0 rounded-xl overflow-hidden shadow-2xl">
              {slides.length === 0 ? (
                <div className="w-full h-full bg-muted/30 flex items-center justify-center rounded-xl border border-dashed border-border">
                  <p className="text-sm text-muted-foreground text-center px-6">
                    {customStyle ? "스타일 적용됨.\n소재를 입력하고 AI 생성을 눌러주세요." : "소재를 입력하고\nAI 카드뉴스 생성을 눌러주세요."}
                  </p>
                </div>
              ) : slide ? (
                <>
                  {template === "announcement" && <AnnouncementCard slide={slide} slideIndex={currentSlide} totalSlides={slides.length} inputs={ann} customStyle={customStyle ?? undefined} />}
                  {template === "study-tip" && <StudyTipCard slide={slide} slideIndex={currentSlide} totalSlides={slides.length} inputs={tip} customStyle={customStyle ?? undefined} />}
                  {template === "top-student" && <TopStudentCard slide={slide} slideIndex={currentSlide} totalSlides={slides.length} inputs={top} customStyle={customStyle ?? undefined} />}
                </>
              ) : null}
            </div>
          </div>

          <button
            onClick={() => setCurrentSlide((c) => Math.min(slides.length - 1, c + 1))}
            disabled={currentSlide >= slides.length - 1 || slides.length === 0}
            className="h-10 w-10 rounded-full border border-border bg-background flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 shrink-0">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* 슬라이드 섬네일 탭 */}
        {slides.length > 0 && (
          <div className="flex justify-center gap-2">
            {slides.map((s, i) => (
              <button key={i} onClick={() => setCurrentSlide(i)}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg border transition-all ${i === currentSlide ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/50"}`}>
                <span className={`text-xs font-medium ${i === currentSlide ? "text-primary" : "text-muted-foreground"}`}>
                  {SLIDE_LABELS[s.type]}
                </span>
                <span className={`text-[10px] ${i === currentSlide ? "text-primary/70" : "text-muted-foreground/60"}`}>
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
