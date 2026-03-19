import type { Slide, StudyTipInputs, ExtractedStyle } from "@/actions/card-news";

interface Props {
  slide: Slide;
  slideIndex: number;
  totalSlides: number;
  inputs: StudyTipInputs;
  customStyle?: ExtractedStyle;
}

const MOOD_STYLES = {
  energetic: {
    bg: "linear-gradient(135deg, #ff6b35 0%, #f7c59f 60%, #ffb347 100%)",
    accent: "#e8490a", badge: "rgba(255,107,53,0.2)", badgeBorder: "rgba(255,107,53,0.4)",
    badgeText: "#c0390a", label: "ENERGY", textPrimary: "#1a0a00", textSecondary: "rgba(26,10,0,0.65)",
  },
  calm: {
    bg: "linear-gradient(135deg, #667eea 0%, #a8c0ff 60%, #8fd3f4 100%)",
    accent: "#4a5fd4", badge: "rgba(255,255,255,0.25)", badgeBorder: "rgba(255,255,255,0.4)",
    badgeText: "#fff", label: "FOCUS", textPrimary: "#ffffff", textSecondary: "rgba(255,255,255,0.75)",
  },
  serious: {
    bg: "linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)",
    accent: "#e94560", badge: "rgba(233,69,96,0.15)", badgeBorder: "rgba(233,69,96,0.35)",
    badgeText: "#e94560", label: "STUDY", textPrimary: "#ffffff", textSecondary: "rgba(255,255,255,0.65)",
  },
};

export function StudyTipCard({ slide, slideIndex, totalSlides, inputs, customStyle: cs }: Props) {
  const m = MOOD_STYLES[inputs.mood];
  const bg = cs?.background ?? m.bg;
  const textPrimary = cs?.headlineColor ?? m.textPrimary;
  const textSecondary = cs?.bodyColor ?? m.textSecondary;
  const accent = cs?.accentColor ?? m.accent;
  const badge = cs?.badgeBg ?? m.badge;
  const badgeBorder = cs?.badgeBorder ?? m.badgeBorder;
  const badgeText = cs?.badgeText ?? m.badgeText;
  const cardBg = cs?.cardBg ?? "rgba(255,255,255,0.1)";
  const cardBorder = cs?.cardBorder ?? "rgba(255,255,255,0.14)";
  const isLight = cs?.brightness === "light";

  const Indicator = () => (
    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
      {Array.from({ length: totalSlides }).map((_, i) => (
        <div key={i} style={{
          width: i === slideIndex ? 16 : 5, height: 5, borderRadius: 3,
          background: i === slideIndex ? (isLight ? accent : "#fff") : (isLight ? `${accent}40` : "rgba(255,255,255,0.25)"),
        }} />
      ))}
    </div>
  );

  // ── 표지
  if (slide.type === "cover") {
    return (
      <div style={{ width: "100%", height: "100%", background: bg, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 420, height: 420, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 280, height: 280, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.04)", pointerEvents: "none" }} />

        <div style={{ padding: "36px 44px 0" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: badge, border: `1px solid ${badgeBorder}`, borderRadius: 6, padding: "5px 12px" }}>
            <span style={{ color: badgeText, fontSize: 11, fontWeight: 800, letterSpacing: "0.1em" }}>💡 {m.label}</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 44px" }}>
          <p style={{ color: textSecondary, fontSize: 12, marginBottom: 10, fontWeight: 500 }}>{inputs.topic}</p>
          <h1 style={{ color: textPrimary, fontSize: 36, fontWeight: 900, lineHeight: 1.15, marginBottom: 14, letterSpacing: "-0.03em" }}>
            {slide.headline}
          </h1>
          <p style={{ color: textSecondary, fontSize: 15, fontWeight: 600, marginBottom: 20 }}>{slide.subheadline}</p>
          <div style={{ background: cardBg, borderRadius: 10, padding: "14px 16px", border: `1px solid ${cardBorder}` }}>
            <p style={{ color: textPrimary, fontSize: 13, lineHeight: 1.8, opacity: 0.9 }}>{slide.body}</p>
          </div>
        </div>

        <div style={{ padding: "0 44px 28px" }}><Indicator /></div>
        <div style={{ position: "absolute", bottom: 14, right: 18, color: "rgba(255,255,255,0.15)", fontSize: 9, letterSpacing: "0.06em" }}>KHSB BackOffice</div>
      </div>
    );
  }

  // ── 본문
  if (slide.type === "body") {
    return (
      <div style={{ width: "100%", height: "100%", background: bg, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
        <div style={{ padding: "32px 44px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: badge, border: `1px solid ${badgeBorder}`, borderRadius: 6, padding: "4px 10px" }}>
            <span style={{ color: badgeText, fontSize: 10, fontWeight: 800 }}>POINT {slideIndex}</span>
          </div>
          <span style={{ color: textSecondary, fontSize: 10, opacity: 0.7 }}>{slideIndex + 1} / {totalSlides}</span>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 44px" }}>
          <h2 style={{ color: textPrimary, fontSize: 26, fontWeight: 900, lineHeight: 1.2, marginBottom: 6, letterSpacing: "-0.02em" }}>
            {slide.headline}
          </h2>
          <p style={{ color: textSecondary, fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>{slide.subheadline}</p>

          {slide.items && slide.items.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {slide.items.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: cardBg, borderRadius: 8, padding: "10px 14px", border: `1px solid ${cardBorder}` }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: isLight ? accent : "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ color: isLight ? "#fff" : textPrimary, fontSize: 11, fontWeight: 800 }}>{i + 1}</span>
                  </div>
                  <span style={{ color: textPrimary, fontSize: 13, lineHeight: 1.5, flex: 1, opacity: 0.9 }}>{item}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: cardBg, borderRadius: 10, padding: "14px 16px", border: `1px solid ${cardBorder}` }}>
              <p style={{ color: textPrimary, fontSize: 13, lineHeight: 1.85, whiteSpace: "pre-line", opacity: 0.9 }}>{slide.body}</p>
            </div>
          )}
        </div>

        <div style={{ padding: "0 44px 28px" }}><Indicator /></div>
        <div style={{ position: "absolute", bottom: 14, right: 18, color: "rgba(255,255,255,0.15)", fontSize: 9, letterSpacing: "0.06em" }}>KHSB BackOffice</div>
      </div>
    );
  }

  // ── 마무리
  return (
    <div style={{ width: "100%", height: "100%", background: bg, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div style={{ padding: "36px 44px 0" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: badge, border: `1px solid ${badgeBorder}`, borderRadius: 6, padding: "5px 12px" }}>
          <span style={{ color: badgeText, fontSize: 11, fontWeight: 800 }}>✨ WRAP UP</span>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 44px" }}>
        <h2 style={{ color: textPrimary, fontSize: 30, fontWeight: 900, lineHeight: 1.2, marginBottom: 10, letterSpacing: "-0.03em" }}>
          {slide.headline}
        </h2>
        <p style={{ color: textSecondary, fontSize: 14, fontWeight: 600, marginBottom: 20 }}>{slide.subheadline}</p>
        <div style={{ background: cardBg, borderRadius: 10, padding: "14px 16px", border: `1px solid ${cardBorder}`, marginBottom: 20 }}>
          <p style={{ color: textPrimary, fontSize: 13, lineHeight: 1.8, opacity: 0.9 }}>{slide.body}</p>
        </div>
        {slide.callToAction && (
          <div style={{ background: isLight ? accent : "rgba(255,255,255,0.15)", borderRadius: 8, padding: "11px 20px", display: "inline-block" }}>
            <span style={{ color: isLight ? "#fff" : textPrimary, fontSize: 14, fontWeight: 800 }}>✨ {slide.callToAction}</span>
          </div>
        )}
      </div>

      <div style={{ padding: "0 44px 28px", display: "flex", flexDirection: "column", gap: 10 }}>
        {slide.hashtags && slide.hashtags.length > 0 && (
          <p style={{ color: textSecondary, fontSize: 10, lineHeight: 1.7, opacity: 0.7 }}>
            {slide.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join("  ")}
          </p>
        )}
        <Indicator />
      </div>
      <div style={{ position: "absolute", bottom: 14, right: 18, color: "rgba(255,255,255,0.15)", fontSize: 9, letterSpacing: "0.06em" }}>KHSB BackOffice</div>
    </div>
  );
}
