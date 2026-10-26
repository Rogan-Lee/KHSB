import { describe, expect, it } from "vitest";
import { parseLandingVideos, youtubeId } from "@/lib/content-posts-meta";

describe("youtubeId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=xGa-Dz5O6-w", "xGa-Dz5O6-w"],
    ["https://youtu.be/xGa-Dz5O6-w?si=PnyOHhOGN6G0gPX8", "xGa-Dz5O6-w"],
    ["https://m.youtube.com/watch?feature=share&v=xGa-Dz5O6-w&t=3", "xGa-Dz5O6-w"],
    ["https://www.youtube.com/shorts/xGa-Dz5O6-w", "xGa-Dz5O6-w"],
    ["https://www.youtube.com/live/xGa-Dz5O6-w?si=x", "xGa-Dz5O6-w"],
    ["https://blog.naver.com/khsb/123", null],
    ["https://www.youtube.com/@khsb", null],
    [null, null],
  ])("%s → %s", (url, id) => {
    expect(youtubeId(url)).toBe(id);
  });
});

describe("parseLandingVideos", () => {
  it("저장값을 읽고 추가 영상은 2개까지만", () => {
    expect(parseLandingVideos('{"main":"a","extra":["b","c","d"]}')).toEqual({ main: "a", extra: ["b", "c"] });
  });
  it("없거나 깨진 값은 자동(빈 선택)", () => {
    expect(parseLandingVideos(null)).toEqual({ main: null, extra: [] });
    expect(parseLandingVideos("not json")).toEqual({ main: null, extra: [] });
    expect(parseLandingVideos('{"main":1,"extra":"b"}')).toEqual({ main: null, extra: [] });
  });
});
