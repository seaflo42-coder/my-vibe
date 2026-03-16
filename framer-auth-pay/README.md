# Framer 한국형 회원가입 / 소셜 로그인 / 결제 시스템

프레이머(Framer) Code Components로 구현된 한국형 인증 및 결제 시스템입니다.

## 아키텍처

```
Framer Site (Code Components)
  ├── LoginButton      카카오/네이버/구글 소셜 로그인
  ├── SignUpForm        이메일 회원가입 + 휴대폰 인증 + 동의
  ├── LoginForm         이메일/비밀번호 로그인
  ├── UserProfile       사용자 정보 표시 + 로그아웃
  ├── PaymentButton     PortOne V2 결제
  └── PaymentHistory    결제 내역 조회
        │
        ▼
  Supabase (Auth + PostgreSQL + Edge Functions)
        │
        ▼
  PortOne V2 SDK (PG 결제 처리)
```

---

## 1단계: Supabase 프로젝트 설정

### 1.1 Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com)에서 새 프로젝트 생성
2. Project URL과 anon key 메모

### 1.2 데이터베이스 마이그레이션

Supabase SQL Editor에서 순서대로 실행:

```
supabase/migrations/001_create_profiles_table.sql
supabase/migrations/002_create_payments_table.sql
supabase/migrations/003_create_phone_verifications_table.sql
supabase/migrations/004_rls_policies.sql
```

또는 Supabase CLI 사용:

```bash
cd framer-auth-pay
supabase init
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### 1.3 OAuth 설정

#### 카카오

1. [Kakao Developers](https://developers.kakao.com)에서 앱 생성
2. **REST API 키** (Client ID), **Client Secret** 발급
3. Redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
4. 동의항목: `account_email`, `profile_nickname`, `profile_image`
5. Supabase Dashboard > Auth > Providers > Kakao에 등록

#### 구글

1. [Google Cloud Console](https://console.cloud.google.com)에서 OAuth 2.0 자격증명 생성
2. Redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Supabase Dashboard > Auth > Providers > Google에 등록

#### 네이버 (Keycloak 프록시 방식)

1. [네이버 개발자 센터](https://developers.naver.com)에서 앱 등록
2. Callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`

3. Edge Function 배포:
   ```bash
   supabase functions deploy naver-oauth-proxy --no-verify-jwt
   ```

4. Edge Function 환경 변수 설정:
   ```bash
   supabase secrets set \
     NAVER_CLIENT_ID=your_naver_client_id \
     NAVER_CLIENT_SECRET=your_naver_client_secret \
     NAVER_REDIRECT_URI=https://<project-ref>.supabase.co/auth/v1/callback \
     JWT_SIGNING_KEY=your_random_32_char_string
   ```

5. Supabase Dashboard > Auth > Providers > Keycloak:
   - **Realm URL**: `https://<project-ref>.supabase.co/functions/v1/naver-oauth-proxy`
   - **Client ID**: 네이버 Client ID와 동일
   - **Client Secret**: 네이버 Client Secret과 동일

---

## 2단계: SMS 인증 설정 (NHN Cloud)

### 2.1 NHN Cloud SMS 가입

1. [NHN Cloud](https://www.nhncloud.com) 콘솔에서 SMS 서비스 활성화
2. **App Key**, **Secret Key** 발급
3. **발신 번호** 등록 (사전 등록 필수)

### 2.2 Edge Functions 배포

```bash
supabase functions deploy send-sms-verification
supabase functions deploy verify-sms-code
```

### 2.3 환경 변수 설정

```bash
supabase secrets set \
  NHN_SMS_APP_KEY=your_app_key \
  NHN_SMS_SECRET_KEY=your_secret_key \
  NHN_SMS_SENDER_NUMBER=0210001000
```

---

## 3단계: PortOne 결제 설정

### 3.1 PortOne 가입 및 설정

1. [PortOne 관리자 콘솔](https://admin.portone.io)에서 가입
2. **Store ID** 메모
3. PG사 연동 (예: TossPayments, NicePay 등)
4. 결제 채널 생성 → **Channel Key** 메모
5. 네이버페이 사용 시: 네이버페이 채널 추가 연동

### 3.2 테스트 모드

- PortOne 관리자 콘솔에서 "테스트" 환경을 선택하여 테스트
- 테스트용 Store ID / Channel Key 별도 발급

### 3.3 결제 검증 Edge Functions 배포

```bash
supabase functions deploy verify-payment
supabase functions deploy portone-webhook --no-verify-jwt
```

### 3.4 환경 변수 설정

```bash
supabase secrets set PORTONE_API_SECRET=your_portone_v2_api_secret
```

### 3.5 웹훅 등록

PortOne 관리자 콘솔 > 결제 연동 > 웹훅:
- URL: `https://<project-ref>.supabase.co/functions/v1/portone-webhook`
- 이벤트: 결제 완료, 결제 취소, 결제 실패

---

## 4단계: 프레이머 컴포넌트 등록

### 4.1 Supabase 클라이언트 설정

`framer-components/supabaseClient.ts`에서 아래 값을 교체:

```ts
const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY"
```

### 4.2 프레이머 에디터에 코드 파일 추가

프레이머 에디터 > Assets > Code 에서 아래 파일들을 순서대로 추가:

1. `supabaseClient.ts` (코드 파일)
2. `useAuth.ts` (코드 파일)
3. `LoginButton.tsx` (컴포넌트)
4. `LoginForm.tsx` (컴포넌트)
5. `SignUpForm.tsx` (컴포넌트)
6. `UserProfile.tsx` (컴포넌트)
7. `PaymentButton.tsx` (컴포넌트)
8. `PaymentHistory.tsx` (컴포넌트)

### 4.3 npm 패키지 설치

프레이머의 패키지 매니저에서 추가:
- `@supabase/supabase-js`
- `@portone/browser-sdk` (옵션 - CDN 폴백 내장)

---

## 5단계: 컴포넌트 사용법

### LoginButton

캔버스에 드래그 후 속성 패널에서:
- **소셜 로그인**: 카카오 / 네이버 / 구글 선택
- **버튼 텍스트**: 자동 설정 (빈 칸이면 "카카오 로그인" 등)
- **모서리 둥글기**, **글씨 크기** 조정 가능

### SignUpForm

- **휴대폰 인증**: ON/OFF 토글
- **개인정보 동의**: ON/OFF 토글
- **마케팅 동의**: ON/OFF 토글
- **개인정보처리방침 URL**: 전문 보기 링크 연결

### PaymentButton

- **Store ID**: PortOne 스토어 ID 입력
- **Channel Key**: PortOne 채널 키 입력
- **결제 금액**: 원 단위 입력
- **결제 수단**: 카드 / 계좌이체 / 가상계좌 / 휴대폰 / 간편결제(네이버페이)
- **금액 표시**: 버튼에 금액 표시 ON/OFF

### PaymentHistory

- **표시 개수**: 최대 표시 건수
- **상태 필터**: 전체 / 결제완료 / 처리중 / 취소 / 실패
- **영수증 링크**: 영수증 바로가기 ON/OFF

---

## 프로젝트 구조

```
framer-auth-pay/
├── framer-components/           ← 프레이머에 복사할 코드
│   ├── supabaseClient.ts
│   ├── useAuth.ts
│   ├── LoginButton.tsx
│   ├── LoginForm.tsx
│   ├── SignUpForm.tsx
│   ├── UserProfile.tsx
│   ├── PaymentButton.tsx
│   └── PaymentHistory.tsx
├── supabase/
│   ├── migrations/              ← DB 스키마
│   │   ├── 001_create_profiles_table.sql
│   │   ├── 002_create_payments_table.sql
│   │   ├── 003_create_phone_verifications_table.sql
│   │   └── 004_rls_policies.sql
│   └── functions/               ← 서버 로직
│       ├── naver-oauth-proxy/
│       ├── send-sms-verification/
│       ├── verify-sms-code/
│       ├── verify-payment/
│       └── portone-webhook/
└── README.md
```

## 환경 변수 전체 목록

| 변수명 | 용도 | 설정 위치 |
|--------|------|----------|
| `SUPABASE_URL` | Supabase 프로젝트 URL | 자동 설정 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서비스 롤 키 | 자동 설정 |
| `NAVER_CLIENT_ID` | 네이버 OAuth 클라이언트 ID | `supabase secrets set` |
| `NAVER_CLIENT_SECRET` | 네이버 OAuth 클라이언트 시크릿 | `supabase secrets set` |
| `NAVER_REDIRECT_URI` | Supabase Auth 콜백 URL | `supabase secrets set` |
| `JWT_SIGNING_KEY` | OIDC 토큰 서명 키 | `supabase secrets set` |
| `NHN_SMS_APP_KEY` | NHN Cloud SMS 앱 키 | `supabase secrets set` |
| `NHN_SMS_SECRET_KEY` | NHN Cloud SMS 시크릿 키 | `supabase secrets set` |
| `NHN_SMS_SENDER_NUMBER` | SMS 발신 번호 | `supabase secrets set` |
| `PORTONE_API_SECRET` | PortOne V2 API 시크릿 | `supabase secrets set` |
