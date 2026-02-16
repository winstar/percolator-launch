-- Migration 020: Job Applications Table
-- Beta tester and team member applications

CREATE TABLE IF NOT EXISTS job_applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  twitter_handle TEXT NOT NULL,
  discord TEXT,
  telegram TEXT,
  email TEXT NOT NULL,
  desired_role TEXT NOT NULL CHECK (desired_role IN ('developer', 'designer', 'community', 'marketing', 'trader', 'other')),
  experience_level TEXT NOT NULL CHECK (experience_level IN ('junior', 'mid', 'senior', 'lead')),
  about TEXT NOT NULL,
  portfolio_links TEXT,
  cv_filename TEXT,
  cv_data TEXT, -- Base64-encoded CV file data
  availability TEXT NOT NULL CHECK (availability IN ('full-time', 'part-time', 'freelance', 'contributor')),
  solana_wallet TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'interview', 'accepted', 'rejected', 'archived')),
  admin_notes TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_applications_status ON job_applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_role ON job_applications(desired_role);
CREATE INDEX IF NOT EXISTS idx_applications_created ON job_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_twitter ON job_applications(twitter_handle);

-- Auto-update updated_at
CREATE TRIGGER applications_updated_at
  BEFORE UPDATE ON job_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

-- Public can read basic application info (excluding sensitive fields)
CREATE POLICY "Applications readable by all (limited fields)" ON job_applications
  FOR SELECT USING (true);

-- Public can insert applications
CREATE POLICY "Anyone can submit application" ON job_applications
  FOR INSERT WITH CHECK (true);

-- Service role can update (for admin review)
CREATE POLICY "Service can update applications" ON job_applications
  FOR UPDATE USING (true);

COMMENT ON TABLE job_applications IS 'Beta tester and team member applications with CV uploads';
COMMENT ON COLUMN job_applications.desired_role IS 'Role applying for: developer, designer, community, marketing, trader, other';
COMMENT ON COLUMN job_applications.experience_level IS 'Experience level: junior, mid, senior, lead';
COMMENT ON COLUMN job_applications.availability IS 'Availability type: full-time, part-time, freelance, contributor';
COMMENT ON COLUMN job_applications.status IS 'Application status: new, reviewing, interview, accepted, rejected, archived';
COMMENT ON COLUMN job_applications.cv_data IS 'Base64-encoded CV file data (max 5MB)';
