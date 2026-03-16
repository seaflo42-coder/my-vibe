// =============================================
// PaymentHistory.tsx
// Framer Code Component: 결제 내역 리스트
//
// 로그인된 사용자의 결제 내역을 조회하여 표시합니다.
// 영수증 링크, 상태별 필터링을 지원합니다.
// =============================================

import { useState, useEffect } from "react"
import { addPropertyControls, ControlType } from "framer"
import { supabase } from "./supabaseClient"
import { useAuth } from "./useAuth"

interface Payment {
    id: string
    payment_id: string
    order_name: string
    amount: number
    pay_method: string
    status: string
    pg_provider: string | null
    card_name: string | null
    card_number: string | null
    receipt_url: string | null
    paid_at: string | null
    cancelled_at: string | null
    cancel_reason: string | null
    created_at: string
}

interface Props {
    limit: number
    showReceipt: boolean
    showPayMethod: boolean
    statusFilter: string
    emptyMessage: string
    accentColor: string
    borderRadius: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
    pending: { label: "처리 중", color: "#D97706", bgColor: "#FEF3C7" },
    paid: { label: "결제 완료", color: "#059669", bgColor: "#D1FAE5" },
    failed: { label: "결제 실패", color: "#DC2626", bgColor: "#FEE2E2" },
    cancelled: { label: "취소됨", color: "#6B7280", bgColor: "#F3F4F6" },
}

const PAY_METHOD_LABELS: Record<string, string> = {
    CARD: "카드",
    TRANSFER: "계좌이체",
    VIRTUAL_ACCOUNT: "가상계좌",
    MOBILE: "휴대폰",
    EASY_PAY: "간편결제",
}

export default function PaymentHistory(props: Props) {
    const {
        limit = 10,
        showReceipt = true,
        showPayMethod = true,
        statusFilter = "all",
        emptyMessage = "결제 내역이 없습니다",
        accentColor = "#6366F1",
        borderRadius = 12,
    } = props

    const { user, loading: authLoading } = useAuth()
    const [payments, setPayments] = useState<Payment[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")

    useEffect(() => {
        if (!user) {
            setLoading(false)
            return
        }

        async function fetchPayments() {
            setLoading(true)
            setError("")

            try {
                let query = supabase
                    .from("payments")
                    .select("*")
                    .eq("user_id", user!.id)
                    .order("created_at", { ascending: false })
                    .limit(limit)

                if (statusFilter !== "all") {
                    query = query.eq("status", statusFilter)
                }

                const { data, error: fetchError } = await query
                if (fetchError) throw fetchError
                setPayments((data as Payment[]) || [])
            } catch (err: any) {
                setError(err.message || "결제 내역을 불러오는데 실패했습니다")
            }
            setLoading(false)
        }

        fetchPayments()
    }, [user, limit, statusFilter])

    const fontFamily = "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif"

    // 로딩
    if (authLoading || loading) {
        return (
            <div style={{ fontFamily, padding: 24, textAlign: "center" }}>
                <div
                    style={{
                        display: "inline-flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                        color: "#9CA3AF",
                    }}
                >
                    <div
                        style={{
                            width: 24,
                            height: 24,
                            border: "2px solid #E5E7EB",
                            borderTopColor: accentColor,
                            borderRadius: "50%",
                            animation: "spin 0.8s linear infinite",
                        }}
                    />
                    <span style={{ fontSize: 14 }}>로딩 중...</span>
                    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                </div>
            </div>
        )
    }

    // 미로그인
    if (!user) {
        return (
            <div
                style={{
                    fontFamily,
                    padding: 24,
                    textAlign: "center",
                    color: "#9CA3AF",
                    fontSize: 14,
                }}
            >
                로그인이 필요합니다
            </div>
        )
    }

    // 에러
    if (error) {
        return (
            <div
                style={{
                    fontFamily,
                    padding: 24,
                    textAlign: "center",
                    color: "#EF4444",
                    fontSize: 14,
                }}
            >
                {error}
            </div>
        )
    }

    // 빈 상태
    if (payments.length === 0) {
        return (
            <div
                style={{
                    fontFamily,
                    padding: 40,
                    textAlign: "center",
                }}
            >
                <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>📋</div>
                <p style={{ color: "#9CA3AF", fontSize: 14, margin: 0 }}>{emptyMessage}</p>
            </div>
        )
    }

    // 날짜 포맷
    function formatDate(dateStr: string): string {
        const date = new Date(dateStr)
        return date.toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
        })
    }

    function formatTime(dateStr: string): string {
        const date = new Date(dateStr)
        return date.toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
        })
    }

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                width: "100%",
                fontFamily,
            }}
        >
            {payments.map((payment) => {
                const statusConf = STATUS_CONFIG[payment.status] || STATUS_CONFIG.pending

                return (
                    <div
                        key={payment.id}
                        style={{
                            padding: 16,
                            border: "1px solid #E5E7EB",
                            borderRadius,
                            backgroundColor: "#FFFFFF",
                            transition: "box-shadow 0.2s",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.boxShadow = "none"
                        }}
                    >
                        {/* 상단: 주문명 + 금액 */}
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                marginBottom: 8,
                            }}
                        >
                            <span
                                style={{
                                    fontWeight: 600,
                                    fontSize: 15,
                                    color: "#111827",
                                    flex: 1,
                                    marginRight: 12,
                                }}
                            >
                                {payment.order_name}
                            </span>
                            <span
                                style={{
                                    fontWeight: 700,
                                    fontSize: 16,
                                    color: "#111827",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {payment.amount.toLocaleString("ko-KR")}원
                            </span>
                        </div>

                        {/* 중간: 날짜 + 상태 배지 */}
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: showPayMethod || (showReceipt && payment.receipt_url) ? 8 : 0,
                            }}
                        >
                            <span style={{ fontSize: 13, color: "#6B7280" }}>
                                {formatDate(payment.paid_at || payment.created_at)}
                                {" "}
                                {formatTime(payment.paid_at || payment.created_at)}
                            </span>
                            <span
                                style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: statusConf.color,
                                    backgroundColor: statusConf.bgColor,
                                    padding: "3px 10px",
                                    borderRadius: 6,
                                }}
                            >
                                {statusConf.label}
                            </span>
                        </div>

                        {/* 하단: 결제 수단 + 카드 정보 + 영수증 */}
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                            }}
                        >
                            {showPayMethod && (
                                <span style={{ fontSize: 12, color: "#9CA3AF" }}>
                                    {PAY_METHOD_LABELS[payment.pay_method] || payment.pay_method}
                                    {payment.card_name && ` · ${payment.card_name}`}
                                    {payment.card_number && ` (${payment.card_number})`}
                                </span>
                            )}
                            {showReceipt && payment.receipt_url && payment.status === "paid" && (
                                <a
                                    href={payment.receipt_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        fontSize: 13,
                                        color: accentColor,
                                        textDecoration: "none",
                                        fontWeight: 500,
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.textDecoration = "underline"
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.textDecoration = "none"
                                    }}
                                >
                                    영수증 →
                                </a>
                            )}
                        </div>

                        {/* 취소 사유 */}
                        {payment.status === "cancelled" && payment.cancel_reason && (
                            <p
                                style={{
                                    fontSize: 12,
                                    color: "#6B7280",
                                    margin: "8px 0 0 0",
                                    padding: "8px 12px",
                                    backgroundColor: "#F9FAFB",
                                    borderRadius: 8,
                                }}
                            >
                                취소 사유: {payment.cancel_reason}
                            </p>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

addPropertyControls(PaymentHistory, {
    limit: {
        type: ControlType.Number,
        title: "표시 개수",
        defaultValue: 10,
        min: 1,
        max: 50,
    },
    statusFilter: {
        type: ControlType.Enum,
        title: "상태 필터",
        options: ["all", "paid", "pending", "cancelled", "failed"],
        optionTitles: ["전체", "결제 완료", "처리 중", "취소됨", "실패"],
        defaultValue: "all",
    },
    showReceipt: {
        type: ControlType.Boolean,
        title: "영수증 링크",
        defaultValue: true,
    },
    showPayMethod: {
        type: ControlType.Boolean,
        title: "결제 수단 표시",
        defaultValue: true,
    },
    emptyMessage: {
        type: ControlType.String,
        title: "빈 상태 메시지",
        defaultValue: "결제 내역이 없습니다",
    },
    accentColor: {
        type: ControlType.Color,
        title: "강조 색상",
        defaultValue: "#6366F1",
    },
    borderRadius: {
        type: ControlType.Number,
        title: "모서리 둥글기",
        defaultValue: 12,
        min: 0,
        max: 24,
    },
})
