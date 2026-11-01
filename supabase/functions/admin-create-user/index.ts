import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const bad = (msg: string, status = 400) =>
  new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return bad("Missing authorization", 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: u, error: ue } = await caller.auth.getUser();
    if (ue || !u.user) return bad("Not authenticated", 401);

    const admin = createClient(url, service);
    const { data: p } = await admin.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
    if (!p || !["super_admin", "admin", "principal"].includes(p.role)) return bad("Not authorised", 403);

    const b = await req.json();
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    const full_name = String(b.full_name ?? "").trim();
    const role = String(b.role ?? "");
    const phone = b.phone ? String(b.phone).trim() : null;
    const job_title = b.job_title ? String(b.job_title).trim() : null;
    const department = b.department ? String(b.department).trim() : null;
    const joined_on = b.joined_on ? String(b.joined_on) : null;

    if (!full_name) return bad("Please enter the staff member's full name.");
    if (!email) return bad("Please enter a login email.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return bad("That email address does not look valid. Please check the spelling.");
    if (password.length < 8)
      return bad("The password must be at least 8 characters long.");
    if (!["admin", "principal", "teacher", "parent", "finance", "admissions", "security"].includes(role))
      return bad("Please pick a valid role.");

    // Pre-check: email already assigned to any existing profile.
    {
      const { data: existingByEmail } = await admin
        .from("profiles")
        .select("id, full_name, employment_status")
        .or(`email.eq.${email},preferred_email.eq.${email}`)
        .maybeSingle();
      if (existingByEmail) {
        return bad(
          `The email ${email} is already assigned to ${existingByEmail.full_name}` +
            (existingByEmail.employment_status === "left" ? " (laid off). " : ". ") +
            "Please use a different email for the new staff member.",
          409,
        );
      }
    }

    // Pre-check: phone already assigned (if provided).
    if (phone) {
      const { data: existingByPhone } = await admin
        .from("profiles")
        .select("id, full_name, employment_status")
        .eq("phone", phone)
        .maybeSingle();
      if (existingByPhone) {
        return bad(
          `The phone number ${phone} is already on file for ${existingByPhone.full_name}` +
            (existingByPhone.employment_status === "left" ? " (laid off). " : ". ") +
            "Please use a different phone number.",
          409,
        );
      }
    }

    const { data: created, error: ce } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    });
    if (ce || !created.user) {
      const m = (ce?.message || "").toLowerCase();
      if (m.includes("already registered") || m.includes("already exists") || m.includes("duplicate"))
        return bad(
          `An account with the email ${email} already exists in the login system. Please use a different email.`,
          409,
        );
      return bad(ce?.message || "Could not create the login account.");
    }

    const { error: pe } = await admin
      .from("profiles")
      .upsert({ id: created.user.id, full_name, role, phone, job_title, department, joined_on }, { onConflict: "id" });
    if (pe) {
      await admin.auth.admin.deleteUser(created.user.id);
      return bad(pe.message);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("staff_id")
      .eq("id", created.user.id)
      .maybeSingle();

    return new Response(
      JSON.stringify({ user_id: created.user.id, email, role, staff_id: profile?.staff_id ?? null }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Request failed");
  }
});
