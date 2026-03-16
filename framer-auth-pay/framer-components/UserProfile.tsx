// =============================================
// UserProfile.tsx
// Framer Code Component: 사용자 프로필 표시
//
// 로그인된 사용자의 정보를 표시합니다.
// 아바타, 이름, 이메일, 로그아웃 버튼을 포함합니다.
// =============================================

import { addPropertyControls, ControlType } from "framer"
import { useAuth } from "./useAuth"

interface Props {
    showAvatar: boolean
    showEmail: boolean
    showPhone: boolean
    showLogoutButton: boolean
    avatarSize: number
    logoutText: string
    accentColor: string
    borderRadius: number
    layout: "horizontal" | "vertical"
    notLoggedInText: string
}

export default function UserProfile(props: Props) {
    const {
        showAvatar = true,
        showEmail = true,
        showPhone = false,
        showLogoutButton = true,
        avatarSize = 48,
        logoutText = "로그아웃",
        accentColor = "#6366F1",
        borderRadius = 12,
        layout = "horizontal",
        notLoggedInText = "로그인이 필요합니다",
    } = props

    const { user, profile, loading, signOut } = useAuth()

    const fontFamily = "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif"

    // 로딩 상태
    if (loading) {
        return (
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 16,
                    fontFamily,
                    color: "#9CA3AF",
                    fontSize: 14,
                }}
            >
                로딩 중...
            </div>
        )
    }

    // 미로그인 상태
    if (!user) {
        return (
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 16,
                    fontFamily,
                    color: "#9CA3AF",
                    fontSize: 14,
                }}
            >
                {notLoggedInText}
            </div>
        )
    }

    const isVertical = layout === "vertical"

    // 아바타 기본 이니셜
    const initials = (profile?.full_name || user.email || "?").charAt(0).toUpperCase()

    return (
        <div
            style={{
                display: "flex",
                flexDirection: isVertical ? "column" : "row",
                alignItems: "center",
                gap: isVertical ? 12 : 16,
                fontFamily,
                width: "100%",
            }}
        >
            {/* 아바타 */}
            {showAvatar && (
                <div
                    style={{
                        width: avatarSize,
                        height: avatarSize,
                        borderRadius: "50%",
                        overflow: "hidden",
                        flexShrink: 0,
                        backgroundColor: "#E5E7EB",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    {profile?.avatar_url ? (
                        <img
                            src={profile.avatar_url}
                            alt=""
                            style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                            }}
                        />
                    ) : (
                        <span
                            style={{
                                fontSize: avatarSize * 0.4,
                                fontWeight: 700,
                                color: "#6B7280",
                            }}
                        >
                            {initials}
                        </span>
                    )}
                </div>
            )}

            {/* 사용자 정보 */}
            <div
                style={{
                    flex: 1,
                    textAlign: isVertical ? "center" : "left",
                    minWidth: 0,
                }}
            >
                <p
                    style={{
                        fontWeight: 600,
                        fontSize: 16,
                        margin: 0,
                        color: "#111827",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {profile?.full_name || user.email?.split("@")[0] || "사용자"}
                </p>
                {showEmail && user.email && (
                    <p
                        style={{
                            fontSize: 13,
                            color: "#6B7280",
                            margin: "2px 0 0 0",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {user.email}
                    </p>
                )}
                {showPhone && profile?.phone_number && (
                    <p
                        style={{
                            fontSize: 13,
                            color: "#6B7280",
                            margin: "2px 0 0 0",
                        }}
                    >
                        {profile.phone_number.replace(
                            /^\+82(\d{2})(\d{4})(\d{4})$/,
                            "0$1-$2-$3"
                        )}
                    </p>
                )}
                {profile?.provider && (
                    <span
                        style={{
                            display: "inline-block",
                            marginTop: 4,
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 500,
                            backgroundColor:
                                profile.provider === "kakao"
                                    ? "#FEE500"
                                    : profile.provider === "naver"
                                    ? "#03C75A"
                                    : profile.provider === "google"
                                    ? "#E8EAED"
                                    : "#F3F4F6",
                            color:
                                profile.provider === "naver"
                                    ? "#FFFFFF"
                                    : "#333333",
                        }}
                    >
                        {profile.provider === "kakao"
                            ? "카카오"
                            : profile.provider === "naver"
                            ? "네이버"
                            : profile.provider === "google"
                            ? "구글"
                            : "이메일"}
                    </span>
                )}
            </div>

            {/* 로그아웃 버튼 */}
            {showLogoutButton && (
                <button
                    onClick={signOut}
                    style={{
                        padding: "8px 16px",
                        backgroundColor: "transparent",
                        color: "#6B7280",
                        border: "1px solid #D1D5DB",
                        borderRadius,
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        whiteSpace: "nowrap",
                        transition: "background-color 0.2s, color 0.2s",
                        flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#F3F4F6"
                        e.currentTarget.style.color = "#374151"
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent"
                        e.currentTarget.style.color = "#6B7280"
                    }}
                >
                    {logoutText}
                </button>
            )}
        </div>
    )
}

addPropertyControls(UserProfile, {
    layout: {
        type: ControlType.Enum,
        title: "레이아웃",
        options: ["horizontal", "vertical"],
        optionTitles: ["가로", "세로"],
        defaultValue: "horizontal",
    },
    showAvatar: {
        type: ControlType.Boolean,
        title: "프로필 이미지",
        defaultValue: true,
    },
    avatarSize: {
        type: ControlType.Number,
        title: "프로필 크기",
        defaultValue: 48,
        min: 24,
        max: 96,
        hidden: (props: any) => !props.showAvatar,
    },
    showEmail: {
        type: ControlType.Boolean,
        title: "이메일 표시",
        defaultValue: true,
    },
    showPhone: {
        type: ControlType.Boolean,
        title: "전화번호 표시",
        defaultValue: false,
    },
    showLogoutButton: {
        type: ControlType.Boolean,
        title: "로그아웃 버튼",
        defaultValue: true,
    },
    logoutText: {
        type: ControlType.String,
        title: "로그아웃 텍스트",
        defaultValue: "로그아웃",
        hidden: (props: any) => !props.showLogoutButton,
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
    notLoggedInText: {
        type: ControlType.String,
        title: "미로그인 텍스트",
        defaultValue: "로그인이 필요합니다",
    },
})
