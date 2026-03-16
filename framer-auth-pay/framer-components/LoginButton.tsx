// =============================================
// LoginButton.tsx
// Framer Code Component: 소셜 로그인 버튼
//
// 카카오, 네이버, 구글 소셜 로그인을 지원합니다.
// 각 플랫폼의 브랜드 가이드라인을 준수합니다.
//
// 프레이머 에디터에서 속성 패널로 로그인 제공자,
// 버튼 텍스트, 스타일 등을 커스터마이징할 수 있습니다.
// =============================================

import { useState } from "react"
import { addPropertyControls, ControlType } from "framer"
import { supabase } from "./supabaseClient"

type Provider = "kakao" | "naver" | "google"

interface Props {
    provider: Provider
    buttonText: string
    borderRadius: number
    fontSize: number
    width: string | number
    height: number
}

// 소셜 로그인 제공자별 브랜드 설정
const PROVIDER_CONFIG: Record<
    Provider,
    {
        label: string
        bgColor: string
        textColor: string
        borderColor: string
        iconSvg: string
    }
> = {
    kakao: {
        label: "카카오 로그인",
        bgColor: "#FEE500",
        textColor: "#191919",
        borderColor: "transparent",
        // 카카오 말풍선 아이콘 (간략화)
        iconSvg: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M9 0.6C4.03 0.6 0 3.72 0 7.55C0 9.94 1.56 12.05 3.93 13.29L2.93 16.82C2.85 17.1 3.18 17.32 3.43 17.16L7.7 14.39C8.13 14.44 8.56 14.47 9 14.47C13.97 14.47 18 11.35 18 7.52C18 3.72 13.97 0.6 9 0.6Z" fill="#191919"/>
    </svg>`,
    },
    naver: {
        label: "네이버 로그인",
        bgColor: "#03C75A",
        textColor: "#FFFFFF",
        borderColor: "transparent",
        // 네이버 N 아이콘
        iconSvg: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10.85 8.55L4.95 0H0V16H5.15V7.45L11.05 16H16V0H10.85V8.55Z" fill="white"/>
    </svg>`,
    },
    google: {
        label: "구글 로그인",
        bgColor: "#FFFFFF",
        textColor: "#333333",
        borderColor: "#DADCE0",
        // 구글 G 아이콘 (간략화)
        iconSvg: `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92a8.78 8.78 0 002.68-6.62z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 009 18z" fill="#34A853"/>
      <path d="M3.96 10.71A5.41 5.41 0 013.68 9c0-.6.1-1.17.28-1.71V4.96H.96A9 9 0 000 9c0 1.45.35 2.83.96 4.04l3-2.33z" fill="#FBBC05"/>
      <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 00.96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z" fill="#EA4335"/>
    </svg>`,
    },
}

export default function LoginButton(props: Props) {
    const {
        provider = "kakao",
        buttonText = "",
        borderRadius = 12,
        fontSize = 15,
        height = 48,
    } = props

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    const config = PROVIDER_CONFIG[provider]
    const displayText = buttonText || config.label

    async function handleLogin() {
        setLoading(true)
        setError("")

        try {
            if (provider === "naver") {
                // 네이버는 Supabase에서 네이티브 지원 안 함
                // Keycloak 프록시를 통해 연동
                const { error: authError } = await supabase.auth.signInWithOAuth({
                    provider: "keycloak" as any,
                    options: {
                        scopes: "openid profile email",
                        redirectTo: window.location.origin,
                    },
                })
                if (authError) throw authError
            } else {
                // 카카오, 구글은 네이티브 지원
                const { error: authError } = await supabase.auth.signInWithOAuth({
                    provider,
                    options: {
                        redirectTo: window.location.origin,
                    },
                })
                if (authError) throw authError
            }
        } catch (err: any) {
            setError(err.message || "로그인에 실패했습니다")
            setLoading(false)
        }
    }

    return (
        <div style={{ width: "100%", fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif" }}>
            <button
                onClick={handleLogin}
                disabled={loading}
                style={{
                    width: "100%",
                    height,
                    backgroundColor: config.bgColor,
                    color: config.textColor,
                    border: config.borderColor !== "transparent" ? `1px solid ${config.borderColor}` : "none",
                    borderRadius,
                    fontSize,
                    fontWeight: 600,
                    cursor: loading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    opacity: loading ? 0.7 : 1,
                    transition: "opacity 0.2s, transform 0.1s",
                    fontFamily: "inherit",
                    padding: "0 24px",
                    lineHeight: 1,
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
                <span
                    dangerouslySetInnerHTML={{ __html: config.iconSvg }}
                    style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
                />
                <span>{loading ? "로그인 중..." : displayText}</span>
            </button>
            {error && (
                <p
                    style={{
                        color: "#EF4444",
                        fontSize: 13,
                        marginTop: 8,
                        textAlign: "center",
                        margin: "8px 0 0 0",
                    }}
                >
                    {error}
                </p>
            )}
        </div>
    )
}

addPropertyControls(LoginButton, {
    provider: {
        type: ControlType.Enum,
        title: "소셜 로그인",
        options: ["kakao", "naver", "google"],
        optionTitles: ["카카오", "네이버", "구글"],
        defaultValue: "kakao",
    },
    buttonText: {
        type: ControlType.String,
        title: "버튼 텍스트",
        placeholder: "자동 설정 (예: 카카오 로그인)",
        defaultValue: "",
    },
    borderRadius: {
        type: ControlType.Number,
        title: "모서리 둥글기",
        defaultValue: 12,
        min: 0,
        max: 24,
        step: 1,
    },
    fontSize: {
        type: ControlType.Number,
        title: "글씨 크기",
        defaultValue: 15,
        min: 12,
        max: 20,
    },
    height: {
        type: ControlType.Number,
        title: "버튼 높이",
        defaultValue: 48,
        min: 36,
        max: 64,
    },
})
