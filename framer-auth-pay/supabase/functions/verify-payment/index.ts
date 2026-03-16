// =============================================
// verify-payment Edge Function
//
// 클라이언트에서 PortOne 결제 완료 후 호출하여
// 서버측에서 결제 금액과 상태를 검증합니다.
//
// 보안: 클라이언트의 금액 조작을 방지하기 위해
// PortOne REST API V2로 실제 결제 정보를 확인합니다.
//
// 환경 변수:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   PORTONE_API_SECRET       - PortOne V2 API Secret
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
        const { paymentId, expectedAmount, orderName, payMethod } = await req.json()

        if (!paymentId || !expectedAmount) {
            return new Response(
                JSON.stringify({ verified: false, error: "paymentId와 expectedAmount가 필요합니다" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        const portoneSecret = Deno.env.get("PORTONE_API_SECRET")
        if (!portoneSecret) {
            throw new Error("PORTONE_API_SECRET 환경 변수가 설정되지 않았습니다")
        }

        // PortOne V2 REST API로 결제 정보 조회
        const portoneResponse = await fetch(
            `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
            {
                method: "GET",
                headers: {
                    Authorization: `PortOne ${portoneSecret}`,
                },
            }
        )

        if (!portoneResponse.ok) {
            const errorBody = await portoneResponse.text()
            console.error("PortOne API 오류:", portoneResponse.status, errorBody)
            throw new Error(`PortOne API 오류: ${portoneResponse.status}`)
        }

        const paymentData = await portoneResponse.json()

        // 결제 상태 확인
        if (paymentData.status !== "PAID") {
            return new Response(
                JSON.stringify({
                    verified: false,
                    message: `결제 상태가 올바르지 않습니다: ${paymentData.status}`,
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        // 결제 금액 확인 (핵심 보안 검증)
        const paidAmount = paymentData.amount?.total
        if (paidAmount !== expectedAmount) {
            console.error(
                `금액 불일치! 예상: ${expectedAmount}, 실제: ${paidAmount}, paymentId: ${paymentId}`
            )
            return new Response(
                JSON.stringify({
                    verified: false,
                    message: "결제 금액이 일치하지 않습니다. 고객센터에 문의해주세요.",
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        // Supabase에 결제 내역 저장
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        )

        // JWT에서 사용자 ID 추출 (인증된 사용자인 경우)
        let userId = null
        const authHeader = req.headers.get("Authorization")
        if (authHeader?.startsWith("Bearer ")) {
            const token = authHeader.slice(7)
            const { data: { user } } = await supabase.auth.getUser(token)
            userId = user?.id || null
        }

        // 결제 정보 DB에 upsert (웹훅과 중복 방지)
        const { error: upsertError } = await supabase
            .from("payments")
            .upsert(
                {
                    payment_id: paymentId,
                    user_id: userId,
                    order_name: orderName || paymentData.orderName || "결제",
                    amount: paidAmount,
                    currency: paymentData.currency || "KRW",
                    pay_method: payMethod || paymentData.method?.type || "CARD",
                    status: "paid",
                    pg_provider: paymentData.pgProvider || null,
                    pg_tx_id: paymentData.pgTxId || null,
                    receipt_url: paymentData.receiptUrl || null,
                    card_name: paymentData.method?.card?.name || null,
                    card_number: paymentData.method?.card?.number || null,
                    paid_at: paymentData.paidAt || new Date().toISOString(),
                    metadata: {
                        portone_payment_id: paymentId,
                        verified_at: new Date().toISOString(),
                    },
                },
                { onConflict: "payment_id" }
            )

        if (upsertError) {
            console.error("DB 저장 오류:", upsertError)
            // DB 저장 실패해도 결제 자체는 성공이므로 verified: true
        }

        return new Response(
            JSON.stringify({
                verified: true,
                message: "결제가 정상적으로 확인되었습니다.",
                paymentId,
                amount: paidAmount,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    } catch (err: any) {
        console.error("결제 검증 오류:", err)
        return new Response(
            JSON.stringify({ verified: false, error: err.message || "결제 검증에 실패했습니다" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    }
})
