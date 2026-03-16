// =============================================
// verify-sms-code Edge Function
//
// 사용자가 입력한 6자리 OTP를 검증합니다.
// - 5분 만료 체크
// - 최대 5회 시도 제한
// - 검증 성공 시 verified 플래그 업데이트
//
// 환경 변수:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// =============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    try {
        const { phoneNumber, code } = await req.json()

        if (!phoneNumber || !code) {
            return new Response(
                JSON.stringify({ error: "전화번호와 인증번호를 모두 입력해주세요" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        if (!/^\d{6}$/.test(code)) {
            return new Response(
                JSON.stringify({ error: "인증번호는 6자리 숫자입니다" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        )

        // 가장 최근에 발송된, 만료되지 않은, 미검증 코드 조회
        const now = new Date().toISOString()
        const { data: verifications, error: queryError } = await supabase
            .from("phone_verifications")
            .select("*")
            .eq("phone_number", phoneNumber)
            .eq("verified", false)
            .gte("expires_at", now)
            .order("created_at", { ascending: false })
            .limit(1)

        if (queryError) {
            throw new Error(`DB 조회 실패: ${queryError.message}`)
        }

        if (!verifications || verifications.length === 0) {
            return new Response(
                JSON.stringify({
                    verified: false,
                    error: "유효한 인증번호가 없습니다. 인증번호를 다시 발송해주세요.",
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        const verification = verifications[0]

        // 시도 횟수 체크 (최대 5회)
        if (verification.attempts >= 5) {
            return new Response(
                JSON.stringify({
                    verified: false,
                    error: "인증 시도 횟수를 초과했습니다. 인증번호를 다시 발송해주세요.",
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        // 시도 횟수 증가
        await supabase
            .from("phone_verifications")
            .update({ attempts: verification.attempts + 1 })
            .eq("id", verification.id)

        // 인증번호 일치 확인
        if (verification.code !== code) {
            const remaining = 4 - verification.attempts
            return new Response(
                JSON.stringify({
                    verified: false,
                    error: `인증번호가 올바르지 않습니다. (${remaining > 0 ? `${remaining}회 남음` : "시도 초과"})`,
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        // 인증 성공 → verified = true
        await supabase
            .from("phone_verifications")
            .update({ verified: true })
            .eq("id", verification.id)

        return new Response(
            JSON.stringify({ verified: true, message: "인증이 완료되었습니다." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    } catch (err: any) {
        console.error("인증 확인 오류:", err)
        return new Response(
            JSON.stringify({ error: err.message || "인증 확인에 실패했습니다" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    }
})
