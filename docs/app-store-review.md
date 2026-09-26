# App Store 심사 준비 (강한선배 iOS)

심사 리젝 사유(Apple App Review Guidelines 1.2, 1.5, 2.1, 3.1, 4.8, 5.1.1)를 기준으로 2026-09-26에 앱을 점검한 결과와 제출할 때 입력할 값을 정리한다. 앱 빌드·제출 절차는 [mobile-release.md](mobile-release.md)를 따른다.

## 1. 점검 결과

| 항목 | 가이드라인 | 상태 | 비고 |
|---|---|---|---|
| 계정 삭제 | 5.1.1(v) | 있음 | `전체` 탭 → `계정·보안` → `계정 삭제`. 비밀번호 확인 후 즉시 삭제. `AuthUser`·세션·로그인 계정이 지워지고, 푸시 토큰(`DevicePushToken`)과 학부모-자녀 연결(`ParentLink`)은 FK cascade로 함께 지워진다. 삭제 전에 지워지는 정보와 독서실에 남는 기록, 남은 기록 삭제 요청 방법을 안내한다. |
| 문의·연락처 | 1.5 | 보강함 | 로그인 화면 하단, `계정·보안`의 `도움말`, 학생·학부모 `전체` 탭에 고객센터·전화 문의·개인정보처리방침. 전화를 걸 수 없는 기기(iPad)는 번호를 복사한다. |
| Support URL | 1.5 | 새로 만듦 | `landing/support.html`: 앱 이름, 전화, FAQ, 계정 삭제 방법(`#delete-account`) |
| 개인정보처리방침 | 5.1.1(i) | 새로 만듦 | `landing/privacy.html`. 이전에는 랜딩 푸터에 링크 없는 글자만 있었다. |
| 권한 문구 | 5.1.1 | 고침 | 카메라 문구가 "좌석 QR"만 적혀 사진 촬영 권한 창과 맞지 않았다. 순찰 QR과 사진 촬영을 함께 적었다. 쓰지 않는 Face ID 문구는 뺐다. |
| 카메라 영상 촬영 | 2.1 | 고침 | 질문 작성의 `촬영`이 영상 녹화까지 열었는데 마이크 권한 문구가 없어 녹화하면 iOS가 앱을 종료시킬 수 있었다. 카메라는 사진만 찍고, 영상은 보관함에서 고른다. |
| 로그인 | 2.1 | 데모 계정 필요 | 초대로만 가입하는 구조라 심사자가 직접 가입할 수 없다. 아래 3장의 계정을 준비한다. |
| Sign in with Apple | 4.8 | 해당 없음 | 카카오·구글 같은 제3자 로그인이 앱에 없다(아이디·이메일 + 비밀번호만). 제3자 로그인을 앱에 넣으면 그때 Apple 로그인도 같이 넣어야 한다. |
| 결제·구독 | 3.1.1 | 해당 없음 | 앱 안에서 파는 디지털 상품·구독이 없다. 점심 도시락은 독서실에서 받는 실물 식사라 계좌이체 안내가 허용된다(3.1.3(e)). |
| 신고·차단 | 1.2 | 낮은 위험 | 이용자끼리 공개 게시·채팅이 없다. 메시지·질문·문의는 학생·학부모와 독서실 운영진 사이의 1:1 소통이다. 심사 노트에 이 점을 밝힌다. |
| 미완성 흔적 | 2.1(a), 2.3 | 없음 | 앱 소스에 "준비 중", "Coming soon", "베타", 더미 문구 없음 |
| 서버·네트워크 | 2.1 | 문제 없음 | 서버는 Vercel(`khsb.vercel.app`), 앱은 도메인으로만 접속하고 IP를 하드코딩하지 않는다. 해외 IP 차단 규칙 없음. |
| 특정 조직 전용 앱 | 3.2 | 주의 | 한 독서실 회원용이라 "특정 조직 전용 앱은 Apple Business Manager로 배포하라"는 3.2 리젝이 나올 수 있다. 누구나 입회해 쓸 수 있는 서비스라는 점을 심사 노트에 적는다. |

## 2. App Store Connect 입력값

- **Support URL**: `https://www.kanghanseonbae.com/support.html`
- **Privacy Policy URL**: `https://www.kanghanseonbae.com/privacy.html`
- **Marketing URL**(선택): `https://www.kanghanseonbae.com`
- **가격**: 무료, 앱 내 구입 없음
- **기기**: iPhone 전용(`supportsTablet: false`). iPad에서는 iPhone 호환 모드로 실행되므로 iPad 시뮬레이터에서도 로그인부터 한 번 돌려 본다.
- **수출 규정**: `usesNonExemptEncryption: false`(HTTPS만 사용)

### 앱 개인정보(App Privacy)

추적(Tracking): **아니요**. 광고 식별자와 분석 SDK를 쓰지 않는다. 아래 항목은 모두 "사용자와 연결됨", 목적은 "앱 기능".

| Apple 분류 | 해당 데이터 |
|---|---|
| 연락처 정보 → 이름, 이메일 주소, 전화번호 | 계정 이름·복구 이메일, 학생·보호자 연락처 |
| 사용자 콘텐츠 → 사진 또는 비디오 | 질문·메시지·수행평가·멘토링 첨부 |
| 사용자 콘텐츠 → 고객 지원, 기타 사용자 콘텐츠 | 학부모 문의, 건의사항, 질문·메시지 내용 |
| 식별자 → 사용자 ID | 계정 ID·아이디 |
| 기타 데이터 | 출결·학습 기록, 성적 구간, 점심 신청 내역 |

## 3. 심사용 데모 계정

제출 전에 **운영 서버**에 준비한다(운영 DB 작업이므로 사용자가 직접 한다). 실제 학생 계정은 미성년자 개인정보가 보이므로 쓰지 않는다.

1. 가상 학생 1명(예: `앱심사 학생`)을 등록하고 학생 계정을 만든다.
2. 이 학생에 연결된 학부모 계정을 만든다.
3. 데이터를 채운다: 출결 며칠, 수행평가 1건, 질문 1건과 답변, 멘토링 기록 1건, 학부모 리포트 1건, 공지 1건.
4. 계정 삭제를 시험할 수 있게 **이 학생의 학부모 초대 코드 1개**를 따로 발급해 심사 노트에 적는다. 만료일은 심사 기간보다 넉넉하게 잡는다. 심사자가 데모 계정 자체를 지워도 심사가 이어지도록 하기 위해서다.
5. 운영진 화면: 운영진 계정은 실제 학생 명단이 보이므로 심사자에게 주면 안 된다. 운영진 기능은 화면 녹화 영상을 App Review 첨부로 올리고 노트에 설명한다. 거절되면 운영진 데모 계정을 위한 별도 방안(데모 전용 시설·데이터 가리기)을 검토한다.
6. 제출 직전에 두 계정으로 모두 로그인해 데이터가 보이는지 확인한다. 심사 중에는 비밀번호를 바꾸거나 계정을 지우지 않는다.

## 4. App Review 노트 초안 (영문, 붙여 넣기용)

```
강한선배 (KHSB) is the member app of KHSB, a managed study hall in Dongtan, Korea.
Anyone can enroll at the study hall; after enrolling, students and parents receive an
invitation link or code from the study hall and create an account in the app
(Login screen > "초대받았어요" tab). The app has no in-app purchases; lunch box orders
are real meals served at the study hall and are paid by bank transfer.
The UI is in Korean.

Demo accounts (Login screen > "로그인" tab):
- Student: <ID> / <password>
- Parent:  <ID> / <password>
Staff features (attendance, patrol QR, mentoring) are for study-hall employees and show
real students' personal data, so we attached a screen recording instead of a staff account.

Account deletion:
- 전체 (last tab) > 계정·보안 > 계정 삭제 > confirm > enter password. The account is deleted
  immediately and the user is signed out on all devices.
- To test sign-up and deletion without removing the demo accounts, use this invite code:
  Login screen > "초대받았어요" > paste <INVITE CODE> (creates a new parent account).

Support and privacy:
- In app: 전체 > 고객센터 / 계정·보안 > 도움말 (고객센터, 전화 문의, 개인정보처리방침),
  and links at the bottom of the login screen.
- Support: https://www.kanghanseonbae.com/support.html
- Privacy policy: https://www.kanghanseonbae.com/privacy.html

User-generated content: there is no public posting or chat between users. Messages,
questions and inquiries are one-to-one between a student/parent and study-hall staff.

Permissions: the camera is used to scan seat QR codes during staff patrols and to take
photos for questions, messages and mentoring notes. The photo library is used to attach
photos.
```

## 5. 제출 전 셀프 점검

1. 미국 VPN을 켠 새 기기(또는 시뮬레이터)에서 초대 코드로 가입 → 주요 화면 → 계정 삭제까지 해 본다. 삭제 후 운영 DB에서 `AuthUser`와 `DevicePushToken`에 해당 행이 없는지 확인한다.
2. 앱 안의 링크와 버튼을 한 번씩 누른다: 고객센터, 전화 문의(iPad에서는 번호 복사), 개인정보처리방침, 비밀번호를 잊었어요.
3. Support URL과 개인정보처리방침을 로그아웃 상태의 휴대폰 브라우저에서 연다.
4. iPad 시뮬레이터에서 실행해 로그인·홈·계정 화면이 뜨는지 본다.
5. 권한 창 문구를 확인한다: 운영진 순찰 QR(카메라), 질문 사진 촬영(카메라), 사진 첨부(보관함).
6. 제출 직전에 데모 계정 두 개로 로그인해 데이터를 확인하고, 심사 노트의 `<...>` 자리를 채운다.

## 6. 개인정보처리방침 공개 전 확인할 것

`landing/privacy.html`은 코드에서 확인한 사실로 작성했지만 법적 문서이므로 대표가 확인한 뒤 공개한다.

- 개인정보 보호책임자(대표 강한지, 010-3145-5767)와 시행일(2026-09-26)
- 보유 기간·법정 보존 기간, 열람·삭제 요청 처리 기한(10일 이내), 만 14세 미만 법정대리인 동의 문구
- 처리 위탁·국외 이전 표: 첨부 파일 저장 위치(Vercel Blob 리전), 국외 수탁자별 연락처(개인정보 보호법 제28조의8에서 요구)
- 고객지원 이메일이 생기면 `landing/bx-data.js`의 `SITE.email`에 넣는다. 두 페이지에 이메일 줄이 자동으로 나타난다.
- 랜딩 푸터의 Instagram·YouTube 링크가 아직 `#`이다.
