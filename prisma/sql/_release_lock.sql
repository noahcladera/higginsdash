-- Release stuck advisory lock from killed prisma migrate process.
-- Pid 72707369 is Prisma's migration lock id.
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE pid IN (
  SELECT pid FROM pg_locks
  WHERE locktype = 'advisory'
    AND objid = 72707369
)
AND pid <> pg_backend_pid();
