// =============================================
// SignUpForm.tsx
// Framer Code Component: 한국형 회원가입 폼
//
// - 이메일/비밀번호 회원가입
// - 한국 휴대폰 번호 SMS 인증
// - 개인정보 수집/이용 동의 (필수)
// - 마케팅 정보 수신 동의 (선택)
// =============================================

import { useState } from "react"
import { addPropertyControls, ControlType } from "framer"
import { supabase } from "./supabaseClient"

interface Props {
    showPhoneVerification: boolean
    showPrivacyConsent: boolean
    showMarketingConsent: boolean
    accentColor: string
    borderRadius: number
    inputHeight: number
    privacyPolicyUrl: string
}

export default function SignUpForm(props: Props) {
    const {
        showPhoneVerification = true,
        showPrivacyConsent = true,
        showMarketingConsent = true,
        accentColor = "#6366F1",
        borderRadius = 12,
        inputHeight = 48,
        privacyPolicyUrl = "",
    } = props

    // 폼 상태
    const [fullName, setFullName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [passwordConfirm, setPasswordConfirm] = useState("")

    // 휴대폰 인증 상태
    const [phoneNumber, setPhoneNumber] = useState("")
    const [verificationCode, setVerificationCode] = useState("")
    const [codeSent, setCodeSent] = useState(false)
    const [phoneVerified, setPhoneVerified] = useState(false)
    const [codeTimer, setCodeTimer] = useState(0)

    // 동의 상태
    const [privacyConsent, setPrivacyConsent] = useState(false)
    const [marketingConsent, setMarketingConsent] = useState(false)

    // UI 상태
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [step, setStep] = useState<"form" | "success">("form")

    // 한국 전화번호 포맷: 010-XXXX-XXXX → +8210XXXXXXXX
    function formatKoreanPhone(input: string): string {
        const digits = input.replace(/\D/g, "")
        if (digits.startsWith("0")) return "+82" + digits.slice(1)
        if (digits.startsWith("82")) return "+" + digits
        return "+82" + digits
    }

    // 전화번호 표시 포맷: 010XXXXXXXX → 010-XXXX-XXXX
    function displayPhone(input: string): string {
        const digits = input.replace(/\D/g, "")
        if (digits.length === 11) {
            return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
        }
        return input
    }

    // 타이머 시작 (5분)
    function startTimer() {
        setCodeTimer(300)
        const interval = setInterval(() => {
            setCodeTimer((prev) => {
                if (prev <= 1) {
                    clearInterval(interval)
                    return 0
                }
                return prev - 1
            })
        }, 1000)
    }

    // 인증번호 발송
    async function handleSendCode() {
        const digits = phoneNumber.replace(/\D/g, "")
        if (digits.length < 10 || digits.length > 11) {
            setError("올바른 휴대폰 번호를 입력해주세요")
            return
        }

        setLoading(true)
        setError("")

        try {
            const formatted = formatKoreanPhone(phoneNumber)
            const { error: fnError } = await supabase.functions.invoke("send-sms-verification", {
                body: { phoneNumber: formatted },
            })
            if (fnError) throw new Error(fnError.message || "인증번호 발송에 실패했습니다")

            setCodeSent(true)
            startTimer()
        } catch (err: any) {
            setError(err.message || "인증번호 발송에 실패했습니다")
        }
        setLoading(false)
    }

    // 인증번호 확인
    async function handleVerifyCode() {
        if (verificationCode.length !== 6) {
            setError("6자리 인증번호를 입력해주세요")
            return
        }

        setLoading(true)
        setError("")

        try {
            const formatted = formatKoreanPhone(phoneNumber)
            const { data, error: fnError } = await supabase.functions.invoke("verify-sms-code", {
                body: { phoneNumber: formatted, code: verificationCode },
            })
            if (fnError) throw new Error(fnError.message || "인증에 실패했습니다")

            if (data?.verified) {
                setPhoneVerified(true)
            } else {
                setError("인증번호가 올바르지 않습니다")
            }
        } catch (err: any) {
            setError(err.message || "인증에 실패했습니다")
        }
        setLoading(false)
    }

    // 회원가입 제출
    async function handleSignUp(e: React.FormEvent) {
        e.preventDefault()

        // 유효성 검사
        if (!fullName.trim()) {
            setError("이름을 입력해주세요")
            return
        }
        if (!email.trim()) {
            setError("이메일을 입력해주세요")
            return
        }
        if (password.length < 8) {
            setError("비밀번호는 8자 이상이어야 합니다")
            return
        }
        if (password !== passwordConfirm) {
            setError("비밀번호가 일치하지 않습니다")
            return
        }
        if (showPhoneVerification && !phoneVerified) {
            setError("휴대폰 인증을 완료해주세요")
            return
        }
        if (showPrivacyConsent && !privacyConsent) {
            setError("개인정보 수집/이용에 동의해주세요")
            return
        }

        setLoading(true)
        setError("")

        try {
            const { error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                        phone_number: showPhoneVerification ? formatKoreanPhone(phoneNumber) : undefined,
                        phone_verified: phoneVerified,
                        privacy_consent: privacyConsent,
                        privacy_consent_at: privacyConsent ? new Date().toISOString() : null,
                        marketing_consent: marketingConsent,
                        marketing_consent_at: marketingConsent ? new Date().toISOString() : null,
                    },
                },
            })
            if (signUpError) {
                if (signUpError.message.includes("already registered")) {
                    throw new Error("이미 가입된 이메일입니다")
                }
                throw signUpError
            }
            setStep("success")
        } catch (err: any) {
            setError(err.message || "회원가입에 실패했습니다")
        }
        setLoading(false)
    }

    // 공통 input 스타일
    const inputStyle: React.CSSProperties = {
        width: "100%",
        height: inputHeight,
        padding: "0 16px",
        border: "1px solid #D1D5DB",
        borderRadius,
        fontSize: 15,
        outline: "none",
        transition: "border-color 0.2s",
        fontFamily: "inherit",
        boxSizing: "border-box",
        backgroundColor: "#FFFFFF",
    }

    const labelStyle: React.CSSProperties = {
        display: "block",
        fontSize: 14,
        fontWeight: 500,
        marginBottom: 6,
        color: "#374151",
    }

    const smallBtnStyle: React.CSSProperties = {
        height: inputHeight,
        padding: "0 16px",
        backgroundColor: accentColor,
        color: "#FFFFFF",
        border: "none",
        borderRadius,
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
        fontFamily: "inherit",
        flexShrink: 0,
    }

    // ─── 회원가입 완료 화면 ───
    if (step === "success") {
        return (
            <div
                style={{
                    textAlign: "center",
                    padding: 40,
                    fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif",
                }}
            >
                <div
                    style={{
                        width: 64,
                        height: 64,
                        borderRadius: "50%",
                        backgroundColor: "#ECFDF5",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 16px",
                        fontSize: 28,
                    }}
                >
                    ✓
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: "#111827" }}>
                    회원가입이 완료되었습니다!
                </h2>
                <p style={{ fontSize: 15, color: "#6B7280", margin: 0, lineHeight: 1.6 }}>
                    입력하신 이메일로 인증 링크를 발송했습니다.
                    <br />
                    이메일을 확인하여 계정을 활성화해주세요.
                </p>
            </div>
        )
    }

    // ─── 회원가입 폼 ───
    return (
        <form
            onSubmit={handleSignUp}
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 20,
                width: "100%",
                fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif",
            }}
        >
            {/* 이름 */}
            <div>
                <label style={labelStyle}>이름</label>
                <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="홍길동"
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = accentColor)}
                    onBlur={(e) => (e.target.style.borderColor = "#D1D5DB")}
                    autoComplete="name"
                />
            </div>

            {/* 이메일 */}
            <div>
                <label style={labelStyle}>이메일</label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@email.com"
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = accentColor)}
                    onBlur={(e) => (e.target.style.borderColor = "#D1D5DB")}
                    autoComplete="email"
                />
            </div>

            {/* 비밀번호 */}
            <div>
                <label style={labelStyle}>비밀번호</label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8자 이상 입력하세요"
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = accentColor)}
                    onBlur={(e) => (e.target.style.borderColor = "#D1D5DB")}
                    autoComplete="new-password"
                />
            </div>

            {/* 비밀번호 확인 */}
            <div>
                <label style={labelStyle}>비밀번호 확인</label>
                <input
                    type="password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    placeholder="비밀번호를 다시 입력하세요"
                    style={{
                        ...inputStyle,
                        borderColor:
                            passwordConfirm && password !== passwordConfirm ? "#EF4444" : "#D1D5DB",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = accentColor)}
                    onBlur={(e) => {
                        e.target.style.borderColor =
                            passwordConfirm && password !== passwordConfirm ? "#EF4444" : "#D1D5DB"
                    }}
                    autoComplete="new-password"
                />
                {passwordConfirm && password !== passwordConfirm && (
                    <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0 0" }}>
                        비밀번호가 일치하지 않습니다
                    </p>
                )}
            </div>

            {/* 휴대폰 인증 */}
            {showPhoneVerification && (
                <div>
                    <label style={labelStyle}>
                        휴대폰 번호
                        {phoneVerified && (
                            <span style={{ color: "#10B981", marginLeft: 8, fontWeight: 400 }}>
                                인증완료 ✓
                            </span>
                        )}
                    </label>

                    {/* 번호 입력 + 인증번호 발송 */}
                    <div style={{ display: "flex", gap: 8 }}>
                        <input
                            type="tel"
                            value={phoneNumber}
                            onChange={(e) => {
                                // 숫자와 하이픈만 허용
                                const val = e.target.value.replace(/[^\d-]/g, "")
                                setPhoneNumber(displayPhone(val))
                            }}
                            placeholder="010-1234-5678"
                            disabled={phoneVerified}
                            style={{
                                ...inputStyle,
                                flex: 1,
                                opacity: phoneVerified ? 0.6 : 1,
                            }}
                            onFocus={(e) => (e.target.style.borderColor = accentColor)}
                            onBlur={(e) => (e.target.style.borderColor = "#D1D5DB")}
                            maxLength={13}
                        />
                        {!phoneVerified && (
                            <button
                                type="button"
                                onClick={handleSendCode}
                                disabled={loading || (codeSent && codeTimer > 0)}
                                style={{
                                    ...smallBtnStyle,
                                    opacity: loading || (codeSent && codeTimer > 0) ? 0.6 : 1,
                                    cursor: loading || (codeSent && codeTimer > 0) ? "not-allowed" : "pointer",
                                }}
                            >
                                {codeSent
                                    ? codeTimer > 0
                                        ? `재발송 (${Math.floor(codeTimer / 60)}:${String(codeTimer % 60).padStart(2, "0")})`
                                        : "재발송"
                                    : "인증번호 발송"}
                            </button>
                        )}
                    </div>

                    {/* 인증번호 입력 */}
                    {codeSent && !phoneVerified && (
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <input
                                type="text"
                                value={verificationCode}
                                onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, "").slice(0, 6)
                                    setVerificationCode(val)
                                }}
                                placeholder="인증번호 6자리"
                                style={{ ...inputStyle, flex: 1 }}
                                onFocus={(e) => (e.target.style.borderColor = accentColor)}
                                onBlur={(e) => (e.target.style.borderColor = "#D1D5DB")}
                                maxLength={6}
                                inputMode="numeric"
                            />
                            <button
                                type="button"
                                onClick={handleVerifyCode}
                                disabled={loading || verificationCode.length !== 6}
                                style={{
                                    ...smallBtnStyle,
                                    opacity: loading || verificationCode.length !== 6 ? 0.6 : 1,
                                    cursor:
                                        loading || verificationCode.length !== 6
                                            ? "not-allowed"
                                            : "pointer",
                                }}
                            >
                                확인
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* 약관 동의 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* 개인정보 수집/이용 동의 (필수) */}
                {showPrivacyConsent && (
                    <label
                        style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                            cursor: "pointer",
                            fontSize: 14,
                            color: "#374151",
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={privacyConsent}
                            onChange={(e) => setPrivacyConsent(e.target.checked)}
                            style={{
                                width: 18,
                                height: 18,
                                marginTop: 1,
                                accentColor: accentColor,
                                cursor: "pointer",
                                flexShrink: 0,
                            }}
                        />
                        <span>
                            <span style={{ color: "#EF4444", fontWeight: 600 }}>[필수]</span>{" "}
                            개인정보 수집/이용에 동의합니다
                            {privacyPolicyUrl && (
                                <a
                                    href={privacyPolicyUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        color: accentColor,
                                        marginLeft: 4,
                                        fontSize: 13,
                                        textDecoration: "underline",
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    전문 보기
                                </a>
                            )}
                        </span>
                    </label>
                )}

                {/* 마케팅 정보 수신 동의 (선택) */}
                {showMarketingConsent && (
                    <label
                        style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                            cursor: "pointer",
                            fontSize: 14,
                            color: "#374151",
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={marketingConsent}
                            onChange={(e) => setMarketingConsent(e.target.checked)}
                            style={{
                                width: 18,
                                height: 18,
                                marginTop: 1,
                                accentColor: accentColor,
                                cursor: "pointer",
                                flexShrink: 0,
                            }}
                        />
                        <span>
                            <span style={{ color: "#6B7280", fontWeight: 600 }}>[선택]</span>{" "}
                            마케팅 정보 수신에 동의합니다
                        </span>
                    </label>
                )}
            </div>

            {/* 에러 메시지 */}
            {error && (
                <p style={{ color: "#EF4444", fontSize: 13, margin: 0, textAlign: "center" }}>{error}</p>
            )}

            {/* 회원가입 버튼 */}
            <button
                type="submit"
                disabled={loading}
                style={{
                    width: "100%",
                    height: inputHeight + 4,
                    backgroundColor: accentColor,
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius,
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.7 : 1,
                    transition: "opacity 0.2s, transform 0.1s",
                    fontFamily: "inherit",
                }}
                onMouseDown={(e) => {
                    if (!loading) (e.currentTarget.style.transform = "scale(0.98)")
                }}
                onMouseUp={(e) => {
                    e.currentTarget.style.transform = "scale(1)"
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)"
                }}
            >
                {loading ? "처리 중..." : "회원가입"}
            </button>
        </form>
    )
}

addPropertyControls(SignUpForm, {
    showPhoneVerification: {
        type: ControlType.Boolean,
        title: "휴대폰 인증",
        defaultValue: true,
    },
    showPrivacyConsent: {
        type: ControlType.Boolean,
        title: "개인정보 동의",
        defaultValue: true,
    },
    showMarketingConsent: {
        type: ControlType.Boolean,
        title: "마케팅 동의",
        defaultValue: true,
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
    inputHeight: {
        type: ControlType.Number,
        title: "입력창 높이",
        defaultValue: 48,
        min: 36,
        max: 64,
    },
    privacyPolicyUrl: {
        type: ControlType.String,
        title: "개인정보처리방침 URL",
        placeholder: "https://example.com/privacy",
        defaultValue: "",
    },
})
