import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Vary": "Origin",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeString(val: unknown, maxLen: number): string | undefined {
  return typeof val === "string" ? val.slice(0, maxLen) : undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env");
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token || token !== serviceKey) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    let payload;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const {
      title: rawTitle,
      body: rawBody,
      url,
      tag: rawTag,
      priority: rawPriority,
      status: rawStatus,
      user_ids,
      item_sid: rawItemSid,
    } = payload;

    const title = sanitizeString(rawTitle, 200);
    const body = sanitizeString(rawBody, 1000);
    const tag = sanitizeString(rawTag, 100) || "cortex-notification";
    const priority =
      rawPriority === "high" ? "high" : "normal";
    const status = sanitizeString(rawStatus, 50) || null;
    const item_sid = sanitizeString(rawItemSid, 20) || null;

    if (user_ids !== undefined) {
      if (
        !Array.isArray(user_ids) ||
        user_ids.length > 100 ||
        !user_ids.every(
          (id: unknown) =>
            typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id),
        )
      ) {
        return jsonResponse({ error: "Invalid user_ids" }, 400);
      }
    }

    const safeUrl =
      typeof url === "string" && url.startsWith("/") && !url.startsWith("//")
        ? url.slice(0, 500)
        : "/pipeline";

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
      return jsonResponse({ error: "VAPID keys not configured" }, 500);
    }

    webpush.setVapidDetails(
      config.vapid_subject,
      config.vapid_public_key,
      config.vapid_private_key,
    );

    let query = supabase
      .from("cortex_dev_push_subscriptions")
      .select("id, endpoint, p256dh, auth_key, user_id, failure_count")
      .eq("active", true)
      .lt("failure_count", 5);

    if (user_ids && user_ids.length > 0) {
      query = query.in("user_id", user_ids);
    }

    const { data: subscriptions, error: subErr } = await query;

    if (subErr) {
      console.error("Failed to fetch subscriptions:", subErr.message);
      return jsonResponse({ error: "Failed to fetch subscriptions" }, 500);
    }

    if (!subscriptions || subscriptions.length === 0) {
      return jsonResponse({ sent: 0, total: 0, results: [] });
    }

    const notificationPayload = JSON.stringify({
      title: title || "Cortex",
      body: body || "",
      data: {
        url: safeUrl,
        priority,
        status,
        item_sid,
      },
      tag,
    });

    const results: Array<{ id: string; status: string }> = await Promise.all(
      subscriptions.map(async (sub) => {
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
          if (sub.failure_count > 0) {
            await supabase
              .from("cortex_dev_push_subscriptions")
              .update({ failure_count: 0 })
              .eq("id", sub.id);
          }
          return { id: sub.id, status: "sent" };
        } catch (err: unknown) {
          const pushErr = err as { statusCode?: number; message?: string };
          console.error(
            `push send failed for sub ${sub.id}:`,
            pushErr.message,
          );
          if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
            await supabase
              .from("cortex_dev_push_subscriptions")
              .update({ active: false })
              .eq("id", sub.id);
            return { id: sub.id, status: "expired" };
          }
          const newCount = (sub.failure_count || 0) + 1;
          await supabase
            .from("cortex_dev_push_subscriptions")
            .update({
              failure_count: newCount,
              ...(newCount >= 5 ? { active: false } : {}),
            })
            .eq("id", sub.id);
          return { id: sub.id, status: "failed" };
        }
      }),
    );

    const sentCount = results.filter((r) => r.status === "sent").length;
    const logSid = item_sid || "unknown";
    const fingerprint = `push:${logSid}:${crypto.randomUUID().slice(0, 8)}`;

    const { error: logErr } = await supabase.from("agentic_ops_log").insert({
      class: "push_notification",
      fingerprint,
      kind: "event",
      title: `Push: ${title || "notification"}`,
      detail: `Sent to ${sentCount}/${results.length} subscriptions. status=${status || "n/a"}, tag=${tag}`,
      severity: "info",
      status: "resolved",
      repo: "cortex-dev",
    });

    if (logErr) {
      console.error("ops_log insert failed:", logErr.message);
    }

    return jsonResponse({
      sent: sentCount,
      total: results.length,
      results,
    });
  } catch (err: unknown) {
    console.error("push-notify error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
