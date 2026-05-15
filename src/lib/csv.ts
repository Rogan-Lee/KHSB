/**
 * 의존성 없는 미니 CSV 파서 (RFC 4180 호환 수준).
 *  - 따옴표(")로 감싼 필드 내 쉼표/줄바꿈 허용, "" → " 이스케이프.
 *  - 구분자 기본 콤마. \r\n / \r / \n 모두 줄바꿈으로 인식.
 *  - 완전히 빈 줄(필드 1개에 빈 문자열뿐)은 건너뜀.
 */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    // 빈 줄(공백/빈 필드만) 스킵
    if (!(row.length === 1 && row[0].trim() === "")) {
      rows.push(row);
    }
    row = [];
  };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r") {
      // \r\n 또는 \r
      pushRow();
      if (text[i + 1] === "\n") i += 2;
      else i++;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // 마지막 줄
  if (field !== "" || row.length > 0) pushRow();
  return rows;
}

export type VocabCsvRow = {
  word: string;
  meanings: string[];
  unit: string | null;
  partOfSpeech: string | null;
  example: string | null;
};

export type VocabCsvParseResult = {
  rows: VocabCsvRow[];
  errors: { line: number; message: string }[];
};

const HEADER_ALIASES: Record<string, keyof VocabCsvRow | "ignore"> = {
  word: "word",
  단어: "word",
  영단어: "word",
  meaning: "meanings",
  meanings: "meanings",
  뜻: "meanings",
  의미: "meanings",
  unit: "unit",
  day: "unit",
  단원: "unit",
  데이: "unit",
  pos: "partOfSpeech",
  partofspeech: "partOfSpeech",
  품사: "partOfSpeech",
  example: "example",
  예문: "example",
};

/**
 * 단어장 CSV 텍스트 파싱.
 *  - 헤더 행이 있으면 컬럼명으로 매핑(word/단어, meaning/뜻, unit/day/단원, pos/품사, example/예문).
 *  - 헤더가 없으면 컬럼 순서: word, meaning, unit?, pos?, example?
 *  - 한 셀 안 복수 뜻은 세미콜론(;) 또는 슬래시(/)로 구분.
 */
export function parseVocabCsv(text: string): VocabCsvParseResult {
  const table = parseCsv(text);
  const errors: { line: number; message: string }[] = [];
  if (table.length === 0) return { rows: [], errors: [{ line: 0, message: "내용이 비어 있습니다." }] };

  // 헤더 감지: 첫 행의 셀들이 모두 알려진 헤더명이면 헤더로 취급
  const first = table[0].map((c) => c.trim().toLowerCase());
  const looksLikeHeader =
    first.length >= 2 && first.some((c) => c in HEADER_ALIASES) && !first.includes("");
  let colMap: (keyof VocabCsvRow | "ignore")[];
  let dataStart = 0;
  if (looksLikeHeader) {
    colMap = first.map((c) => HEADER_ALIASES[c] ?? "ignore");
    dataStart = 1;
  } else {
    colMap = ["word", "meanings", "unit", "partOfSpeech", "example"];
  }

  const rows: VocabCsvRow[] = [];
  for (let r = dataStart; r < table.length; r++) {
    const cells = table[r];
    const lineNo = r + 1;
    const get = (key: keyof VocabCsvRow): string => {
      const idx = colMap.indexOf(key);
      if (idx < 0 || idx >= cells.length) return "";
      return (cells[idx] ?? "").trim();
    };
    const word = get("word");
    const meaningRaw = get("meanings");
    if (!word && !meaningRaw) continue; // 빈 행
    if (!word) {
      errors.push({ line: lineNo, message: "영단어가 비어 있습니다." });
      continue;
    }
    if (!meaningRaw) {
      errors.push({ line: lineNo, message: `"${word}" 의 뜻이 비어 있습니다.` });
      continue;
    }
    const meanings = meaningRaw
      .split(/[;/\n]+/u)
      .map((m) => m.trim())
      .filter(Boolean);
    if (meanings.length === 0) {
      errors.push({ line: lineNo, message: `"${word}" 의 뜻이 비어 있습니다.` });
      continue;
    }
    rows.push({
      word,
      meanings,
      unit: get("unit") || null,
      partOfSpeech: get("partOfSpeech") || null,
      example: get("example") || null,
    });
  }
  if (rows.length === 0 && errors.length === 0) {
    errors.push({ line: 0, message: "유효한 단어 행이 없습니다." });
  }
  return { rows, errors };
}
