// =============================================
// supabaseClient.ts
// Framer Code File (공유 유틸리티 - 비컴포넌트)
//
// 사용법: 프레이머 에디터 > Assets > Code 에서
// 새 코드 파일로 생성하세요.
//
// ⚠️ 아래 값을 실제 Supabase 프로젝트 값으로 교체하세요!
// =============================================

import { createClient } from "@supabase/supabase-js"

// TODO: 실제 Supabase 프로젝트 URL과 anon key로 교체
const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
    },
})

// Edge Function 기본 URL
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`
