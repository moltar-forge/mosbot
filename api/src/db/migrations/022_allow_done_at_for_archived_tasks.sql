ALTER TABLE tasks
DROP CONSTRAINT IF EXISTS check_done_at_with_status;

ALTER TABLE tasks
ADD CONSTRAINT check_done_at_with_status CHECK (
  (status = 'DONE' AND done_at IS NOT NULL) OR
  (status = 'ARCHIVE' AND done_at IS NOT NULL) OR
  (status NOT IN ('DONE', 'ARCHIVE') AND done_at IS NULL)
);
