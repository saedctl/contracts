"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireUser, verifyPasswordFor } from "@/lib/auth/session";
import { generatePassword, validateNewPassword } from "@/lib/auth/password";
import { getStore } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { audit } from "@/lib/services/audit";
import { UserFacingError } from "@/lib/services/contracts";
import { activateTemplateVersion, createTemplateVersion } from "@/lib/services/templates";
import { STAFF_ROLES } from "@/lib/types";

export type ActionResult = { ok?: boolean; error?: string; message?: string; password?: string };

function fail(e: unknown): ActionResult {
  if (e instanceof UserFacingError || e instanceof z.ZodError) {
    return { error: e instanceof z.ZodError ? e.issues[0].message : e.message };
  }
  const msg = (e as Error)?.message ?? "";
  if (msg.includes("already exists")) return { error: msg };
  console.error(e);
  return { error: "Something went wrong. Please try again." };
}

// ---- Template ----

export async function saveTemplateAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const t = await createTemplateVersion(admin, {
      title: String(form.get("title") ?? ""),
      body: String(form.get("body") ?? ""),
      notes: String(form.get("notes") ?? ""),
      activate: true,
    }, await requestMeta());
    revalidatePath("/admin/template");
    return { ok: true, message: `Saved and activated version ${t.version}. New contracts will use it; existing contracts keep their original version.` };
  } catch (e) {
    return fail(e);
  }
}

export async function activateTemplateAction(form: FormData) {
  const admin = await requireAdmin();
  await activateTemplateVersion(admin, String(form.get("id")), await requestMeta());
  revalidatePath("/admin/template");
}

// ---- Staff ----

const newStaff = z.object({
  fullName: z.string().trim().min(2, "Enter the person's full name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: z.enum(STAFF_ROLES),
});

export async function createStaffAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const input = newStaff.parse({ fullName: form.get("fullName"), email: form.get("email"), role: form.get("role") });
    const password = generatePassword();
    const staff = await (await getStore()).createStaff({ ...input, password });
    await audit(null, { type: "staff", user: admin }, "staff.created", { staffId: staff.id, email: staff.email, role: staff.role }, await requestMeta());
    revalidatePath("/admin/staff");
    return { ok: true, message: `Account created for ${staff.email}. Share this temporary password securely — it won't be shown again:`, password };
  } catch (e) {
    return fail(e);
  }
}

export async function updateStaffAction(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get("id"));
  const patch: { role?: "admin" | "sales"; active?: boolean } = {};
  const role = form.get("role");
  if (role === "admin" || role === "sales") patch.role = role;
  const active = form.get("active");
  if (active === "true" || active === "false") patch.active = active === "true";
  if (id === admin.id && (patch.active === false || patch.role === "sales")) {
    return; // Admins can't lock themselves out; the UI doesn't offer this either.
  }
  await (await getStore()).updateStaff(id, patch);
  await audit(null, { type: "staff", user: admin }, "staff.updated", { staffId: id, ...patch }, await requestMeta());
  revalidatePath("/admin/staff");
}

export async function resetStaffPasswordAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const id = String(form.get("id"));
    const password = generatePassword();
    await (await getStore()).setStaffPassword(id, password);
    await audit(null, { type: "staff", user: admin }, "staff.password_reset", { staffId: id }, await requestMeta());
    return { ok: true, message: "New temporary password (shown once):", password };
  } catch (e) {
    return fail(e);
  }
}

// ---- Own account ----

export async function changePasswordAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const current = String(form.get("current") ?? "");
    const next = String(form.get("next") ?? "");
    if (next !== String(form.get("confirm") ?? "")) return { error: "The new passwords don't match." };
    const problem = validateNewPassword(next);
    if (problem) return { error: problem };
    if (!(await verifyPasswordFor(user, current))) return { error: "Your current password is incorrect." };
    await (await getStore()).setStaffPassword(user.id, next);
    await audit(null, { type: "staff", user }, "staff.password_changed", {}, await requestMeta());
    return { ok: true, message: "Password updated." };
  } catch (e) {
    return fail(e);
  }
}
