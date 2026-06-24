-- Create the cortex_dev_push_subscriptions table for Web Push subscriptions.
-- Also creates the pipeline status-change trigger for push notifications.
--
-- NOTE: This table and trigger already exist in production (created via dashboard).
-- This migration documents the schema for version control and reproducibility.
-- Apply with IF NOT EXISTS guards to be safe on re-runs.

CREATE TABLE IF NOT EXISTS public.cortex_dev_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  active BOOLEAN DEFAULT TRUE,
  failure_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Unique constraint for upsert on (user_id, endpoint)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'cortex_dev_push_subscriptions_user_id_endpoint_key'
  ) THEN
    ALTER TABLE public.cortex_dev_push_subscriptions
      ADD CONSTRAINT cortex_dev_push_subscriptions_user_id_endpoint_key
      UNIQUE (user_id, endpoint);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.cortex_dev_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS policy: authenticated users manage their own subscriptions
DROP POLICY IF EXISTS users_manage_own_push_subs ON public.cortex_dev_push_subscriptions;
CREATE POLICY users_manage_own_push_subs
  ON public.cortex_dev_push_subscriptions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Pipeline status-change trigger function (initial version).
-- This is replaced by 20260624000000_push_trigger_add_status.sql with expanded
-- status handling and payload fields. Included here for migration ordering.
CREATE OR REPLACE FUNCTION public.notify_pipeline_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sid TEXT;
  v_title TEXT;
  v_body TEXT;
  v_url TEXT;
  v_tag TEXT;
  v_priority TEXT;
  v_notify BOOLEAN := FALSE;
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
    WHEN 'done' THEN
      v_title := v_sid || ' complete';
      v_body := COALESCE(NEW.title, 'Item completed');
      v_priority := 'normal';
      v_notify := TRUE;
    WHEN 'failed' THEN
      v_title := v_sid || ' failed';
      v_body := COALESCE(NEW.title, 'Item failed');
      v_priority := 'high';
      v_notify := TRUE;
    WHEN 'blocked' THEN
      v_title := v_sid || ' blocked';
      v_body := COALESCE(NEW.title, 'Item blocked');
      v_priority := 'high';
      v_notify := TRUE;
    ELSE
      v_notify := FALSE;
  END CASE;

  IF NOT v_notify THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_edge_url
    FROM agentic_config WHERE key = 'supabase_edge_function_url';
  IF v_edge_url IS NULL THEN
    v_edge_url := current_setting('app.supabase_url', true) || '/functions/v1/push-notify';
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
      'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
    ),
    body := jsonb_build_object(
      'title', v_title,
      'body', v_body,
      'url', v_url,
      'tag', v_tag,
      'priority', v_priority
    )
  );

  RETURN NEW;
END;
$$;

-- Create the trigger (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pipeline_push_notify'
  ) THEN
    CREATE TRIGGER trg_pipeline_push_notify
      AFTER UPDATE ON public.agentic_items
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_pipeline_status_change();
  END IF;
END $$;

-- Verification queries (read-only):
-- SELECT * FROM cortex_dev_push_subscriptions LIMIT 1;
-- SELECT tgname FROM pg_trigger WHERE tgname = 'trg_pipeline_push_notify';
