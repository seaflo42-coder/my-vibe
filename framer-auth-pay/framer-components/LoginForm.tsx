// =============================================
// LoginForm.tsx
// Framer Code Component: 이메일/비밀번호 로그인 폼
//
// 이메일과 비밀번호를 입력하여 로그인합니다.
// 비밀번호 찾기 기능을 포함합니다.
// =============================================

import { useState } from "react"
import { addPropertyControls, ControlType } from "framer"
import { supabase } from "./supabaseClient"

interface Props {
    accentColor: string
    borderRadius: number
    showForgotPassword: boolean
    inputHeight: number
}

export default function LoginForm(props: Props) {
    const {
        accentColor = "#6366F1",
        borderRadius = 12,
        showForgotPassword = true,
        inputHeight = 48,
    } = props

    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [message, setMessage] = useState("")

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()
        if (!email.trim() || !password.trim()) {
            setError("이메일과 비밀번호를 입력해주세요")
            return
        }

        setLoading(true)
        setError("")
        setMessage("")

        try {
            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            })
            if (authError) {
                if (authError.message.includes("Invalid login")) {
                    throw new Error("이메일 또는 비밀번호가 올바르지 않습니다")
                }
                throw authError
            }
        } catch (err: any) {
            setError(err.message || "로그인에 실패했습니다")
        }
        setLoading(false)
    }

    async function handleForgotPassword() {
        if (!email.trim()) {
            setError("비밀번호를 찾으려면 이메일을 먼저 입력해주세요")
            return
        }

        setLoading(true)
        setError("")
        setMessage("")

        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
            })
            if (resetError) throw resetError
            setMessage("비밀번호 재설정 이메일을 발송했습니다. 이메일을 확인해주세요.")
        } catch (err: any) {
            setError(err.message || "이메일 발송에 실패했습니다")
        }
        setLoading(false)
    }

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

    return (
        <form
            onSubmit={handleLogin}
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                width: "100%",
                fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif",
            }}
        >
            {/* 이메일 */}
            <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6, color: "#374151" }}>
                    이메일
                </label>
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
                <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6, color: "#374151" }}>
                    비밀번호
                </label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호를 입력하세요"
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = accentColor)}
                    onBlur={(e) => (e.target.style.borderColor = "#D1D5DB")}
                    autoComplete="current-password"
                />
            </div>

            {/* 비밀번호 찾기 */}
            {showForgotPassword && (
                <div style={{ textAlign: "right" }}>
                    <button
                        type="button"
                        onClick={handleForgotPassword}
                        style={{
                            background: "none",
                            border: "none",
                            color: accentColor,
                            fontSize: 13,
                            cursor: "pointer",
                            padding: 0,
                            fontFamily: "inherit",
                            textDecoration: "underline",
                        }}
                    >
                        비밀번호를 잊으셨나요?
                    </button>
                </div>
            )}

            {/* 에러 메시지 */}
            {error && (
                <p style={{ color: "#EF4444", fontSize: 13, margin: 0, textAlign: "center" }}>{error}</p>
            )}

            {/* 성공 메시지 */}
            {message && (
                <p style={{ color: "#10B981", fontSize: 13, margin: 0, textAlign: "center" }}>{message}</p>
            )}

            {/* 로그인 버튼 */}
            <button
                type="submit"
                disabled={loading}
                style={{
                    width: "100%",
                    height: inputHeight,
                    backgroundColor: accentColor,
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius,
                    fontSize: 16,
                    fontWeight: 600,
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
                {loading ? "로그인 중..." : "로그인"}
            </button>
        </form>
    )
}

addPropertyControls(LoginForm, {
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
    showForgotPassword: {
        type: ControlType.Boolean,
        title: "비밀번호 찾기",
        defaultValue: true,
    },
    inputHeight: {
        type: ControlType.Number,
        title: "입력창 높이",
        defaultValue: 48,
        min: 36,
        max: 64,
    },
})
