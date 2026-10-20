import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function fetchProviderServices(apiUrl, apiKey) {
  const base = String(apiUrl || "").replace(/\/+$/, "");
  const endpoint = /\/api\/v2$/.test(base) ? base : base + "/api/v2";
  const body = new URLSearchParams();
  body.append("key", apiKey);
  body.append("action", "services");
  const res = await fetch(endpoint, { method: "POST", body });
  if (!res.ok) throw new Error("provider_http_" + res.status);
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) throw new Error("provider_bad_response");
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ ok: false, error: "server_not_configured" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData || !userData.user) return json({ ok: false, error: "unauthorized" }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: prof } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!prof || prof.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);

  let providerId = null;
  try {
    const b = await req.json();
    if (b && b.provider_id != null) providerId = Number(b.provider_id);
  } catch (_) {}

  let provQuery = admin.from("providers").select("id, name, api_url, api_key, is_active");
  if (providerId && Number.isFinite(providerId)) provQuery = provQuery.eq("id", providerId);
  else provQuery = provQuery.eq("is_active", true);
  const { data: providers, error: provErr } = await provQuery;
  if (provErr) return json({ ok: false, error: "providers_query_failed" }, 500);
  if (!providers || !providers.length) return json({ ok: false, error: "no_providers" }, 400);

  const results = [];
  for (const p of providers) {
    if (!p.api_url || !p.api_key) {
      results.push({ provider_id: p.id, name: p.name, ok: false, error: "missing_api_config" });
      continue;
    }
    let list;
    try {
      list = await fetchProviderServices(p.api_url, p.api_key);
    } catch (e) {
      results.push({ provider_id: p.id, name: p.name, ok: false, error: String(e.message || e) });
      continue;
    }

    const rows = list
      .filter((s) => s && s.service != null && s.name != null)
      .map((s) => {
        const rate = Number(s.rate);
        return {
          name: String(s.name).slice(0, 500),
          category: s.category ? String(s.category) : "services",
          description: s.type ? String(s.type) : null,
          provider_id: p.id,
          provider_service_id: String(s.service),
          rate: Number.isFinite(rate) ? rate : 0,
          cost: Number.isFinite(rate) ? rate : 0,
          min_qty: Number.isFinite(Number(s.min)) && Number(s.min) > 0 ? Number(s.min) : 1,
          max_qty: Number.isFinite(Number(s.max)) ? Number(s.max) : null,
        };
      });

    if (!rows.length) {
      results.push({ provider_id: p.id, name: p.name, ok: true, fetched: 0, inserted: 0, updated: 0 });
      continue;
    }

    const existing = new Map();
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data: found, error: foundErr } = await admin
        .from("services")
        .select("provider_service_id, is_active, markup, sort_order")
        .eq("provider_id", p.id)
        .not("provider_service_id", "is", null)
        .range(offset, offset + pageSize - 1);
      if (foundErr) break;
      if (!found || !found.length) break;
      found.forEach((f) => existing.set(f.provider_service_id, f));
      if (found.length < pageSize) break;
    }

    let inserted = 0;
    let updated = 0;
    for (const r of rows) {
      if (existing.has(r.provider_service_id)) updated++;
      else inserted++;
    }

    const upsertRows = rows.map((r) => {
      const prev = existing.get(r.provider_service_id);
      return {
        ...r,
        is_active: prev ? prev.is_active : false,
        markup: prev && prev.markup != null ? prev.markup : 0,
        sort_order: prev && prev.sort_order != null ? prev.sort_order : 0,
      };
    });

    const upsertChunk = 500;
    for (let i = 0; i < upsertRows.length; i += upsertChunk) {
      const chunk = upsertRows.slice(i, i + upsertChunk);
      const { error } = await admin
        .from("services")
        .upsert(chunk, { onConflict: "provider_id,provider_service_id" });
      if (error) {
        results.push({ provider_id: p.id, name: p.name, ok: false, error: "upsert_failed: " + error.message });
        inserted = -1;
        updated = -1;
        break;
      }
    }

    results.push({
      provider_id: p.id,
      name: p.name,
      ok: inserted >= 0,
      fetched: rows.length,
      inserted: Math.max(inserted, 0),
      updated: Math.max(updated, 0),
    });
  }

  const ok = results.every((r) => r.ok);
  return json({ ok, results });
});
