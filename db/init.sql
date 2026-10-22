-- Runs once, when the db volume is first created. Every connection gets Thai time (spec Section 2).
DO $$ BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Bangkok');
END $$;
