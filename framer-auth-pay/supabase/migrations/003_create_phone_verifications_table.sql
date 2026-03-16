-- =============================================
-- phone_verifications 테이블: SMS OTP 인증
-- =============================================

CREATE TABLE public.phone_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,            -- +8210XXXXXXXX
  code TEXT NOT NULL,                    -- 6자리 OTP
  expires_at TIMESTAMPTZ NOT NULL,       -- 만료 시간 (발송 후 5분)
  verified BOOLEAN DEFAULT FALSE,
  attempts INTEGER DEFAULT 0,            -- 시도 횟수 (최대 5회)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_phone_verifications_phone ON public.phone_verifications(phone_number);
CREATE INDEX idx_phone_verifications_expires ON public.phone_verifications(expires_at);

-- 만료된 레코드 자동 정리 (1시간 이상 지난 것)
-- Supabase pg_cron 확장 사용 시:
-- SELECT cron.schedule('cleanup-phone-verifications', '0 * * * *',
--   $$DELETE FROM public.phone_verifications WHERE expires_at < NOW() - INTERVAL '1 hour'$$
-- );
