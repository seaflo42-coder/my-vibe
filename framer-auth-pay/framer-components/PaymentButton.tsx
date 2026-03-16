// =============================================
// PaymentButton.tsx
// Framer Code Component: PortOne V2 결제 버튼
//
// PortOne(구 아임포트) V2 SDK를 사용하여
// 카드, 계좌이체, 네이버페이 등 한국 결제를 처리합니다.
//
// 결제 흐름:
// 1. 사용자가 버튼 클릭
// 2. PortOne SDK가 PG 결제창 호출
// 3. 결제 완료 후 서버측 검증 (Edge Function)
// 4. 결과 표시
// =============================================

import { useState, useEffect, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"
import { supabase } from "./supabaseClient"
import { useAuth } from "./useAuth"

interface Props {
    storeId: string
    channelKey: string
    orderName: string
    amount: number
    payMethod: string
    buttonText: string
    accentColor: string
    borderRadius: number
    height: number
    showAmount: boolean
    customOrderId: string
}

// PortOne SDK 타입 (최소 정의)
interface PortOneSDK {
    requestPayment: (params: any) => Promise<any>
}

export default function PaymentButton(props: Props) {
    const {
        storeId = "",
        channelKey = "",
        orderName = "상품 결제",
        amount = 1000,
        payMethod = "CARD",
        buttonText = "결제하기",
        accentColor = "#6366F1",
        borderRadius = 12,
        height = 52,
        showAmount = true,
        customOrderId = "",
    } = props

    const { user } = useAuth()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState(false)
    const [sdkReady, setSdkReady] = useState(false)
    const portoneRef = useRef<PortOneSDK | null>(null)

    // PortOne V2 SDK 로딩
    useEffect(() => {
        let cancelled = false

        async function loadSDK() {
            // 방법 1: npm 패키지 (Framer에서 @portone/browser-sdk 설치 시)
            try {
                const mod = await import("@portone/browser-sdk/v2")
                if (!cancelled) {
                    portoneRef.current = mod as any
                    setSdkReady(true)
                }
                return
            } catch {
                // npm 패키지 없으면 CDN 폴백
            }

            // 방법 2: CDN script 태그
            if (typeof window !== "undefined") {
                // 이미 로드된 경우
                if ((window as any).PortOne) {
                    portoneRef.current = (window as any).PortOne
                    if (!cancelled) setSdkReady(true)
                    return
                }

                const script = document.createElement("script")
                script.src = "https://cdn.portone.io/v2/browser-sdk.js"
                script.async = true
                script.onload = () => {
                    if (!cancelled && (window as any).PortOne) {
                        portoneRef.current = (window as any).PortOne
                        setSdkReady(true)
                    }
                }
                script.onerror = () => {
                    if (!cancelled) setError("결제 모듈 로딩에 실패했습니다")
                }
                document.head.appendChild(script)
            }
        }

        loadSDK()
        return () => { cancelled = true }
    }, [])

    // 고유 주문 ID 생성
    function generatePaymentId(): string {
        if (customOrderId) return customOrderId
        const timestamp = Date.now().toString(36)
        const random = Math.random().toString(36).slice(2, 9)
        return `order-${timestamp}-${random}`
    }

    // 결제 처리
    async function handlePayment() {
        if (!portoneRef.current) {
            setError("결제 모듈이 아직 준비되지 않았습니다")
            return
        }
        if (!storeId || !channelKey) {
            setError("Store ID와 Channel Key를 설정해주세요")
            return
        }
        if (amount < 100) {
            setError("최소 결제 금액은 100원입니다")
            return
        }

        setLoading(true)
        setError("")
        setSuccess(false)

        const paymentId = generatePaymentId()

        try {
            // PortOne V2 결제 요청
            const paymentRequest: any = {
                storeId,
                channelKey,
                paymentId,
                orderName,
                totalAmount: amount,
                currency: "CURRENCY_KRW",
                payMethod,
            }

            // 로그인된 사용자 정보 첨부
            if (user) {
                paymentRequest.customer = {
                    customerId: user.id,
                    email: user.email || undefined,
                    fullName: user.user_metadata?.full_name || undefined,
                    phoneNumber: user.user_metadata?.phone_number || undefined,
                }
            }

            // 간편결제(네이버페이 등) 설정
            if (payMethod === "EASY_PAY") {
                paymentRequest.easyPay = {
                    easyPayProvider: "NAVERPAY",
                }
            }

            const response = await portoneRef.current.requestPayment(paymentRequest)

            // 결제 실패 (사용자 취소 포함)
            if (response?.code) {
                if (response.code === "FAILURE_TYPE_PG") {
                    setError(response.message || "PG사 오류가 발생했습니다")
                } else if (response.code === "PAY_PROCESS_CANCELED") {
                    setError("결제가 취소되었습니다")
                } else {
                    setError(response.message || "결제에 실패했습니다")
                }
                setLoading(false)
                return
            }

            // 서버측 결제 검증 (Supabase Edge Function)
            const { data: verifyResult, error: verifyError } =
                await supabase.functions.invoke("verify-payment", {
                    body: {
                        paymentId,
                        expectedAmount: amount,
                        orderName,
                        payMethod,
                    },
                })

            if (verifyError) {
                setError("결제 검증 요청에 실패했습니다. 고객센터에 문의해주세요.")
            } else if (verifyResult?.verified) {
                setSuccess(true)
                // 3초 후 성공 상태 초기화
                setTimeout(() => setSuccess(false), 3000)
            } else {
                setError(
                    verifyResult?.message ||
                    "결제 금액 검증에 실패했습니다. 고객센터에 문의해주세요."
                )
            }
        } catch (err: any) {
            setError(err.message || "결제 처리 중 오류가 발생했습니다")
        }

        setLoading(false)
    }

    // 결제 수단 한글 표시
    const PAY_METHOD_LABELS: Record<string, string> = {
        CARD: "카드",
        TRANSFER: "계좌이체",
        VIRTUAL_ACCOUNT: "가상계좌",
        MOBILE: "휴대폰",
        EASY_PAY: "간편결제",
    }

    const fontFamily = "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif"

    // 버튼 텍스트 결정
    function getButtonText(): string {
        if (loading) return "결제 처리 중..."
        if (success) return "결제 완료 ✓"

        const amountText = showAmount ? ` ${amount.toLocaleString("ko-KR")}원` : ""
        return `${buttonText}${amountText}`
    }

    return (
        <div style={{ width: "100%", fontFamily }}>
            <button
                onClick={handlePayment}
                disabled={loading || !sdkReady}
                style={{
                    width: "100%",
                    height,
                    backgroundColor: success ? "#10B981" : accentColor,
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius,
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: loading || !sdkReady ? "not-allowed" : "pointer",
                    opacity: loading || !sdkReady ? 0.7 : 1,
                    transition: "all 0.2s",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "0 24px",
                }}
                onMouseDown={(e) => {
                    if (!loading && sdkReady) e.currentTarget.style.transform = "scale(0.98)"
                }}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
                {!sdkReady && !error && (
                    <span style={{ fontSize: 14 }}>결제 모듈 로딩 중...</span>
                )}
                {sdkReady && getButtonText()}
            </button>

            {/* 결제 수단 표시 */}
            {sdkReady && !error && !success && (
                <p
                    style={{
                        fontSize: 12,
                        color: "#9CA3AF",
                        textAlign: "center",
                        margin: "6px 0 0 0",
                    }}
                >
                    {PAY_METHOD_LABELS[payMethod] || payMethod} 결제
                </p>
            )}

            {/* 에러 메시지 */}
            {error && (
                <p
                    style={{
                        color: "#EF4444",
                        fontSize: 13,
                        margin: "8px 0 0 0",
                        textAlign: "center",
                    }}
                >
                    {error}
                </p>
            )}
        </div>
    )
}

addPropertyControls(PaymentButton, {
    storeId: {
        type: ControlType.String,
        title: "Store ID",
        description: "PortOne 관리자 콘솔의 Store ID",
        defaultValue: "",
    },
    channelKey: {
        type: ControlType.String,
        title: "Channel Key",
        description: "PortOne 결제 채널 키",
        defaultValue: "",
    },
    orderName: {
        type: ControlType.String,
        title: "주문명",
        defaultValue: "상품 결제",
    },
    amount: {
        type: ControlType.Number,
        title: "결제 금액 (원)",
        defaultValue: 1000,
        min: 100,
        step: 100,
    },
    payMethod: {
        type: ControlType.Enum,
        title: "결제 수단",
        options: ["CARD", "TRANSFER", "VIRTUAL_ACCOUNT", "MOBILE", "EASY_PAY"],
        optionTitles: ["카드", "계좌이체", "가상계좌", "휴대폰", "간편결제 (네이버페이)"],
        defaultValue: "CARD",
    },
    buttonText: {
        type: ControlType.String,
        title: "버튼 텍스트",
        defaultValue: "결제하기",
    },
    showAmount: {
        type: ControlType.Boolean,
        title: "금액 표시",
        defaultValue: true,
    },
    accentColor: {
        type: ControlType.Color,
        title: "버튼 색상",
        defaultValue: "#6366F1",
    },
    borderRadius: {
        type: ControlType.Number,
        title: "모서리 둥글기",
        defaultValue: 12,
        min: 0,
        max: 24,
    },
    height: {
        type: ControlType.Number,
        title: "버튼 높이",
        defaultValue: 52,
        min: 40,
        max: 72,
    },
    customOrderId: {
        type: ControlType.String,
        title: "주문 ID (선택)",
        placeholder: "자동 생성",
        defaultValue: "",
    },
})
