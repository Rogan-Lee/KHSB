import type { Slide, AnnouncementInputs, ExtractedStyle } from "@/actions/card-news";

interface Props {
  slide: Slide;
  slideIndex: number;
  totalSlides: number;
  inputs: AnnouncementInputs;
  customStyle?: ExtractedStyle;
}

export function AnnouncementCard({ slide, slideIndex, totalSlides, inputs, customStyle: cs }: Props) {
  const bg = cs?.background ?? "linear-gradient(145deg, #1e3a5f 0%, #0f2240 50%, #0a1628 100%)";
  const hColor = cs?.headlineColor ?? "#ffffff";
  const bColor = cs?.bodyColor ?? "rgba(255,255,255,0.65)";
  const accent = cs?.accentColor ?? "#63b3ed";
  const badgeBg = cs?.badgeBg ?? "rgba(99,179,237,0.15)";
  const badgeBorder = cs?.badgeBorder ?? "rgba(99,179,237,0.3)";
  const badgeText = cs?.badgeText ?? "#63b3ed";
  const cardBg = cs?.cardBg ?? "rgba(255,255,255,0.06)";
  const cardBorder = cs?.cardBorder ?? "rgba(255,255,255,0.1)";
  const isLight = cs?.brightness === "light";
  const dimText = isLight ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)";

  // ── 슬라이드 번호 인디케이터
  const Indicator = () => (
    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
      {Array.from({ length: totalSlides }).map((_, i) => (
        <div key={i} style={{
          width: i === slideIndex ? 16 : 5, height: 5, borderRadius: 3,
          background: i === slideIndex ? accent : `${accent}40`,
          transition: "width 0.2s",
        }} />
      ))}
    </div>
  );

  // ── 표지
  if (slide.type === "cover") {
    return (
      <div style={{ width: "100%", height: "100%", background: bg, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -80, right: -80, width: 280, height: 280, borderRadius: "50%", background: `${accent}14`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -60, left: -60, width: 200, height: 200, borderRadius: "50%", background: `${accent}0d`, pointerEvents: "none" }} />

        <div style={{ padding: "36px 44px 0" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: badgeBg, border: `1px solid ${badgeBorder}`, borderRadius: 6, padding: "5px 12px" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: badgeText }} />
            <span style={{ color: badgeText, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>NOTICE</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 44px" }}>
          {inputs.date && (
            <p style={{ color: dimText, fontSize: 12, marginBottom: 10, letterSpacing: "0.04em" }}>{inputs.date}</p>
          )}
          <h1 style={{ color: hColor, fontSize: 36, fontWeight: 900, lineHeight: 1.15, marginBottom: 14, letterSpacing: "-0.02em" }}>
            {slide.headline}
          </h1>
          <p style={{ color: bColor, fontSize: 16, fontWeight: 500, marginBottom: 24, lineHeight: 1.5 }}>
            {slide.subheadline}
          </p>
          <div style={{ width: 44, height: 3, background: accent, borderRadius: 2, marginBottom: 20 }} />
          <p style={{ color: bColor, fontSize: 13, lineHeight: 1.8 }}>{slide.body}</p>
          {inputs.target && (
            <div style={{ marginTop: 24, display: "inline-flex", alignItems: "center", gap: 8, background: cardBg, borderRadius: 8, padding: "8px 14px", border: `1px solid ${cardBorder}` }}>
              <span style={{ color: dimText, fontSize: 11 }}>대상</span>
              <span style={{ color: hColor, fontSize: 12, fontWeight: 600 }}>{inputs.target}</span>
            </div>
          )}
        </div>

        <div style={{ padding: "0 44px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
          <Indicator />
        </div>
        <div style={{ position: "absolute", bottom: 14, right: 18, color: isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.15)", fontSize: 9, letterSpacing: "0.06em" }}>KHSB BackOffice</div>
      </div>
    );
  }

  // ── 본문
  if (slide.type === "body") {
    return (
      <div style={{ width: "100%", height: "100%", background: bg, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: `${accent}0a`, pointerEvents: "none" }} />

        <div style={{ padding: "32px 44px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: badgeBg, border: `1px solid ${badgeBorder}`, borderRadius: 6, padding: "4px 10px" }}>
            <span style={{ color: badgeText, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em" }}>DETAIL</span>
          </div>
          <span style={{ color: dimText, fontSize: 10 }}>{slideIndex + 1} / {totalSlides}</span>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "20px 44px" }}>
          <h2 style={{ color: hColor, fontSize: 26, fontWeight: 800, lineHeight: 1.2, marginBottom: 8, letterSpacing: "-0.02em" }}>
            {slide.headline}
          </h2>
          <p style={{ color: bColor, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>{slide.subheadline}</p>

          <div style={{ width: 36, height: 2, background: accent, borderRadius: 2, marginBottom: 18 }} />

          {slide.items && slide.items.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {slide.items.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: cardBg, borderRadius: 8, padding: "10px 14px", border: `1px solid ${cardBorder}` }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ color: isLight ? "#000" : "#fff", fontSize: 10, fontWeight: 800 }}>{i + 1}</span>
                  </div>
                  <span style={{ color: bColor, fontSize: 13, lineHeight: 1.5, flex: 1 }}>{item}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: bColor, fontSize: 13, lineHeight: 1.85, whiteSpace: "pre-line" }}>{slide.body}</p>
          )}
        </div>

        <div style={{ padding: "0 44px 28px" }}><Indicator /></div>
        <div style={{ position: "absolute", bottom: 14, right: 18, color: isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.15)", fontSize: 9, letterSpacing: "0.06em" }}>KHSB BackOffice</div>
      </div>
    );
  }

  // ── 마무리
  return (
    <div style={{ width: "100%", height: "100%", background: bg, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", bottom: -80, right: -80, width: 260, height: 260, borderRadius: "50%", background: `${accent}10`, pointerEvents: "none" }} />

      <div style={{ padding: "36px 44px 0" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: badgeBg, border: `1px solid ${badgeBorder}`, borderRadius: 6, padding: "5px 12px" }}>
          <span style={{ color: badgeText, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>WRAP UP</span>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 44px" }}>
        <h2 style={{ color: hColor, fontSize: 30, fontWeight: 900, lineHeight: 1.2, marginBottom: 10, letterSpacing: "-0.02em" }}>
          {slide.headline}
        </h2>
        <p style={{ color: bColor, fontSize: 14, fontWeight: 500, marginBottom: 20 }}>{slide.subheadline}</p>
        <div style={{ width: 44, height: 3, background: accent, borderRadius: 2, marginBottom: 20 }} />
        <p style={{ color: bColor, fontSize: 13, lineHeight: 1.8, marginBottom: 24 }}>{slide.body}</p>
        {slide.callToAction && (
          <div style={{ background: accent, borderRadius: 8, padding: "11px 20px", display: "inline-block", marginBottom: 16 }}>
            <span style={{ color: isLight ? "#000" : "#fff", fontSize: 14, fontWeight: 700 }}>{slide.callToAction} →</span>
          </div>
        )}
      </div>

      <div style={{ padding: "0 44px 28px", display: "flex", flexDirection: "column", gap: 10 }}>
        {slide.hashtags && slide.hashtags.length > 0 && (
          <p style={{ color: `${badgeText}80`, fontSize: 10, lineHeight: 1.7 }}>
            {slide.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join("  ")}
          </p>
        )}
        <Indicator />
      </div>
      <div style={{ position: "absolute", bottom: 14, right: 18, color: isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.15)", fontSize: 9, letterSpacing: "0.06em" }}>KHSB BackOffice</div>
    </div>
  );
}
