"use client";

import Script from "next/script";

export function KakaoSdkLoader() {
  const jsKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (!jsKey) return null;

  return (
    <Script
      src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
      integrity="sha384-TiCUE00h649CAMonG018J2ujOgDKW/kVWlChEuu4jK2vxfAAD0eZxzCKakxg55G4"
      crossOrigin="anonymous"
      strategy="lazyOnload"
      onLoad={() => {
        if (window.Kakao && !window.Kakao.isInitialized()) {
          window.Kakao.init(jsKey);
        }
      }}
    />
  );
}
