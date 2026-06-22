-- Push notification for pipeline items stuck in the same status for >2 hours.
-- Uses pg_cron (every 30 min) + pg_net to call the existing push-notify edge function.
--
-- NOTE: Do not apply in production until the migration gate approves.

-- Statuses that indicate active work (stalling in these is worth notifying about)
-- Excludes terminal states (done, subtasks_complete, cancelled, failed) and intake/discovery.
CREATE OR REPLACE FUNCTION public.check_stale_pipeline_items()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_sid TEXT;
  v_edge_url TEXT := 'https://ftpbxlizcsbzvmtbtuef.supabase.co/functions/v1/push-notify';
  v_active_statuses TEXT[] := ARRAY[
    'building', 'testing_in_dev', 'testing_in_uat',
    'human_review', 'design_review_hold', 'promotion_review',
    'blocked', 'readiness_blocked'
  ];
BEGIN
  FOR v_item IN
    SELECT id, title, status, updated_at
    FROM agentic_items
    WHERE status = ANY(v_active_statuses)
      AND updated_at < (NOW() - INTERVAL '2 hours')
      -- Avoid re-notifying: only notify if we haven't sent a stale alert
      -- for this item in the last 4 hours (checked via ops_log)
      AND NOT EXISTS (
        SELECT 1 FROM agentic_ops_log
        WHERE fingerprint = 'stale-item-' || agentic_items.id::text
          AND created_at > (NOW() - INTERVAL '4 hours')
      )
    ORDER BY updated_at ASC
    LIMIT 10
  LOOP
    v_sid := UPPER(LEFT(v_item.id::text, 8));

    PERFORM net.http_post(
      url := v_edge_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'title', v_sid || ' stalled (' || v_item.status || ')',
        'body', COALESCE(v_item.title, 'Item stuck for >2 hours'),
        'url', '/pipeline/' || v_item.id,
        'tag', 'stale-' || v_sid,
        'priority', 'high',
        'item_sid', v_sid
      )
    );

    -- Record in ops_log to prevent re-notification within 4h window
    INSERT INTO agentic_ops_log (class, fingerprint, kind, title, detail, severity, status)
    VALUES (
      'cortex',
      'stale-item-' || v_item.id::text,
      'event',
      'Stale alert: ' || v_sid,
      'Item in status "' || v_item.status || '" since ' || v_item.updated_at::text,
      'warning',
      'complete'
    );
  END LOOP;
END;
$$;

-- Schedule: every 30 minutes
SELECT cron.schedule(
  'check-stale-pipeline-items',
  '*/30 * * * *',
  'SELECT public.check_stale_pipeline_items()'
);

-- Verification query (read-only, run after migration):
-- SELECT jobid, schedule, command FROM cron.job WHERE jobname = 'check-stale-pipeline-items';
