-- The preceding project_context migration already adds this column.
-- Keep this migration name for databases that have recorded it in their history.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "overview" TEXT;
