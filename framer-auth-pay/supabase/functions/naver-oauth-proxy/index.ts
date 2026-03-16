// =============================================
// naver-oauth-proxy Edge Function
//
// Supabase가 네이버 OAuth를 네이티브로 지원하지 않으므로,
// Keycloak 프로바이더 슬롯을 활용한 OIDC 프록시입니다.
//
// Supabase 대시보드 설정:
//   Auth > Providers > Keycloak
//   - Realm URL: https://<project-ref>.supabase.co/functions/v1/naver-oauth-proxy
//   - Client ID: (네이버 앱의 Client ID와 동일하게)
//   - Client Secret: (네이버 앱의 Client Secret과 동일하게)
//
// 네이버 개발자 센터 설정:
//   - Callback URL: https://<project-ref>.supabase.co/auth/v1/callback
//
// 환경 변수:
//   NAVER_CLIENT_ID
//   NAVER_CLIENT_SECRET
//   NAVER_REDIRECT_URI  - Supabase Auth 콜백 URL
//   JWT_SIGNING_KEY     - OIDC 토큰 서명용 (32자 이상 랜덤 문자열)
//
// 배포:
//   supabase functions deploy naver-oauth-proxy --no-verify-jwt
// =============================================

import { encode as base64url } from "https://deno.land/std@0.208.0/encoding/base64url.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// NAVER OAuth URLs
const NAVER_AUTH_URL = "https://nid.naver.com/oauth2.0/authorize"
const NAVER_TOKEN_URL = "https://nid.naver.com/oauth2.0/token"
const NAVER_USERINFO_URL = "https://openapi.naver.com/v1/nid/me"

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    const url = new URL(req.url)
    const path = url.pathname.replace(/^\/naver-oauth-proxy/, "")

    // Keycloak OIDC 엔드포인트 매핑
    // Supabase는 이 엔드포인트들을 호출합니다

    // 1. OpenID Configuration 디스커버리
    if (path === "/.well-known/openid-configuration" || path === "/protocol/openid-connect/.well-known/openid-configuration") {
        const baseUrl = `${url.origin}/functions/v1/naver-oauth-proxy`
        return new Response(
            JSON.stringify({
                issuer: baseUrl,
                authorization_endpoint: `${baseUrl}/protocol/openid-connect/auth`,
                token_endpoint: `${baseUrl}/protocol/openid-connect/token`,
                userinfo_endpoint: `${baseUrl}/protocol/openid-connect/userinfo`,
                jwks_uri: `${baseUrl}/protocol/openid-connect/certs`,
                response_types_supported: ["code"],
                subject_types_supported: ["public"],
                id_token_signing_alg_values_supported: ["HS256"],
                scopes_supported: ["openid", "profile", "email"],
                token_endpoint_auth_methods_supported: ["client_secret_post"],
                claims_supported: ["sub", "name", "email", "picture"],
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    }

    // 2. 인가 엔드포인트 → 네이버 로그인 페이지로 리다이렉트
    if (path === "/protocol/openid-connect/auth") {
        const clientId = Deno.env.get("NAVER_CLIENT_ID")!
        const redirectUri = url.searchParams.get("redirect_uri") || Deno.env.get("NAVER_REDIRECT_URI")!
        const state = url.searchParams.get("state") || ""

        const naverAuthUrl = new URL(NAVER_AUTH_URL)
        naverAuthUrl.searchParams.set("response_type", "code")
        naverAuthUrl.searchParams.set("client_id", clientId)
        naverAuthUrl.searchParams.set("redirect_uri", redirectUri)
        naverAuthUrl.searchParams.set("state", state)

        return Response.redirect(naverAuthUrl.toString(), 302)
    }

    // 3. 토큰 엔드포인트 → 네이버 토큰 교환 + OIDC ID 토큰 생성
    if (path === "/protocol/openid-connect/token") {
        const formData = await req.formData().catch(() => null)
        const bodyJson = formData ? null : await req.json().catch(() => null)

        const code = formData?.get("code")?.toString() || bodyJson?.code
        const redirectUri = formData?.get("redirect_uri")?.toString() || bodyJson?.redirect_uri

        if (!code) {
            return new Response(
                JSON.stringify({ error: "authorization code가 필요합니다" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        const clientId = Deno.env.get("NAVER_CLIENT_ID")!
        const clientSecret = Deno.env.get("NAVER_CLIENT_SECRET")!

        // 네이버 토큰 교환
        const tokenUrl = new URL(NAVER_TOKEN_URL)
        tokenUrl.searchParams.set("grant_type", "authorization_code")
        tokenUrl.searchParams.set("client_id", clientId)
        tokenUrl.searchParams.set("client_secret", clientSecret)
        tokenUrl.searchParams.set("code", code)
        if (redirectUri) tokenUrl.searchParams.set("redirect_uri", redirectUri)

        const naverTokenRes = await fetch(tokenUrl.toString())
        const naverToken = await naverTokenRes.json()

        if (naverToken.error) {
            return new Response(
                JSON.stringify({ error: naverToken.error, error_description: naverToken.error_description }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        // 네이버 사용자 정보 가져오기
        const userRes = await fetch(NAVER_USERINFO_URL, {
            headers: { Authorization: `Bearer ${naverToken.access_token}` },
        })
        const userData = await userRes.json()
        const naverUser = userData.response

        // OIDC ID 토큰 생성 (HS256)
        const signingKey = Deno.env.get("JWT_SIGNING_KEY")!
        const baseUrl = `${url.origin}/functions/v1/naver-oauth-proxy`

        const idToken = await createIdToken(
            {
                iss: baseUrl,
                sub: naverUser.id,
                aud: clientId,
                exp: Math.floor(Date.now() / 1000) + 3600,
                iat: Math.floor(Date.now() / 1000),
                name: naverUser.name || naverUser.nickname || "",
                email: naverUser.email || "",
                picture: naverUser.profile_image || "",
                nickname: naverUser.nickname || "",
            },
            signingKey
        )

        return new Response(
            JSON.stringify({
                access_token: naverToken.access_token,
                token_type: "Bearer",
                expires_in: naverToken.expires_in || 3600,
                refresh_token: naverToken.refresh_token || "",
                id_token: idToken,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    }

    // 4. UserInfo 엔드포인트
    if (path === "/protocol/openid-connect/userinfo") {
        const authHeader = req.headers.get("Authorization")
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
        }

        const userRes = await fetch(NAVER_USERINFO_URL, {
            headers: { Authorization: authHeader },
        })
        const userData = await userRes.json()
        const naverUser = userData.response

        return new Response(
            JSON.stringify({
                sub: naverUser.id,
                name: naverUser.name || naverUser.nickname || "",
                email: naverUser.email || "",
                picture: naverUser.profile_image || "",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    }

    // 5. JWKS 엔드포인트 (HS256이므로 빈 키 목록)
    if (path === "/protocol/openid-connect/certs") {
        return new Response(
            JSON.stringify({ keys: [] }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    }

    return new Response("Not Found", { status: 404 })
})

// HS256 JWT 생성
async function createIdToken(
    payload: Record<string, any>,
    secret: string
): Promise<string> {
    const header = { alg: "HS256", typ: "JWT" }

    const encodedHeader = base64url(new TextEncoder().encode(JSON.stringify(header)))
    const encodedPayload = base64url(new TextEncoder().encode(JSON.stringify(payload)))

    const data = `${encodedHeader}.${encodedPayload}`

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    )

    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
    const encodedSignature = base64url(new Uint8Array(signature))

    return `${data}.${encodedSignature}`
}
