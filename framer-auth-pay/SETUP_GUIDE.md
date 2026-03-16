# 초보자를 위한 완전 설정 가이드

이 가이드를 처음부터 끝까지 따라하면
프레이머 사이트에서 한국형 회원가입/소셜 로그인/결제가 동작합니다.

예상 소요 시간: 약 2~3시간

---

## 목차

1. [Supabase 가입 및 프로젝트 생성](#1-supabase-가입-및-프로젝트-생성)
2. [데이터베이스 테이블 만들기](#2-데이터베이스-테이블-만들기)
3. [카카오 로그인 설정](#3-카카오-로그인-설정)
4. [구글 로그인 설정](#4-구글-로그인-설정)
5. [네이버 로그인 설정](#5-네이버-로그인-설정-고급)
6. [SMS 인증 설정 (NHN Cloud)](#6-sms-인증-설정-nhn-cloud)
7. [PortOne 결제 설정](#7-portone-결제-설정)
8. [Supabase Edge Functions 배포](#8-supabase-edge-functions-배포)
9. [프레이머에 컴포넌트 등록](#9-프레이머에-컴포넌트-등록)
10. [테스트 및 확인](#10-테스트-및-확인)

---

## 1. Supabase 가입 및 프로젝트 생성

### Supabase란?
데이터베이스 + 회원 인증 + 서버 기능을 무료로 제공하는 클라우드 서비스입니다.
직접 서버를 만들 필요 없이, Supabase가 백엔드 역할을 해줍니다.

### 1-1. 가입

1. https://supabase.com 접속
2. **"Start your project"** 클릭
3. **GitHub 계정으로 로그인** (GitHub 계정이 없으면 먼저 github.com에서 가입)

### 1-2. 새 프로젝트 만들기

1. 로그인 후 **"New Project"** 클릭
2. 아래 내용 입력:
   - **Organization**: 기본값 사용 (처음이면 자동 생성됨)
   - **Project name**: `framer-auth-pay` (원하는 이름)
   - **Database Password**: 안전한 비밀번호 입력 → **반드시 메모해두세요!**
   - **Region**: `Northeast Asia (Seoul)` 선택 (한국 서비스이므로)
3. **"Create new project"** 클릭
4. 2~3분 기다리면 프로젝트 생성 완료

### 1-3. 중요한 키 메모하기 ⭐

프로젝트가 만들어지면 아래 값을 반드시 메모해두세요.
나중에 코드에 넣어야 합니다.

1. 왼쪽 메뉴 > **Settings** (톱니바퀴) > **API** 클릭
2. 아래 두 값을 메모:

```
Project URL:   https://xxxxxxxx.supabase.co    ← 이것을 메모
anon public:   eyJhbGc......긴문자열......      ← 이것을 메모
```

⚠️ `service_role` 키는 절대 프론트엔드 코드에 넣지 마세요!
   (이건 Edge Functions에서만 사용하며, Supabase가 자동으로 넣어줍니다)

---

## 2. 데이터베이스 테이블 만들기

회원 정보, 결제 내역, 전화번호 인증 코드를 저장할 테이블을 만듭니다.

### 2-1. SQL Editor 열기

1. Supabase 대시보드 왼쪽 메뉴 > **SQL Editor** 클릭
2. **"New query"** 클릭

### 2-2. 테이블 생성 SQL 실행

아래 4개 파일의 내용을 **순서대로** 복사 → 붙여넣기 → **Run** 클릭:

#### 파일 1: profiles 테이블 (회원 정보)
```
framer-auth-pay/supabase/migrations/001_create_profiles_table.sql
```
→ SQL Editor에 붙여넣기 → **Run** 클릭 → "Success" 확인

#### 파일 2: payments 테이블 (결제 내역)
```
framer-auth-pay/supabase/migrations/002_create_payments_table.sql
```
→ SQL Editor에 붙여넣기 → **Run** 클릭 → "Success" 확인

#### 파일 3: phone_verifications 테이블 (SMS 인증)
```
framer-auth-pay/supabase/migrations/003_create_phone_verifications_table.sql
```
→ SQL Editor에 붙여넣기 → **Run** 클릭 → "Success" 확인

#### 파일 4: 보안 정책 (RLS)
```
framer-auth-pay/supabase/migrations/004_rls_policies.sql
```
→ SQL Editor에 붙여넣기 → **Run** 클릭 → "Success" 확인

### 2-3. 테이블 확인

1. 왼쪽 메뉴 > **Table Editor** 클릭
2. 3개 테이블이 보이면 성공:
   - `profiles`
   - `payments`
   - `phone_verifications`

---

## 3. 카카오 로그인 설정

### 3-1. 카카오 개발자 앱 만들기

1. https://developers.kakao.com 접속
2. **로그인** (카카오 계정)
3. 상단 메뉴 > **내 애플리케이션** > **애플리케이션 추가하기**
4. 앱 이름 입력 (예: "내 프레이머 사이트") → **저장**

### 3-2. 키 확인

1. 생성된 앱 클릭 > **앱 키** 탭
2. **REST API 키** 메모 → 이것이 Client ID

### 3-3. 카카오 로그인 활성화

1. 왼쪽 메뉴 > **제품 설정** > **카카오 로그인**
2. **활성화 설정** → ON
3. **Redirect URI 등록** 클릭:
   ```
   https://xxxxxxxx.supabase.co/auth/v1/callback
   ```
   (xxxxxxxx 부분에 본인의 Supabase Project URL의 서브도메인을 넣으세요)

### 3-4. 동의 항목 설정

1. 왼쪽 메뉴 > **카카오 로그인** > **동의항목**
2. 아래 항목을 **"필수 동의"** 또는 **"선택 동의"**로 설정:
   - 닉네임
   - 프로필 사진
   - 카카오계정(이메일)

### 3-5. 보안 > Client Secret 발급

1. 왼쪽 메뉴 > **제품 설정** > **카카오 로그인** > **보안**
2. **Client Secret** > **코드 발급** 클릭
3. 발급된 코드 메모 → **활성화 상태: 사용함** 으로 변경

### 3-6. Supabase에 카카오 등록

1. Supabase 대시보드 > **Authentication** > **Providers**
2. **Kakao** 찾아서 클릭 > **Enable** 토글 켜기
3. 입력:
   - **Client ID**: 카카오 REST API 키
   - **Client Secret**: 위에서 발급한 코드
4. **Save** 클릭

---

## 4. 구글 로그인 설정

### 4-1. Google Cloud Console 프로젝트 만들기

1. https://console.cloud.google.com 접속
2. Google 계정으로 로그인
3. 상단 프로젝트 선택 드롭다운 > **"새 프로젝트"**
4. 프로젝트 이름 입력 (예: "Framer Auth") → **만들기**

### 4-2. OAuth 동의 화면 설정

1. 왼쪽 메뉴 > **API 및 서비스** > **OAuth 동의 화면**
2. **User Type**: "외부" 선택 → **만들기**
3. 필수 정보 입력:
   - 앱 이름
   - 사용자 지원 이메일
   - 개발자 연락처 이메일
4. **저장 후 계속** (범위, 테스트 사용자는 건너뛰기 가능)

### 4-3. OAuth 자격증명 만들기

1. 왼쪽 메뉴 > **API 및 서비스** > **사용자 인증 정보**
2. **"+ 사용자 인증 정보 만들기"** > **"OAuth 클라이언트 ID"**
3. 애플리케이션 유형: **"웹 애플리케이션"**
4. 이름 입력 (예: "Framer Auth")
5. **승인된 리디렉션 URI** 에 추가:
   ```
   https://xxxxxxxx.supabase.co/auth/v1/callback
   ```
6. **만들기** 클릭
7. **클라이언트 ID**와 **클라이언트 보안 비밀번호** 메모

### 4-4. Supabase에 구글 등록

1. Supabase 대시보드 > **Authentication** > **Providers**
2. **Google** 찾아서 클릭 > **Enable** 토글 켜기
3. 입력:
   - **Client ID**: Google 클라이언트 ID
   - **Client Secret**: Google 클라이언트 보안 비밀번호
4. **Save** 클릭

---

## 5. 네이버 로그인 설정 (고급)

⚠️ 네이버 로그인은 설정이 복잡합니다.
카카오/구글만 먼저 설정하고, 나중에 추가해도 됩니다.

### 5-1. 네이버 개발자 앱 만들기

1. https://developers.naver.com 접속
2. **Application** > **애플리케이션 등록**
3. 사용 API: **네이버 로그인** 체크
4. 제공 정보: 회원이름, 이메일, 프로필 사진 체크
5. 로그인 오픈 API 서비스 환경: **"PC 웹"** 선택
6. **서비스 URL**: 프레이머 사이트 주소
7. **Callback URL**:
   ```
   https://xxxxxxxx.supabase.co/auth/v1/callback
   ```
8. **등록하기** 클릭
9. **Client ID**와 **Client Secret** 메모

### 5-2. Supabase 설정

네이버는 Supabase가 직접 지원하지 않아서 Edge Function 프록시를 사용합니다.
(8단계에서 Edge Functions 배포할 때 함께 설정합니다)

---

## 6. SMS 인증 설정 (NHN Cloud)

회원가입 시 휴대폰 번호 인증에 사용됩니다.

⚠️ SMS 발송은 유료입니다 (건당 약 10~20원).
처음에는 SMS 인증을 OFF로 사용하고, 나중에 설정해도 됩니다.
(프레이머 컴포넌트에서 "휴대폰 인증" 토글을 OFF하면 됩니다)

### 6-1. NHN Cloud 가입

1. https://www.nhncloud.com 접속
2. 회원가입 및 로그인
3. **결제 수단 등록** (신용카드) — SMS 발송 비용 결제용

### 6-2. SMS 서비스 활성화

1. 콘솔 > **Notification** > **SMS**
2. 서비스 활성화
3. **앱 키(App Key)**, **시크릿 키(Secret Key)** 메모

### 6-3. 발신 번호 등록

1. SMS 서비스 > **발신 번호 관리**
2. 발신 번호 등록 (본인 명의 휴대폰 번호 또는 사업자 번호)
3. 인증 절차 완료

---

## 7. PortOne 결제 설정

### PortOne이란?
여러 PG사(카드 결제, 네이버페이 등)를 하나의 API로 연동해주는 서비스입니다.

### 7-1. PortOne 가입

1. https://admin.portone.io 접속
2. 회원가입 및 로그인

### 7-2. 테스트 채널 만들기 (먼저 테스트로 시작)

1. 로그인 후 **결제 연동** 메뉴
2. **"테스트"** 환경 선택 (상단 토글)
3. **"+ 채널 추가"** 클릭
4. PG사 선택: **"토스페이먼츠"** (테스트하기 가장 편함)
5. 결제 수단: **카드** 체크
6. **저장**

### 7-3. 중요한 키 메모하기

1. **결제 연동** > **식별코드/API Keys**
2. 메모할 값들:
   - **Store ID**: `store-xxxxx-xxxx...`
   - **API Secret** (V2): 결제 검증에 사용

3. **결제 연동** > 방금 만든 채널 클릭
   - **Channel Key**: `channel-key-xxxxx...` 메모

### 7-4. 네이버페이 추가 (선택사항)

1. **"+ 채널 추가"** 클릭
2. PG사: 네이버페이 지원하는 PG 선택
3. 결제 수단: **간편결제** 체크
4. 별도의 Channel Key 메모

### 7-5. 웹훅 등록

1. **결제 연동** > **웹훅 관리**
2. **"+ 웹훅 추가"**
3. URL 입력:
   ```
   https://xxxxxxxx.supabase.co/functions/v1/portone-webhook
   ```
4. 이벤트: **결제 완료**, **결제 취소** 체크
5. **저장**

---

## 8. Supabase Edge Functions 배포

Edge Function은 서버에서 실행되는 코드입니다.
SMS 발송, 결제 검증 등 보안이 필요한 작업을 처리합니다.

### 8-1. Supabase CLI 설치

터미널(맥 기본 터미널 앱)을 열고:

```bash
# npm으로 Supabase CLI 설치
npm install -g supabase

# 설치 확인
supabase --version
```

### 8-2. Supabase 로그인

```bash
supabase login
```
→ 브라우저가 열리면 Supabase 계정으로 로그인
→ 터미널에 "Token saved" 메시지 확인

### 8-3. 프로젝트 연결

```bash
# framer-auth-pay 폴더로 이동
cd /Users/macm1pro/my-vibe/framer-auth-pay

# Supabase 프로젝트 초기화
supabase init

# 본인 프로젝트와 연결 (Project Reference ID 입력)
# Project Reference ID는 Supabase URL의 https://XXXXXX.supabase.co 에서 XXXXXX 부분
supabase link --project-ref XXXXXX
```

### 8-4. 환경 변수 설정 (시크릿 키 등록)

```bash
supabase secrets set \
  PORTONE_API_SECRET="포트원에서_메모한_API_Secret"
```

SMS 인증을 사용할 경우 추가:
```bash
supabase secrets set \
  NHN_SMS_APP_KEY="NHN에서_메모한_앱키" \
  NHN_SMS_SECRET_KEY="NHN에서_메모한_시크릿키" \
  NHN_SMS_SENDER_NUMBER="등록한_발신번호"
```

네이버 로그인을 사용할 경우 추가:
```bash
supabase secrets set \
  NAVER_CLIENT_ID="네이버_클라이언트_ID" \
  NAVER_CLIENT_SECRET="네이버_클라이언트_시크릿" \
  NAVER_REDIRECT_URI="https://XXXXXX.supabase.co/auth/v1/callback" \
  JWT_SIGNING_KEY="아무거나_32자이상_랜덤문자열_입력"
```

### 8-5. Edge Functions 배포

```bash
# 결제 검증 (필수)
supabase functions deploy verify-payment

# 결제 웹훅 (필수)
supabase functions deploy portone-webhook --no-verify-jwt

# SMS 인증 (SMS 사용 시)
supabase functions deploy send-sms-verification
supabase functions deploy verify-sms-code

# 네이버 로그인 (네이버 사용 시)
supabase functions deploy naver-oauth-proxy --no-verify-jwt
```

각 명령어 실행 후 "Function deployed" 메시지가 나오면 성공!

### 8-6. 네이버 로그인 최종 설정 (네이버 사용 시)

Edge Function 배포 후:
1. Supabase 대시보드 > **Authentication** > **Providers**
2. **Keycloak** 클릭 > **Enable** 토글 켜기
3. 입력:
   - **Realm URL**: `https://XXXXXX.supabase.co/functions/v1/naver-oauth-proxy`
   - **Client ID**: 네이버 Client ID
   - **Client Secret**: 네이버 Client Secret
4. **Save** 클릭

---

## 9. 프레이머에 컴포넌트 등록

### 9-1. 프레이머 프로젝트 열기

1. https://framer.com 접속 및 로그인
2. 새 프로젝트 만들기 또는 기존 프로젝트 열기

### 9-2. npm 패키지 설치

1. 왼쪽 패널 > **Assets** (큐브 아이콘)
2. **Code** 섹션 옆의 톱니바퀴 또는 **"..."** 메뉴
3. **"Package Manager"** 또는 **"Manage Packages"**
4. 아래 패키지 검색 후 설치:
   ```
   @supabase/supabase-js
   @portone/browser-sdk
   ```

### 9-3. 코드 유틸리티 파일 추가 (2개)

이 파일들은 "컴포넌트"가 아닌 "코드 파일"입니다.

1. **Assets** > **Code** 섹션 > **"+"** 버튼 > **"New Code File"**
2. 파일 이름: `supabaseClient`
3. 아래 파일의 내용을 전체 복사해서 붙여넣기:
   ```
   framer-auth-pay/framer-components/supabaseClient.ts
   ```
4. ⚠️ **반드시** URL과 Key를 본인 것으로 교체:
   ```ts
   const SUPABASE_URL = "https://본인프로젝트.supabase.co"
   const SUPABASE_ANON_KEY = "본인의_anon_key_여기에_붙여넣기"
   ```
5. **저장** (Cmd+S)

같은 방법으로:
1. **"+"** > **"New Code File"**
2. 파일 이름: `useAuth`
3. 아래 파일의 내용 복사 → 붙여넣기:
   ```
   framer-auth-pay/framer-components/useAuth.ts
   ```
4. **저장**

### 9-4. 컴포넌트 파일 추가 (6개)

이 파일들은 캔버스에 드래그할 수 있는 "컴포넌트"입니다.

1. **Assets** > **Code** 섹션 > **"+"** 버튼 > **"New Component"**
2. 파일 이름: `LoginButton`
3. 기본 코드를 **전부 지우고**, 아래 파일 내용을 복사 → 붙여넣기:
   ```
   framer-auth-pay/framer-components/LoginButton.tsx
   ```
4. **저장** (Cmd+S)

같은 방법으로 나머지 5개도 추가:

| 순서 | 이름 | 소스 파일 |
|-----|------|----------|
| 2 | `LoginForm` | `framer-components/LoginForm.tsx` |
| 3 | `SignUpForm` | `framer-components/SignUpForm.tsx` |
| 4 | `UserProfile` | `framer-components/UserProfile.tsx` |
| 5 | `PaymentButton` | `framer-components/PaymentButton.tsx` |
| 6 | `PaymentHistory` | `framer-components/PaymentHistory.tsx` |

### 9-5. 캔버스에 배치

1. 왼쪽 **Assets** > **Code** 에 컴포넌트들이 나열됨
2. 원하는 컴포넌트를 캔버스로 **드래그 앤 드롭**
3. 오른쪽 속성 패널에서 설정 변경 가능:

   **LoginButton 예시:**
   - 소셜 로그인: 카카오 / 네이버 / 구글 선택
   - 버튼 텍스트: 자동 (빈칸) 또는 커스텀
   - 모서리 둥글기, 글씨 크기 조정

   **PaymentButton 예시:**
   - Store ID: 포트원에서 메모한 값 입력
   - Channel Key: 포트원에서 메모한 값 입력
   - 결제 금액: 숫자 입력 (예: 29900)
   - 결제 수단: 카드 / 계좌이체 / 간편결제 선택

---

## 10. 테스트 및 확인

### 10-1. 프레이머 프리뷰에서 테스트

1. 프레이머 에디터 우측 상단 **"Preview"** (▶) 클릭
2. 소셜 로그인 버튼 클릭 → 카카오/구글 로그인 창이 뜨면 성공
3. 로그인 후 UserProfile 컴포넌트에 이름/이메일이 표시되면 성공

### 10-2. 결제 테스트

1. PortOne 관리자 콘솔에서 **"테스트"** 환경인지 확인
2. 프레이머에서 PaymentButton 클릭
3. 테스트 결제 창이 뜨면 → 카드번호 아무거나 입력 (테스트 모드)
4. 결제 완료 메시지가 나오면 성공

### 10-3. Supabase에서 데이터 확인

1. Supabase 대시보드 > **Table Editor**
2. **profiles** 테이블: 로그인한 사용자 정보가 있는지 확인
3. **payments** 테이블: 결제 내역이 저장되었는지 확인

### 10-4. 사이트 배포

모든 테스트가 완료되면:
1. 프레이머 에디터 우측 상단 **"Publish"** 클릭
2. 배포된 사이트 URL에서 최종 확인

---

## 자주 발생하는 문제와 해결

### "Invalid API key" 에러
→ `supabaseClient.ts`의 URL이나 anon key가 틀렸습니다.
→ Supabase 대시보드 > Settings > API 에서 다시 복사하세요.

### 소셜 로그인 클릭 시 에러 페이지
→ Redirect URI가 틀렸습니다.
→ 카카오/구글 개발자 콘솔에서 URI를 다시 확인하세요.
→ 정확한 형식: `https://XXXXXX.supabase.co/auth/v1/callback`

### "결제 모듈 로딩에 실패했습니다"
→ 프레이머에서 `@portone/browser-sdk` 패키지가 설치되었는지 확인하세요.

### "Store ID와 Channel Key를 설정해주세요"
→ PaymentButton 컴포넌트의 속성 패널에서 값을 입력해야 합니다.
→ PortOne 관리자 콘솔에서 확인하세요.

### SMS 인증번호가 안 옴
→ NHN Cloud SMS 설정 확인 (앱키, 시크릿키, 발신번호)
→ Edge Function이 배포되었는지 확인
→ `supabase functions list` 명령어로 확인

### 프레이머에서 import 에러
→ 코드 파일 이름이 정확한지 확인하세요.
→ `supabaseClient`와 `useAuth` 파일이 먼저 생성되어 있어야 합니다.
→ import 경로: `import { supabase } from "./supabaseClient"`

---

## 추가 참고 자료

- Supabase 공식 문서: https://supabase.com/docs
- PortOne V2 연동 가이드: https://developers.portone.io
- 카카오 로그인 가이드: https://developers.kakao.com/docs/latest/ko/kakaologin/common
- 프레이머 Code Components: https://www.framer.com/developers

---

## 최소한으로 시작하기 (권장)

모든 것을 한 번에 설정하기 어렵다면, 아래 순서로 하나씩:

### 1주차: 기본 인증
- [ ] Supabase 프로젝트 생성
- [ ] 테이블 4개 만들기 (SQL 실행)
- [ ] 카카오 로그인만 설정
- [ ] 프레이머에 LoginButton + UserProfile 추가
- [ ] 카카오 로그인 테스트

### 2주차: 추가 인증
- [ ] 구글 로그인 설정
- [ ] LoginForm (이메일/비밀번호) 추가
- [ ] SignUpForm (회원가입) 추가

### 3주차: 결제
- [ ] PortOne 가입 및 테스트 채널 설정
- [ ] Edge Functions 배포
- [ ] PaymentButton + PaymentHistory 추가
- [ ] 테스트 결제 확인

### 나중에 (선택):
- [ ] 네이버 로그인 설정
- [ ] SMS 인증 설정
- [ ] 실제 PG사 연동 (라이브 전환)
