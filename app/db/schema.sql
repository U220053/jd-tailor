CREATE TABLE applications (
  id SERIAL PRIMARY KEY,
  company TEXT,
  role TEXT,
  jd_text TEXT NOT NULL,
  resume_snapshot TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE generated_outputs (
  id SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  tailored_bullets JSONB NOT NULL,
  relevance_notes TEXT,
  interview_questions JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);