import { describe, it, expect } from "vitest";
import {
  normalizeAnswer,
  splitMeaning,
  expandExpected,
  buildPrompt,
  isAnswerCorrect,
} from "@/lib/vocab-grade";
import { mulberry32, seededShuffle, newShuffleSeed } from "@/lib/vocab-shuffle";
import { parseCsv, parseVocabCsv } from "@/lib/csv";

describe("normalizeAnswer", () => {
  it("trims, lowercases, collapses inner whitespace", () => {
    expect(normalizeAnswer("  Apple  ")).toBe("apple");
    expect(normalizeAnswer("New   York")).toBe("new york");
    expect(normalizeAnswer("RUN")).toBe("run");
  });
  it("strips leading/trailing punctuation", () => {
    expect(normalizeAnswer("사과.")).toBe("사과");
    expect(normalizeAnswer("apple,")).toBe("apple");
    expect(normalizeAnswer("·달리다…")).toBe("달리다");
  });
});

describe("splitMeaning", () => {
  it("splits on slash / comma / semicolon", () => {
    expect(splitMeaning("사과 / 사과나무")).toEqual(["사과", "사과나무"]);
    expect(splitMeaning("달리다, 운영하다; 흐르다")).toEqual([
      "달리다",
      "운영하다",
      "흐르다",
    ]);
  });
  it("adds a paren-stripped variant", () => {
    const out = splitMeaning("(속어) 멋진 것");
    expect(out).toContain("(속어) 멋진 것");
    expect(out).toContain("멋진 것");
  });
});

describe("expandExpected", () => {
  it("EN_TO_KO expands all meanings", () => {
    expect(
      expandExpected({ word: "run", meanings: ["달리다", "운영하다 / 경영하다"] }, "EN_TO_KO")
    ).toEqual(["달리다", "운영하다", "경영하다"]);
  });
  it("KO_TO_EN returns the word, split on slash", () => {
    expect(expandExpected({ word: "color / colour", meanings: ["색"] }, "KO_TO_EN")).toEqual([
      "color",
      "colour",
    ]);
  });
});

describe("buildPrompt", () => {
  it("shows word for EN_TO_KO, meanings for KO_TO_EN", () => {
    expect(buildPrompt({ word: "apple", meanings: ["사과"] }, "EN_TO_KO")).toBe("apple");
    expect(buildPrompt({ word: "run", meanings: ["달리다", "운영하다"] }, "KO_TO_EN")).toBe(
      "달리다 / 운영하다"
    );
  });
});

describe("isAnswerCorrect", () => {
  const expected = expandExpected(
    { word: "run", meanings: ["달리다", "운영하다 / 경영하다"] },
    "EN_TO_KO"
  );
  it("accepts any one of multiple meanings", () => {
    expect(isAnswerCorrect("달리다", expected)).toBe(true);
    expect(isAnswerCorrect(" 경영하다 ", expected)).toBe(true);
  });
  it("is case/space/punct insensitive", () => {
    expect(isAnswerCorrect("APPLE", expandExpected({ word: "apple", meanings: ["사과"] }, "KO_TO_EN"))).toBe(
      true
    );
  });
  it("rejects empty and wrong answers", () => {
    expect(isAnswerCorrect("", expected)).toBe(false);
    expect(isAnswerCorrect(null, expected)).toBe(false);
    expect(isAnswerCorrect("먹다", expected)).toBe(false);
  });
});

describe("parseCsv", () => {
  it("handles quoted fields with commas and newlines", () => {
    const out = parseCsv('a,"b,c",d\n"line1\nline2",x,y\n');
    expect(out).toEqual([
      ["a", "b,c", "d"],
      ["line1\nline2", "x", "y"],
    ]);
  });
  it("handles escaped quotes and skips blank lines", () => {
    const out = parseCsv('"he said ""hi""",2\n\n\n3,4');
    expect(out).toEqual([
      ['he said "hi"', "2"],
      ["3", "4"],
    ]);
  });
});

describe("parseVocabCsv", () => {
  it("parses headerless word,meaning rows", () => {
    const res = parseVocabCsv("apple,사과,Day 1\nrun,달리다;운영하다,Day 1");
    expect(res.errors).toEqual([]);
    expect(res.rows).toEqual([
      { word: "apple", meanings: ["사과"], unit: "Day 1", partOfSpeech: null, example: null },
      {
        word: "run",
        meanings: ["달리다", "운영하다"],
        unit: "Day 1",
        partOfSpeech: null,
        example: null,
      },
    ]);
  });
  it("recognizes a header row with Korean column names", () => {
    const res = parseVocabCsv("단어,뜻,Day\nbook,책,12");
    expect(res.errors).toEqual([]);
    expect(res.rows[0]).toMatchObject({ word: "book", meanings: ["책"], unit: "12" });
  });
  it("reports rows missing word or meaning", () => {
    const res = parseVocabCsv("apple,사과\n,없음\nrun,");
    expect(res.rows).toHaveLength(1);
    expect(res.errors.length).toBe(2);
  });
});

describe("vocab-shuffle (per-attempt isolation)", () => {
  const pool = Array.from({ length: 30 }, (_, i) => `w${i}`);

  it("mulberry32 is deterministic for the same seed", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("seededShuffle is deterministic for the same seed", () => {
    const a = seededShuffle(pool, 42);
    const b = seededShuffle(pool, 42);
    expect(a).toEqual(b);
    // 셔플은 비파괴: 원본 보존
    expect(pool).toEqual(Array.from({ length: 30 }, (_, i) => `w${i}`));
  });

  it("different seeds produce different orders (per-student isolation)", () => {
    const a = seededShuffle(pool, 1);
    const b = seededShuffle(pool, 2);
    expect(a).not.toEqual(b);
    // 두 결과 모두 같은 단어 집합을 포함해야 함(permutation)
    expect([...a].sort()).toEqual([...b].sort());
  });

  it("seededShuffle with null seed returns original order (legacy)", () => {
    expect(seededShuffle(pool, null)).toEqual(pool);
    expect(seededShuffle(pool, undefined)).toEqual(pool);
  });

  it("newShuffleSeed returns a non-negative 31-bit int", () => {
    for (let i = 0; i < 10; i++) {
      const s = newShuffleSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(0x7fffffff);
    }
  });
});
