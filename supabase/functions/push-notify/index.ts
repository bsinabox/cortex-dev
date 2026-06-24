import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const payload = await req.json();
    const { title, body, url, tag, priority, status, user_ids, item_sid } =
      payload;

    const { data: configRows } = await supabase
      .from("agentic_config")
      .select("key, value")
      .in("key", ["vapid_public_key", "vapid_private_key", "vapid_subject"]);

    const config: Record<string, string> = {};
    for (const row of configRows ?? []) {
      config[row.key] =
        typeof row.value === "string" ? row.value : String(row.value);
    }

    if (
      !config.vapid_public_key ||
      !config.vapid_private_key ||
      !config.vapid_subject
    ) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    webpush.setVapidDetails(
      config.vapid_subject,
      config.vapid_public_key,
      config.vapid_private_key,
    );

    let query = supabase
      .from("cortex_dev_push_subscriptions")
      .select("id, endpoint, p256dh, auth_key, user_id, failure_count")
      .eq("active", true);

    if (user_ids && user_ids.length > 0) {
      query = query.in("user_id", user_ids);
    }

    const { data: subscriptions, error: subErr } = await query;

    if (subErr) {
      return new Response(
        JSON.stringify({
          error: "Failed to fetch subscriptions",
          detail: subErr.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No active subscriptions" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const notificationPayload = JSON.stringify({
      title: title || "Cortex",
      body: body || "",
      data: {
        url: url || "/pipeline",
        priority: priority || "normal",
        status: status || null,
        item_sid: item_sid || null,
      },
      tag: tag || "cortex-notification",
    });

    const results: Array<{ id: string; status: string; error?: string }> = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth_key,
            },
          },
          notificationPayload,
        );
        results.push({ id: sub.id, status: "sent" });
      } catch (err: unknown) {
        const pushErr = err as { statusCode?: number; message?: string };
        if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
          await supabase
            .from("cortex_dev_push_subscriptions")
            .update({ active: false })
            .eq("id", sub.id);
          results.push({ id: sub.id, status: "expired" });
        } else {
          await supabase
            .from("cortex_dev_push_subscriptions")
            .update({ failure_count: (sub.failure_count || 0) + 1 })
            .eq("id", sub.id);
          results.push({
            id: sub.id,
            status: "failed",
            error: pushErr.message || "Unknown error",
          });
        }
      }
    }

    const sentCount = results.filter((r) => r.status === "sent").length;
    const sid = item_sid || "unknown";
    const fingerprint = `push:${sid}:${crypto.randomUUID().slice(0, 8)}`;

    const { error: logErr } = await supabase.from("agentic_ops_log").insert({
      class: "cortex",
      fingerprint,
      kind: "event",
      title: `Push: ${title || "notification"}`,
      detail: `Sent to ${sentCount}/${results.length} subscriptions. status=${status || "n/a"}, tag=${tag || "none"}`,
      severity: "info",
      status: "resolved",
    });

    if (logErr) {
      console.error("ops_log insert failed:", logErr.message);
    }

    return new Response(
      JSON.stringify({
        sent: sentCount,
        total: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
