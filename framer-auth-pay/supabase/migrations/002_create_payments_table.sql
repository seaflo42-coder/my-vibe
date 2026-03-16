-- =============================================
-- payments 테이블: PortOne 결제 내역
-- =============================================

CREATE TABLE public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_id TEXT UNIQUE NOT NULL,       -- PortOne paymentId
  order_name TEXT NOT NULL,              -- 주문명
  amount INTEGER NOT NULL,               -- 결제 금액 (원, KRW)
  currency TEXT DEFAULT 'KRW',
  pay_method TEXT NOT NULL,              -- 'CARD', 'TRANSFER', 'EASY_PAY', 'VIRTUAL_ACCOUNT', 'MOBILE'
  status TEXT DEFAULT 'pending'          -- 'pending', 'paid', 'failed', 'cancelled'
    CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  pg_provider TEXT,                      -- PG사 이름 (e.g., 'tosspayments', 'nice')
  pg_tx_id TEXT,                         -- PG 트랜잭션 ID
  receipt_url TEXT,                      -- 영수증 URL
  card_name TEXT,                        -- 카드사 이름 (카드 결제 시)
  card_number TEXT,                      -- 마스킹된 카드번호
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_payments_user_id ON public.payments(user_id);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_payments_created_at ON public.payments(created_at DESC);
CREATE INDEX idx_payments_payment_id ON public.payments(payment_id);

-- updated_at 자동 갱신
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
