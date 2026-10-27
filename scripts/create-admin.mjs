#!/usr/bin/env node
// Creates the first administrator in Supabase (Auth user + dashboard profile).
//
//   node --env-file=.env.local scripts/create-admin.mjs admin@yourcompany.com "Full Name"
//
// A strong temporary password is generated and printed once. Change it after first sign-in
// (Account page). Further staff are added from the dashboard (Admin → Staff).

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [email, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(" ").trim();
if (!email || !fullName) {
  console.error('Usage: node --env-file=.env.local scripts/create-admin.mjs <email> "<full name>"');
  process.exit(1);
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const password = randomBytes(15).toString("base64url") + "7a";

const { data, error } = await supabase.auth.admin.createUser({
  email: email.toLowerCase(),
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});
if (error) {
  console.error("Could not create auth user:", error.message);
  process.exit(1);
}
const { error: profileError } = await supabase
  .from("profiles")
  .insert({ id: data.user.id, email: email.toLowerCase(), full_name: fullName, role: "admin" });
if (profileError) {
  await supabase.auth.admin.deleteUser(data.user.id);
  console.error("Could not create profile (did you run supabase/migrations/0001_init.sql?):", profileError.message);
  process.exit(1);
}
console.log(`\nAdministrator created: ${email}\nTemporary password:    ${password}\n\nSign in and change it from the Account page.\n`);
