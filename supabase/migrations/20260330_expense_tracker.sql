-- ============================================
-- Expense Tracker & Financial Dashboard
-- Two tables: expense_assignments + financial_transactions
-- ============================================

-- 1. expense_assignments — staff field trips
CREATE TABLE IF NOT EXISTS expense_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  city TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'settled')),
  settled_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expense_assignments_staff ON expense_assignments(staff_name);
CREATE INDEX idx_expense_assignments_status ON expense_assignments(status);
CREATE INDEX idx_expense_assignments_created ON expense_assignments(created_at DESC);

ALTER TABLE expense_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read assignments"
  ON expense_assignments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role manages assignments"
  ON expense_assignments FOR ALL
  USING (auth.role() = 'service_role');

-- 2. financial_transactions — unified expense + side income ledger
CREATE TABLE IF NOT EXISTS financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  category TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  assignment_id UUID REFERENCES expense_assignments(id) ON DELETE SET NULL,
  settlement_status TEXT DEFAULT 'pending' CHECK (settlement_status IN ('pending', 'settled')),
  settled_at TIMESTAMPTZ,
  receipt_url TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_txn_type ON financial_transactions(type);
CREATE INDEX idx_fin_txn_category ON financial_transactions(category);
CREATE INDEX idx_fin_txn_date ON financial_transactions(transaction_date DESC);
CREATE INDEX idx_fin_txn_assignment ON financial_transactions(assignment_id);
CREATE INDEX idx_fin_txn_settlement ON financial_transactions(settlement_status);
CREATE INDEX idx_fin_txn_type_date ON financial_transactions(type, transaction_date DESC);

ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read transactions"
  ON financial_transactions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role manages transactions"
  ON financial_transactions FOR ALL
  USING (auth.role() = 'service_role');
