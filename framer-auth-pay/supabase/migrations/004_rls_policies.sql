-- =============================================
-- Row Level Security 정책
-- =============================================

-- profiles 테이블 RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- profiles INSERT는 handle_new_user 트리거가 SECURITY DEFINER로 처리

-- payments 테이블 RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payments"
  ON public.payments FOR SELECT
  USING (auth.uid() = user_id);

-- payments INSERT/UPDATE는 Edge Functions (service_role key)에서만 처리
-- service_role key는 RLS를 우회함

-- phone_verifications 테이블 RLS
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;

-- phone_verifications는 Edge Functions (service_role key)에서만 접근
-- 클라이언트에서 직접 접근 불가
