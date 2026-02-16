-- Migration 019: Ideas Table
-- User-submitted feature ideas and feedback

CREATE TABLE IF NOT EXISTS ideas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  handle TEXT NOT NULL,
  idea TEXT NOT NULL,
  contact TEXT,
  ip TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'planned', 'implemented', 'declined')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);
CREATE INDEX IF NOT EXISTS idx_ideas_created ON ideas(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ideas_updated_at
  BEFORE UPDATE ON ideas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;

-- Public can read ideas (excluding ip and admin_notes)
CREATE POLICY "Ideas readable by all" ON ideas
  FOR SELECT USING (true);

-- Public can insert ideas
CREATE POLICY "Anyone can submit ideas" ON ideas
  FOR INSERT WITH CHECK (true);

-- Service role can update (for admin status changes)
CREATE POLICY "Service can update ideas" ON ideas
  FOR UPDATE USING (true);

COMMENT ON TABLE ideas IS 'User-submitted feature ideas and product feedback';
COMMENT ON COLUMN ideas.status IS 'Idea processing status: new, reviewing, planned, implemented, declined';
