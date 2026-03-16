import { useState } from "react"
import LoginButton from "../framer-components/LoginButton"
import LoginForm from "../framer-components/LoginForm"
import SignUpForm from "../framer-components/SignUpForm"
import UserProfile from "../framer-components/UserProfile"
import PaymentButton from "../framer-components/PaymentButton"
import PaymentHistory from "../framer-components/PaymentHistory"

type Tab = "login" | "signup" | "profile" | "payment"

export default function App() {
    const [activeTab, setActiveTab] = useState<Tab>("login")

    const tabs: { id: Tab; label: string }[] = [
        { id: "login", label: "로그인" },
        { id: "signup", label: "회원가입" },
        { id: "profile", label: "프로필" },
        { id: "payment", label: "결제" },
    ]

    return (
        <div
            style={{
                minHeight: "100vh",
                backgroundColor: "#F9FAFB",
                fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif",
            }}
        >
            {/* 헤더 */}
            <header
                style={{
                    backgroundColor: "#FFFFFF",
                    borderBottom: "1px solid #E5E7EB",
                    padding: "16px 24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#111827" }}>
                    Framer 결제 시스템 데모
                </h1>
                <span
                    style={{
                        fontSize: 12,
                        color: "#9CA3AF",
                        padding: "4px 10px",
                        backgroundColor: "#F3F4F6",
                        borderRadius: 6,
                    }}
                >
                    로컬 프리뷰
                </span>
            </header>

            {/* 탭 네비게이션 */}
            <nav
                style={{
                    display: "flex",
                    gap: 0,
                    backgroundColor: "#FFFFFF",
                    borderBottom: "1px solid #E5E7EB",
                    padding: "0 24px",
                }}
            >
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: "14px 20px",
                            border: "none",
                            backgroundColor: "transparent",
                            color: activeTab === tab.id ? "#6366F1" : "#6B7280",
                            fontWeight: activeTab === tab.id ? 700 : 500,
                            fontSize: 14,
                            cursor: "pointer",
                            borderBottom: activeTab === tab.id ? "2px solid #6366F1" : "2px solid transparent",
                            fontFamily: "inherit",
                            transition: "all 0.2s",
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>

            {/* 콘텐츠 */}
            <main
                style={{
                    maxWidth: 440,
                    margin: "32px auto",
                    padding: "0 20px",
                }}
            >
                {activeTab === "login" && <LoginTab />}
                {activeTab === "signup" && <SignUpTab />}
                {activeTab === "profile" && <ProfileTab />}
                {activeTab === "payment" && <PaymentTab />}
            </main>
        </div>
    )
}

// ─── 로그인 탭 ───
function LoginTab() {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionCard title="소셜 로그인">
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <LoginButton provider="kakao" buttonText="" borderRadius={12} fontSize={15} width="100%" height={48} />
                    <LoginButton provider="naver" buttonText="" borderRadius={12} fontSize={15} width="100%" height={48} />
                    <LoginButton provider="google" buttonText="" borderRadius={12} fontSize={15} width="100%" height={48} />
                </div>
            </SectionCard>

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
                <span style={{ fontSize: 13, color: "#9CA3AF" }}>또는</span>
                <div style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
            </div>

            <SectionCard title="이메일 로그인">
                <LoginForm
                    accentColor="#6366F1"
                    borderRadius={12}
                    showForgotPassword={true}
                    inputHeight={48}
                />
            </SectionCard>
        </div>
    )
}

// ─── 회원가입 탭 ───
function SignUpTab() {
    return (
        <SectionCard title="회원가입">
            <SignUpForm
                showPhoneVerification={true}
                showPrivacyConsent={true}
                showMarketingConsent={true}
                accentColor="#6366F1"
                borderRadius={12}
                inputHeight={48}
                privacyPolicyUrl=""
            />
        </SectionCard>
    )
}

// ─── 프로필 탭 ───
function ProfileTab() {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionCard title="사용자 프로필 (가로)">
                <UserProfile
                    showAvatar={true}
                    showEmail={true}
                    showPhone={false}
                    showLogoutButton={true}
                    avatarSize={48}
                    logoutText="로그아웃"
                    accentColor="#6366F1"
                    borderRadius={12}
                    layout="horizontal"
                    notLoggedInText="로그인이 필요합니다"
                />
            </SectionCard>

            <SectionCard title="사용자 프로필 (세로)">
                <UserProfile
                    showAvatar={true}
                    showEmail={true}
                    showPhone={true}
                    showLogoutButton={true}
                    avatarSize={64}
                    logoutText="로그아웃"
                    accentColor="#6366F1"
                    borderRadius={12}
                    layout="vertical"
                    notLoggedInText="로그인이 필요합니다"
                />
            </SectionCard>
        </div>
    )
}

// ─── 결제 탭 ───
function PaymentTab() {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionCard title="결제 버튼">
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <PaymentButton
                        storeId=""
                        channelKey=""
                        orderName="프리미엄 플랜"
                        amount={29900}
                        payMethod="CARD"
                        buttonText="카드 결제"
                        accentColor="#6366F1"
                        borderRadius={12}
                        height={52}
                        showAmount={true}
                        customOrderId=""
                    />
                    <PaymentButton
                        storeId=""
                        channelKey=""
                        orderName="프리미엄 플랜"
                        amount={29900}
                        payMethod="EASY_PAY"
                        buttonText="네이버페이"
                        accentColor="#03C75A"
                        borderRadius={12}
                        height={52}
                        showAmount={true}
                        customOrderId=""
                    />
                </div>
            </SectionCard>

            <SectionCard title="결제 내역">
                <PaymentHistory
                    limit={10}
                    showReceipt={true}
                    showPayMethod={true}
                    statusFilter="all"
                    emptyMessage="결제 내역이 없습니다"
                    accentColor="#6366F1"
                    borderRadius={12}
                />
            </SectionCard>
        </div>
    )
}

// ─── 공통 카드 래퍼 ───
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div
            style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 16,
                padding: 24,
                border: "1px solid #E5E7EB",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
        >
            <h2
                style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#374151",
                    margin: "0 0 16px 0",
                }}
            >
                {title}
            </h2>
            {children}
        </div>
    )
}
