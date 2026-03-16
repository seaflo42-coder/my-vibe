// =============================================
// send-sms-verification Edge Function
//
// 한국 휴대폰 번호로 6자리 OTP 인증번호를 발송합니다.
// NHN Cloud SMS API를 사용합니다.
//
// 환경 변수 (Supabase Dashboard > Edge Functions > Secrets):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   NHN_SMS_APP_KEY         - NHN Cloud SMS 앱 키
//   NHN_SMS_SECRET_KEY      - NHN Cloud SMS 시크릿 키
//   NHN_SMS_SENDER_NUMBER   - 발신 번호 (예: 0210001000)
//
// 대안: Aligo API 사용 시 환경 변수를 변경하고
//       sendSmsViaNhn 함수를 교체하세요.
// =============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req: Request) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    try {
        const { phoneNumber } = await req.json()

        // 한국 전화번호 형식 검증 (+82로 시작, 10~11자리)
        if (!phoneNumber || !/^\+82\d{9,10}$/.test(phoneNumber)) {
            return new Response(
                JSON.stringify({ error: "유효하지 않은 전화번호입니다. +82 형식으로 입력해주세요." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        )

        // 레이트 리밋: 같은 번호로 5분 내 재발송 방지
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const { data: recentCodes } = await supabase
            .from("phone_verifications")
            .select("id")
            .eq("phone_number", phoneNumber)
            .gte("created_at", fiveMinutesAgo)
            .eq("verified", false)

        if (recentCodes && recentCodes.length >= 3) {
            return new Response(
                JSON.stringify({ error: "인증번호 발송 횟수를 초과했습니다. 5분 후 다시 시도해주세요." }),
                { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        // 6자리 OTP 생성
        const code = String(Math.floor(100000 + Math.random() * 900000))

        // DB에 인증 코드 저장 (5분 만료)
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
        const { error: insertError } = await supabase
            .from("phone_verifications")
            .insert({
                phone_number: phoneNumber,
                code,
                expires_at: expiresAt,
            })

        if (insertError) {
            throw new Error(`DB 저장 실패: ${insertError.message}`)
        }

        // SMS 발송 (NHN Cloud)
        await sendSmsViaNhn(phoneNumber, code)

        return new Response(
            JSON.stringify({ success: true, message: "인증번호가 발송되었습니다." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    } catch (err: any) {
        console.error("SMS 발송 오류:", err)
        return new Response(
            JSON.stringify({ error: err.message || "인증번호 발송에 실패했습니다" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    }
})

// NHN Cloud SMS API로 문자 발송
async function sendSmsViaNhn(phoneNumber: string, code: string) {
    const appKey = Deno.env.get("NHN_SMS_APP_KEY")
    const secretKey = Deno.env.get("NHN_SMS_SECRET_KEY")
    const senderNumber = Deno.env.get("NHN_SMS_SENDER_NUMBER")

    if (!appKey || !secretKey || !senderNumber) {
        throw new Error("NHN Cloud SMS 설정이 완료되지 않았습니다")
    }

    // +82 형식을 0으로 변환 (NHN Cloud는 국내번호 형식 사용)
    const domesticNumber = "0" + phoneNumber.slice(3)

    const response = await fetch(
        `https://api-sms.cloud.toast.com/sms/v3.0/appKeys/${appKey}/sender/sms`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json;charset=UTF-8",
                "X-Secret-Key": secretKey,
            },
            body: JSON.stringify({
                body: `[인증번호] ${code}\n인증번호를 입력해주세요. (5분 내 유효)`,
                sendNo: senderNumber,
                recipientList: [
                    {
                        recipientNo: domesticNumber,
                    },
                ],
            }),
        }
    )

    const result = await response.json()

    if (!result.header?.isSuccessful) {
        throw new Error(`SMS 발송 실패: ${result.header?.resultMessage || "알 수 없는 오류"}`)
    }
}
