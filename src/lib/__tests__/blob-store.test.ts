import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/blob", () => ({ del: vi.fn(), get: vi.fn(), put: vi.fn() }));

import { del, put } from "@vercel/blob";

import {
  deleteBlobFiles,
  directUploadStore,
  fileUrlForPathname,
  normalizeIncomingFileUrl,
  pathnameFromFileUrl,
  putStudentFile,
  signFileUrl,
  signFileUrls,
  uploadedFileUrlUnder,
  verifyFileSignature,
} from "@/lib/blob-store";
import { sanitizeIncomingAttachments, sanitizePortalAttachments } from "@/lib/portal-attachments";

const PRIVATE = "vercel_blob_rw_privstore_secret";
const PUBLIC = "vercel_blob_rw_pubstore_secret";
const FILE = "family-chat/stu-1/uuid-사진 (1)#?.jpg";
const PUBLIC_URL = "https://pubstore.public.blob.vercel-storage.com/family-chat/stu-1/a.jpg";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", PUBLIC);
  vi.stubEnv("BLOB_PRIVATE_READ_WRITE_TOKEN", PRIVATE);
});
afterEach(() => vi.unstubAllEnvs());

describe("내부 경로", () => {
  it("한글·공백·괄호·#? 가 있어도 한 덩어리 주소로 왕복한다", () => {
    const url = fileUrlForPathname(FILE);
    expect(url).toMatch(/^\/api\/files\/[A-Za-z0-9\-._~%/]+$/);
    expect(pathnameFromFileUrl(url)).toBe(FILE);
    expect(pathnameFromFileUrl(`${url}?e=1&s=x`)).toBe(FILE);
  });

  it("경로 조작·내부 경로가 아닌 값은 거른다", () => {
    expect(pathnameFromFileUrl("/api/files/a/%2E%2E/b")).toBeNull();
    expect(pathnameFromFileUrl("/api/files/a//b")).toBeNull();
    expect(pathnameFromFileUrl("/api/files/a%5Cb")).toBeNull();
    expect(pathnameFromFileUrl("/api/files/%E0%A4%A")).toBeNull();
    expect(pathnameFromFileUrl(PUBLIC_URL)).toBeNull();
  });
});

describe("서명", () => {
  const now = Date.UTC(2026, 10, 27, 3, 30);

  it("서명한 주소는 통과하고, 경로를 바꾸거나 기한이 지나면 막힌다", () => {
    const signed = new URL(signFileUrl(fileUrlForPathname(FILE), "", now), "https://app.test");
    const e = signed.searchParams.get("e");
    const s = signed.searchParams.get("s");
    expect(verifyFileSignature(FILE, e, s, now)).toBe(true);
    expect(verifyFileSignature("family-chat/stu-2/uuid-사진 (1)#?.jpg", e, s, now)).toBe(false);
    expect(verifyFileSignature(FILE, e, s, now + 3 * 60 * 60 * 1000)).toBe(false);
    expect(verifyFileSignature(FILE, e, `${s}x`, now)).toBe(false);
    expect(verifyFileSignature(FILE, null, s, now)).toBe(false);
  });

  it("한 시간 안에서는 같은 주소 (앱 이미지 캐시)", () => {
    const url = fileUrlForPathname(FILE);
    expect(signFileUrl(url, "", now)).toBe(signFileUrl(url, "", now + 20 * 60 * 1000));
  });

  it("비공개 저장소가 꺼져 있으면 아무것도 바꾸지 않는다", () => {
    vi.stubEnv("BLOB_PRIVATE_READ_WRITE_TOKEN", "");
    const url = fileUrlForPathname(FILE);
    expect(signFileUrl(url)).toBe(url);
    const data = { a: [{ url }] };
    expect(signFileUrls(data)).toBe(data);
    expect(verifyFileSignature(FILE, "9999999999", "x")).toBe(false);
  });

  it("응답 안의 내부 경로(첨부·마크다운)만 절대 서명 주소로 바꾼다", () => {
    const url = fileUrlForPathname(FILE);
    const out = signFileUrls(
      { files: [{ url }, { url: PUBLIC_URL }], body: `사진 ![x](${url}) 끝`, note: "/api/files 설명" },
      "https://app.test",
    );
    expect(out.files[0].url).toMatch(/^https:\/\/app\.test\/api\/files\/.+\?e=\d+&s=/);
    expect(out.files[1].url).toBe(PUBLIC_URL);
    expect(out.body).toMatch(/\]\(https:\/\/app\.test\/api\/files\/.+\?e=\d+&s=[^)]+\) 끝$/);
    expect(out.note).toBe("/api/files 설명");
  });
});

describe("클라가 보낸 첨부 주소", () => {
  const stored = fileUrlForPathname(FILE);

  it("서명된 내부 주소(상대·절대)는 서명을 떼고, 서명 없는 내부 주소·저장소 원본 주소는 버린다", () => {
    expect(normalizeIncomingFileUrl(signFileUrl(stored))).toBe(stored);
    expect(normalizeIncomingFileUrl(signFileUrl(stored, "https://other.example"))).toBe(stored);
    expect(normalizeIncomingFileUrl(stored)).toBeNull();
    expect(normalizeIncomingFileUrl(`${stored}?e=9999999999&s=forged`)).toBeNull();
    expect(normalizeIncomingFileUrl(`https://privstore.private.blob.vercel-storage.com/${FILE}`)).toBeNull();
    expect(normalizeIncomingFileUrl(PUBLIC_URL)).toBe(PUBLIC_URL);
  });

  it("업로드 하루 뒤까지는 받아 준다 (작성 화면에 오래 둔 경우)", () => {
    const now = Date.now();
    const signed = signFileUrl(stored, "", now);
    expect(normalizeIncomingFileUrl(signed, now + 20 * 60 * 60 * 1000)).toBe(stored);
    expect(normalizeIncomingFileUrl(signed, now + 30 * 60 * 60 * 1000)).toBeNull();
  });

  it("포털 첨부: 새로 받을 때는 서명된 것만, 저장값을 읽을 때는 내부 경로도 통과", () => {
    const attachment = (url: string) => ({ url, name: "a.jpg", sizeBytes: 1, mimeType: "image/jpeg" });
    expect(sanitizeIncomingAttachments([attachment(stored)], 5)).toEqual([]);
    expect(sanitizeIncomingAttachments([attachment(signFileUrl(stored))], 5)).toEqual([attachment(stored)]);
    expect(sanitizePortalAttachments([attachment(stored), attachment("javascript:alert(1)")], 5)).toEqual([
      attachment(stored),
    ]);
  });

  it("업로드 경로 prefix 확인 — 공개 URL·서명된 내부 주소 모두 같은 규칙", () => {
    const mentoring = fileUrlForPathname("mentoring/m-1/uuid-a.jpg");
    expect(uploadedFileUrlUnder(signFileUrl(mentoring), "mentoring/m-1/")).toBe(mentoring);
    expect(uploadedFileUrlUnder(signFileUrl(mentoring), "mentoring/m-2/")).toBeNull();
    expect(uploadedFileUrlUnder(mentoring, "mentoring/m-1/")).toBeNull();
    expect(uploadedFileUrlUnder(mentoring, "mentoring/m-1/", { stored: true })).toBe(mentoring);
    const pub = "https://pubstore.public.blob.vercel-storage.com/mentoring/m-1/a.jpg";
    expect(uploadedFileUrlUnder(pub, "mentoring/m-1/")).toBe(pub);
    expect(uploadedFileUrlUnder("https://evil.example/mentoring/m-1/a.jpg", "mentoring/m-1/")).toBeNull();
  });
});

describe("저장소 작업", () => {
  it("비공개가 켜져 있으면 비공개 토큰으로 올리고 내부 경로를, 꺼져 있으면 지금처럼 공개 URL", async () => {
    vi.mocked(put).mockResolvedValue({ pathname: FILE, url: PUBLIC_URL } as never);
    await expect(putStudentFile(FILE, "x", { contentType: "image/jpeg" })).resolves.toBe(fileUrlForPathname(FILE));
    expect(put).toHaveBeenLastCalledWith(FILE, "x", { contentType: "image/jpeg", access: "private", token: PRIVATE });

    vi.stubEnv("BLOB_PRIVATE_READ_WRITE_TOKEN", "");
    await expect(putStudentFile(FILE, "x")).resolves.toBe(PUBLIC_URL);
    expect(put).toHaveBeenLastCalledWith(FILE, "x", { access: "public", token: PUBLIC });
  });

  it("직접 업로드: 비공개를 모르는 이전 앱은 공개 저장소", () => {
    expect(directUploadStore(true)).toEqual({ access: "private", token: PRIVATE });
    expect(directUploadStore(false)).toEqual({ access: "public", token: PUBLIC });
  });

  it("삭제는 저장소별 토큰으로 나눠 보내고 외부 주소는 건너뛴다", async () => {
    await deleteBlobFiles([PUBLIC_URL, fileUrlForPathname(FILE), "https://example.com/a.jpg"]);
    expect(del).toHaveBeenCalledWith([PUBLIC_URL], { token: PUBLIC });
    expect(del).toHaveBeenCalledWith(
      [`https://privstore.private.blob.vercel-storage.com${fileUrlForPathname(FILE).slice("/api/files".length)}`],
      { token: PRIVATE },
    );
  });

  it("비공개 토큰 없이 내부 경로를 지우려 하면 실패를 알린다", async () => {
    vi.stubEnv("BLOB_PRIVATE_READ_WRITE_TOKEN", "");
    await expect(deleteBlobFiles([fileUrlForPathname(FILE)])).rejects.toThrow();
  });
});
