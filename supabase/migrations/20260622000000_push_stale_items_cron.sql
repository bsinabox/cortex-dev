-- Push notification for pipeline items stuck in the same status for >2 hours.
-- Uses pg_cron (every 30 min) + pg_net to call the existing push-notify edge function.
--
-- NOTE: Do not apply in production until the migration gate approves.

CREATE OR REPLACE FUNCTION public.check_stale_pipeline_items()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_sid TEXT;
  v_edge_url TEXT;
  v_service_key TEXT;
  v_active_statuses TEXT[] := ARRAY[
    'building', 'testing_in_dev', 'testing_in_uat',
    'human_review', 'design_review_hold', 'promotion_review',
    'blocked', 'readiness_blocked'
  ];
BEGIN
  SELECT value INTO v_edge_url
    FROM agentic_config WHERE key = 'supabase_edge_function_url';
  IF v_edge_url IS NULL THEN
    v_edge_url := current_setting('app.supabase_url', true);
    IF v_edge_url IS NOT NULL THEN
      v_edge_url := v_edge_url || '/functions/v1/push-notify';
    END IF;
  END IF;
  IF v_edge_url IS NULL THEN
    RAISE LOG 'check_stale_pipeline_items: no edge function URL configured — set supabase_edge_function_url in agentic_config';
    RETURN;
  END IF;

  SELECT value INTO v_service_key
    FROM agentic_config WHERE key = 'supabase_service_role_key';

  IF v_service_key IS NULL THEN
    RAISE LOG 'check_stale_pipeline_items: no service role key configured — set supabase_service_role_key in agentic_config';
    RETURN;
  END IF;

  FOR v_item IN
    SELECT id, title, status, updated_at
    FROM agentic_items
    WHERE status = ANY(v_active_statuses)
      AND updated_at < (NOW() - INTERVAL '2 hours')
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
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
      ),
      body := jsonb_build_object(
        'title', v_sid || ' stalled (' || v_item.status || ')',
        'body', COALESCE(v_item.title, 'Item stuck for >2 hours'),
        'url', '/pipeline/' || v_item.id,
        'tag', 'stale-' || v_sid,
        'priority', 'high',
        'status', v_item.status,
        'item_sid', v_sid
      )
    );

    INSERT INTO agentic_ops_log (class, fingerprint, kind, title, detail, severity, status, repo)
    VALUES (
      'push_notification',
      'stale-item-' || v_item.id::text,
      'event',
      'Stale alert: ' || v_sid,
      'Item in status "' || v_item.status || '" since ' || v_item.updated_at::text,
      'warning',
      'resolved',
      'cortex-dev'
    );
  END LOOP;
END;
$$;

DO $$ BEGIN
  PERFORM cron.unschedule('check-stale-pipeline-items');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'check-stale-pipeline-items',
  '*/30 * * * *',
  'SELECT public.check_stale_pipeline_items()'
);

-- Verification query (read-only, run after migration):
-- SELECT jobid, schedule, command FROM cron.job WHERE jobname = 'check-stale-pipeline-items';
