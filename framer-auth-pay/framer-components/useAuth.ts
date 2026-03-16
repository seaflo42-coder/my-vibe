// =============================================
// useAuth.ts
// Framer Code File (공유 훅 - 비컴포넌트)
//
// 인증 상태 관리를 위한 React 훅
// 모든 인증 관련 컴포넌트에서 import하여 사용
// =============================================

import { useState, useEffect, useCallback } from "react"
import { supabase } from "./supabaseClient"
import type { User, Session } from "@supabase/supabase-js"

export interface Profile {
    id: string
    email: string | null
    full_name: string | null
    avatar_url: string | null
    phone_number: string | null
    phone_verified: boolean
    provider: string | null
    privacy_consent: boolean
    privacy_consent_at: string | null
    marketing_consent: boolean
    marketing_consent_at: string | null
    created_at: string
    updated_at: string
}

export interface AuthState {
    user: User | null
    profile: Profile | null
    session: Session | null
    loading: boolean
    signOut: () => Promise<void>
    refetchProfile: () => Promise<void>
    updateProfile: (updates: Partial<Profile>) => Promise<void>
}

export function useAuth(): AuthState {
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [session, setSession] = useState<Session | null>(null)
    const [loading, setLoading] = useState(true)

    const fetchProfile = useCallback(async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", userId)
                .single()

            if (!error && data) {
                setProfile(data as Profile)
            }
        } catch (err) {
            console.error("프로필 조회 실패:", err)
        }
    }, [])

    useEffect(() => {
        // 초기 세션 확인
        supabase.auth.getSession().then(({ data: { session: s } }) => {
            setSession(s)
            setUser(s?.user ?? null)
            if (s?.user) {
                fetchProfile(s.user.id)
            }
            setLoading(false)
        })

        // 인증 상태 변경 리스너
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, s) => {
            setSession(s)
            setUser(s?.user ?? null)
            if (s?.user) {
                await fetchProfile(s.user.id)
            } else {
                setProfile(null)
            }
        })

        return () => subscription.unsubscribe()
    }, [fetchProfile])

    const signOut = useCallback(async () => {
        await supabase.auth.signOut()
        setUser(null)
        setProfile(null)
        setSession(null)
    }, [])

    const refetchProfile = useCallback(async () => {
        if (user) {
            await fetchProfile(user.id)
        }
    }, [user, fetchProfile])

    const updateProfile = useCallback(
        async (updates: Partial<Profile>) => {
            if (!user) return
            const { error } = await supabase
                .from("profiles")
                .update(updates)
                .eq("id", user.id)

            if (!error) {
                await fetchProfile(user.id)
            }
        },
        [user, fetchProfile]
    )

    return {
        user,
        profile,
        session,
        loading,
        signOut,
        refetchProfile,
        updateProfile,
    }
}
