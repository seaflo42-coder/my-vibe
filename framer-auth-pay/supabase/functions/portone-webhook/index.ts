// =============================================
// portone-webhook Edge Function
//
// PortOne에서 결제 상태 변경 시 호출되는 웹훅입니다.
// 결제 완료, 취소, 실패 등의 이벤트를 처리합니다.
//
// 웹훅 URL (PortOne 관리자 콘솔에 등록):
//   https://<project-ref>.supabase.co/functions/v1/portone-webhook
//
// 배포 시 JWT 검증 비활성화 필요:
//   supabase functions deploy portone-webhook --no-verify-jwt
//
// 환경 변수:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   PORTONE_API_SECRET
//   PORTONE_WEBHOOK_SECRET   - 웹훅 시그니처 검증 키 (선택)
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

    // POST만 허용
    if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 })
    }

    try {
        const body = await req.json()

        // PortOne V2 웹훅 페이로드 구조
        // { type: "Transaction.Paid" | "Transaction.Cancelled" | ..., data: { paymentId, transactionId, ... } }
        const { type, data } = body

        if (!type || !data?.paymentId) {
            return new Response(
                JSON.stringify({ error: "유효하지 않은 웹훅 데이터입니다" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            )
        }

        const portoneSecret = Deno.env.get("PORTONE_API_SECRET")
        if (!portoneSecret) {
            throw new Error("PORTONE_API_SECRET 환경 변수가 설정되지 않았습니다")
        }

        // PortOne REST API로 실제 결제 정보 조회 (웹훅 데이터를 맹신하지 않음)
        const portoneResponse = await fetch(
            `https://api.portone.io/payments/${encodeURIComponent(data.paymentId)}`,
            {
                method: "GET",
                headers: {
                    Authorization: `PortOne ${portoneSecret}`,
                },
            }
        )

        if (!portoneResponse.ok) {
            throw new Error(`PortOne API 오류: ${portoneResponse.status}`)
        }

        const paymentData = await portoneResponse.json()

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        )

        // 이벤트 유형에 따라 처리
        switch (type) {
            case "Transaction.Paid": {
                await supabase
                    .from("payments")
                    .upsert(
                        {
                            payment_id: data.paymentId,
                            order_name: paymentData.orderName || "결제",
                            amount: paymentData.amount?.total || 0,
                            currency: paymentData.currency || "KRW",
                            pay_method: paymentData.method?.type || "CARD",
                            status: "paid",
                            pg_provider: paymentData.pgProvider || null,
                            pg_tx_id: paymentData.pgTxId || null,
                            receipt_url: paymentData.receiptUrl || null,
                            card_name: paymentData.method?.card?.name || null,
                            card_number: paymentData.method?.card?.number || null,
                            paid_at: paymentData.paidAt || new Date().toISOString(),
                            metadata: {
                                webhook_type: type,
                                webhook_received_at: new Date().toISOString(),
                            },
                        },
                        { onConflict: "payment_id" }
                    )
                break
            }

            case "Transaction.Cancelled": {
                await supabase
                    .from("payments")
                    .update({
                        status: "cancelled",
                        cancelled_at: paymentData.cancelledAt || new Date().toISOString(),
                        cancel_reason: paymentData.cancellations?.[0]?.reason || "사용자 취소",
                    })
                    .eq("payment_id", data.paymentId)
                break
            }

            case "Transaction.Failed": {
                await supabase
                    .from("payments")
                    .update({
                        status: "failed",
                        failed_at: new Date().toISOString(),
                    })
                    .eq("payment_id", data.paymentId)
                break
            }

            default: {
                console.log(`처리하지 않는 웹훅 타입: ${type}`)
            }
        }

        console.log(`웹훅 처리 완료: ${type} / ${data.paymentId}`)

        return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        )
    } catch (err: any) {
        console.error("웹훅 처리 오류:", err)
        // 웹훅은 재시도가 있으므로 500 반환
        return new Response(
            JSON.stringify({ error: err.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        )
    }
})
