import type { Slide, TopStudentInputs, ExtractedStyle } from "@/actions/card-news";

interface Props {
  slide: Slide;
  slideIndex: number;
  totalSlides: number;
  inputs: TopStudentInputs;
  customStyle?: ExtractedStyle;
}

export function TopStudentCard({ slide, slideIndex, totalSlides, inputs, customStyle: cs }: Props) {
  const bg = cs?.background ?? "linear-gradient(160deg, #1a1a1a 0%, #2d2016 40%, #1a1200 100%)";
  const accent = cs?.accentColor ?? "#d4af37";
  const hColor = cs?.headlineColor ?? "#d4af37";
  const bColor = cs?.bodyColor ?? "rgba(255,255,255,0.7)";
  const badgeBg = cs?.badgeBg ?? "rgba(212,175,55,0.1)";
  const badgeBorder = cs?.badgeBorder ?? "rgba(212,175,55,0.3)";
  const badgeText = cs?.badgeText ?? "#d4af37";
  const cardBg = cs?.cardBg ?? "rgba(212,175,55,0.06)";
  const cardBorder = cs?.cardBorder ?? "rgba(212,175,55,0.15)";
  const isLight = cs?.brightness === "light";
  const dimText = isLight ? "rgba(0,0,0,0.4)" : `${accent}99`;
  const studentList = inputs.students ? inputs.students.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : [];

  const Indicator = () => (
    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
      {Array.from({ length: totalSlides }).map((_, i) => (
        <div key={i} style={{
          width: i === slideIndex ? 16 : 5, height: 5, borderRadius: 3,
          background: i === slideIndex ? accent : `${accent}40`,
        }} />
      ))}
    </div>
  );

  // ── 표지
  if (slide.type === "cover") {
    return (
      <div style={{ width: "100%", height: "100%", background: bg, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -100, left: "50%", transform: "translateX(-50%)", width: 380, height: 380, borderRadius: "50%", background: `radial-gradient(circle, ${accent}20 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", left: 0, top: "15%", bottom: "15%", width: 2, background: `linear-gradient(to bottom, transparent, ${accent}4d, transparent)` }} />
        <div style={{ position: "absolute", right: 0, top: "15%", bottom: "15%", width: 2, background: `linear-gradient(to bottom, transparent, ${accent}4d, transparent)` }} />

        <div style={{ padding: "32px 44px 0", textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 6 }}>🏆</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: badgeBg, border: `1px solid ${badgeBorder}`, borderRadius: 6, padding: "4px 12px" }}>
            <span style={{ color: badgeText, fontSize: 10, fontWeight: 800, letterSpacing: "0.1em" }}>🌟 ACHIEVEMENT</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 44px", textAlign: "center" }}>
          {inputs.period && (
            <p style={{ color: dimText, fontSize: 11, marginBottom: 8, letterSpacing: "0.06em" }}>{inputs.period} · {inputs.subject}</p>
          )}
          <h1 style={{ color: hColor, fontSize: 32, fontWeight: 900, lineHeight: 1.2, marginBottom: 8, letterSpacing: "-0.02em" }}>
            {slide.headline}
          </h1>
          <p style={{ color: bColor, fontSize: 14, marginBottom: 20 }}>{slide.subheadline}</p>
          <div style={{ background: cardBg, borderRadius: 10, padding: "14px 18px", border: `1px solid ${cardBorder}` }}>
            <p style={{ color: bColor, fontSize: 13, lineHeight: 1.8 }}>{slide.body}</p>
          </div>
        </div>

        <div style={{ padding: "0 44px 28px" }}><Indicator /></div>
        <div style={{ position: "absolute", bottom: 10, right: 16, color: "rgba(255,255,255,0.1)", fontSize: 9, letterSpacing: "0.06em" }}>KHSB BackOffice</div>
      </div>
    );
  }

  // ── 본문
  if (slide.type === "body") {
    return (
      <div style={{ width: "100%", height: "100%", background: bg, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: "15%", bottom: "15%", width: 2, background: `linear-gradient(to bottom, transparent, ${accent}4d, transparent)` }} />
        <div style={{ position: "absolute", right: 0, top: "15%", bottom: "15%", width: 2, background: `linear-gradient(to bottom, transparent, ${accent}4d, transparent)` }} />

        <div style={{ padding: "32px 44px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: badgeBg, border: `1px solid ${badgeBorder}`, borderRadius: 6, padding: "4px 10px" }}>
            <span style={{ color: badgeText, fontSize: 10, fontWeight: 800 }}>★ DETAIL</span>
          </div>
          <span style={{ color: dimText, fontSize: 10 }}>{slideIndex + 1} / {totalSlides}</span>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 44px" }}>
          <h2 style={{ color: hColor, fontSize: 24, fontWeight: 800, lineHeight: 1.2, marginBottom: 6, letterSpacing: "-0.02em" }}>
            {slide.headline}
          </h2>
          <p style={{ color: bColor, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>{slide.subheadline}</p>

          {/* 학생 이름 뱃지 (첫 번째 본문 슬라이드에서) */}
          {slideIndex === 1 && studentList.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {studentList.map((name, i) => (
                <div key={i} style={{ background: `linear-gradient(135deg, ${accent}26, ${accent}0d)`, border: `1px solid ${accent}59`, borderRadius: 8, padding: "7px 14px", display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ color: accent, fontSize: 10 }}>★</span>
                  <span style={{ color: isLight ? "#000" : "#fff", fontSize: 14, fontWeight: 700 }}>{name}</span>
                </div>
              ))}
            </div>
          )}

          {slide.items && slide.items.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {slide.items.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: cardBg, borderRadius: 8, padding: "10px 14px", border: `1px solid ${cardBorder}` }}>
                  <span style={{ color: accent, fontSize: 12, marginTop: 1 }}>◆</span>
                  <span style={{ color: bColor, fontSize: 13, lineHeight: 1.5, flex: 1 }}>{item}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: cardBg, borderRadius: 10, padding: "14px 16px", border: `1px solid ${cardBorder}` }}>
              <p style={{ color: bColor, fontSize: 13, lineHeight: 1.8, textAlign: "center", whiteSpace: "pre-line" }}>{slide.body}</p>
            </div>
          )}
        </div>

        <div style={{ padding: "0 44px 28px" }}><Indicator /></div>
        <div style={{ position: "absolute", bottom: 10, right: 16, color: "rgba(255,255,255,0.1)", fontSize: 9, letterSpacing: "0.06em" }}>KHSB BackOffice</div>
      </div>
    );
  }

  // ── 마무리
  return (
    <div style={{ width: "100%", height: "100%", background: bg, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", bottom: -80, left: "50%", transform: "translateX(-50%)", width: 300, height: 300, borderRadius: "50%", background: `radial-gradient(circle, ${accent}18 0%, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ position: "absolute", left: 0, top: "15%", bottom: "15%", width: 2, background: `linear-gradient(to bottom, transparent, ${accent}4d, transparent)` }} />
      <div style={{ position: "absolute", right: 0, top: "15%", bottom: "15%", width: 2, background: `linear-gradient(to bottom, transparent, ${accent}4d, transparent)` }} />

      <div style={{ padding: "36px 44px 0", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: badgeBg, border: `1px solid ${badgeBorder}`, borderRadius: 6, padding: "5px 12px" }}>
          <span style={{ color: badgeText, fontSize: 11, fontWeight: 800 }}>🎉 CLOSING</span>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 44px", textAlign: "center" }}>
        <h2 style={{ color: hColor, fontSize: 28, fontWeight: 900, lineHeight: 1.2, marginBottom: 8, letterSpacing: "-0.02em" }}>
          {slide.headline}
        </h2>
        <p style={{ color: bColor, fontSize: 14, marginBottom: 20 }}>{slide.subheadline}</p>
        <div style={{ background: cardBg, borderRadius: 10, padding: "14px 18px", border: `1px solid ${cardBorder}`, marginBottom: 20 }}>
          <p style={{ color: bColor, fontSize: 13, lineHeight: 1.8 }}>{slide.body}</p>
        </div>
        {slide.callToAction && (
          <div style={{ background: accent, borderRadius: 8, padding: "11px 20px", display: "inline-block", margin: "0 auto" }}>
            <span style={{ color: isLight ? "#000" : "#1a1200", fontSize: 14, fontWeight: 800 }}>🎉 {slide.callToAction}</span>
          </div>
        )}
      </div>

      <div style={{ padding: "0 44px 28px", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
        {slide.hashtags && slide.hashtags.length > 0 && (
          <p style={{ color: `${accent}66`, fontSize: 10, lineHeight: 1.7, textAlign: "center" }}>
            {slide.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join("  ")}
          </p>
        )}
        <Indicator />
      </div>
      <div style={{ position: "absolute", bottom: 10, right: 16, color: "rgba(255,255,255,0.1)", fontSize: 9, letterSpacing: "0.06em" }}>KHSB BackOffice</div>
    </div>
  );
}
