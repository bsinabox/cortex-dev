-- Security hardening for push notification trigger functions.
-- Adds SET search_path to SECURITY DEFINER functions to prevent
-- search_path hijack attacks.
--
-- NOTE: Do not apply in production until the migration gate approves.

CREATE OR REPLACE FUNCTION public.notify_pipeline_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sid TEXT;
  v_title TEXT;
  v_body TEXT;
  v_url TEXT;
  v_tag TEXT;
  v_priority TEXT;
  v_notify BOOLEAN := FALSE;
  v_batch_complete BOOLEAN := FALSE;
  v_batch_total INT;
  v_batch_done INT;
  v_edge_url TEXT;
  v_service_key TEXT;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_sid := UPPER(LEFT(NEW.id::text, 8));
  v_url := '/pipeline/' || NEW.id;
  v_tag := 'item-' || v_sid;

  CASE NEW.status
    WHEN 'done', 'subtasks_complete' THEN
      v_title := v_sid || ' complete';
      v_body := COALESCE(NEW.title, 'Item completed');
      v_priority := 'normal';
      v_notify := TRUE;
    WHEN 'failed' THEN
      v_title := v_sid || ' failed';
      v_body := COALESCE(NEW.title, 'Item failed');
      v_priority := 'high';
      v_notify := TRUE;
    WHEN 'blocked', 'readiness_blocked' THEN
      v_title := v_sid || ' blocked';
      v_body := COALESCE(NEW.title, 'Item blocked');
      v_priority := 'high';
      v_notify := TRUE;
    WHEN 'testing_in_dev' THEN
      v_title := v_sid || ' ready to test';
      v_body := COALESCE(NEW.title, 'Ready for dev testing');
      v_priority := 'normal';
      v_notify := TRUE;
    WHEN 'human_review', 'design_review_hold' THEN
      v_title := v_sid || ' needs review';
      v_body := COALESCE(NEW.title, 'Needs human review');
      v_priority := 'normal';
      v_notify := TRUE;
    WHEN 'promotion_review' THEN
      v_title := v_sid || ' promotion ready';
      v_body := COALESCE(NEW.title, 'Ready for promotion review');
      v_priority := 'normal';
      v_notify := TRUE;
    ELSE
      v_notify := FALSE;
  END CASE;

  IF NOT v_notify THEN
    RETURN NEW;
  END IF;

  IF NEW.batch_id IS NOT NULL AND NEW.status IN ('done', 'subtasks_complete') THEN
    SELECT COUNT(*)::int, COUNT(*) FILTER (WHERE status IN ('done', 'subtasks_complete'))::int
    INTO v_batch_total, v_batch_done
    FROM agentic_items
    WHERE batch_id = NEW.batch_id;

    IF v_batch_total > 1 AND v_batch_done = v_batch_total THEN
      v_batch_complete := TRUE;
      v_title := 'Batch complete: ' || NEW.batch_id;
      v_body := v_batch_total || ' items done';
      v_url := '/pipeline?batch=' || NEW.batch_id;
      v_tag := 'batch-' || NEW.batch_id;
      v_priority := 'high';
    END IF;
  END IF;

  SELECT value INTO v_edge_url
    FROM agentic_config WHERE key = 'supabase_edge_function_url';
  IF v_edge_url IS NULL THEN
    v_edge_url := current_setting('app.supabase_url', true);
    IF v_edge_url IS NOT NULL THEN
      v_edge_url := v_edge_url || '/functions/v1/push-notify';
    END IF;
  END IF;
  IF v_edge_url IS NULL THEN
    RAISE LOG 'notify_pipeline_status_change: no edge function URL configured — set supabase_edge_function_url in agentic_config';
    RETURN NEW;
  END IF;

  SELECT value INTO v_service_key
    FROM agentic_config WHERE key = 'supabase_service_role_key';

  IF v_service_key IS NULL THEN
    RAISE LOG 'notify_pipeline_status_change: no service role key configured — set supabase_service_role_key in agentic_config';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'title', v_title,
      'body', v_body,
      'url', v_url,
      'tag', v_tag,
      'priority', v_priority,
      'status', NEW.status,
      'item_sid', v_sid
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_stale_pipeline_items()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
        'Authorization', 'Bearer ' || v_service_key
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

-- Verification queries (read-only, run after migration):
-- SELECT proname, prosecdef, proconfig FROM pg_proc WHERE proname IN ('notify_pipeline_status_change', 'check_stale_pipeline_items');
