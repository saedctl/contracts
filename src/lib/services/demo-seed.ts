import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config";
import type { DemoStore } from "../db/demo";
import { generatePassword } from "../auth/password";
import { SAMPLE_TEMPLATE_BODY, SAMPLE_TEMPLATE_TITLE } from "../sample-template";
import { calculateEndDate } from "../dates";
import { sha256Hex, todayISO } from "../utils";
import type { ContractInput } from "../validation";
import { completeDemoSignature, createContract, sendContract, setInstalmentCollected, startSigning } from "./contracts";
import type { Contract, StaffUser } from "../types";

const seedMeta = { ip: "127.0.0.1", userAgent: "demo-seed" };

/** Populates an empty demo store. Everything created here is flagged as demo data. */
export async function seedDemo(store: DemoStore) {
  if (!(await store.isEmpty())) return;

  const adminEmail = process.env.DEMO_ADMIN_EMAIL || "admin@example.com";
  const salesEmail = process.env.DEMO_SALES_EMAIL || "sales@example.com";
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD || generatePassword();
  const salesPassword = process.env.DEMO_SALES_PASSWORD || generatePassword();

  const admin = await store.createStaff({ email: adminEmail, fullName: "Demo Administrator", role: "admin", password: adminPassword });
  const sales = await store.createStaff({ email: salesEmail, fullName: "Demo Sales Rep", role: "sales", password: salesPassword });

  const creds = [
    "THE ENGINEERS CLUB — DEMO MODE LOGINS (local demo data only)",
    `Administrator: ${adminEmail} / ${process.env.DEMO_ADMIN_PASSWORD ? "(DEMO_ADMIN_PASSWORD)" : adminPassword}`,
    `Sales rep:     ${salesEmail} / ${process.env.DEMO_SALES_PASSWORD ? "(DEMO_SALES_PASSWORD)" : salesPassword}`,
    "",
  ].join("\n");
  await fs.mkdir(config.demoDataDir, { recursive: true });
  await fs.writeFile(path.join(config.demoDataDir, "DEMO_LOGIN.txt"), creds, { mode: 0o600 });
  console.info(`\n${creds}(saved to ${path.join(config.demoDataDir, "DEMO_LOGIN.txt")})\n`);

  const t = await store.createTemplateVersion({
    title: SAMPLE_TEMPLATE_TITLE, body: SAMPLE_TEMPLATE_BODY, notes: "Demo placeholder — contains no legal terms.",
    createdBy: admin.id, bodySha256: sha256Hex(SAMPLE_TEMPLATE_BODY), isSample: true, tier: null,
  });
  await store.activateTemplateVersion(t.id);
  await store.setSetting("company_signature", {
    enabled: true, name: "Saed Farah", role: "For The Engineers Club", imagePath: null, imageType: null, updatedAt: new Date().toISOString(),
  });

  // If the business's Premium agreement is in the repo, use it for Premium contracts.
  try {
    const premiumBody = await fs.readFile(path.join(process.cwd(), "templates", "premium-membership-agreement.md"), "utf8");
    const premium = await store.createTemplateVersion({
      title: "Premium Membership Agreement", body: premiumBody, notes: "Demo copy of the Premium agreement",
      createdBy: admin.id, bodySha256: sha256Hex(premiumBody), tier: "premium",
    });
    await store.activateTemplateVersion(premium.id);
  } catch {}

  const start = todayISO();
  const make = (name: string, email: string, amount: number, months: 3 | 6 | 12): ContractInput => ({
    customerName: name, customerEmail: email, customerPhone: "+44 7700 900000", membershipTier: months === 12 ? "vip" : "premium", duration: String(months) as "3",
    startDate: start, endDate: calculateEndDate(start, months), amountPaid: amount, currency: "GBP",
    paymentStatus: "paid_in_full", paymentSchedule: "", outstandingBalance: 0, balanceDueDate: "", instalments: [],
  });

  try {
    const john = await createContract(sales, make("John Smith", "john.smith@example.com", 499, 6), seedMeta);
    const sentJohn = await sendContract(sales, john, seedMeta);
    await startSigning(sentJohn, seedMeta);
    await completeDemoSignature((await store.getContract(john.id))!, { kind: "type", typedName: "John Smith" }, seedMeta);

    const sarah = await createContract(sales, make("Sarah Ahmed", "sarah.ahmed@example.com", 999, 12), seedMeta);
    await sendContract(sales, sarah, seedMeta);

    await createContract(sales, make("Michael Jones", "michael.jones@example.com", 299, 3), seedMeta);

    // Signed members on payment plans, so the Payments page has something to show.
    const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const signPlan = async (name: string, email: string, paid: number, plan: [number, number][], collectFirst: number) => {
      const input: ContractInput = {
        ...make(name, email, paid, 12), membershipTier: "premium", startDate: day(-45), endDate: calculateEndDate(day(-45), 12),
        paymentStatus: "payment_plan", instalments: plan.map(([amount, offset]) => ({ amount, dueDate: day(offset) })),
        outstandingBalance: plan.reduce((a, [amt]) => a + amt, 0), balanceDueDate: day(plan[plan.length - 1][1]),
      };
      const c = await createContract(sales, input, seedMeta);
      await startSigning(await sendContract(sales, c, seedMeta), seedMeta);
      await completeDemoSignature((await store.getContract(c.id))!, { kind: "type", typedName: name }, seedMeta);
      let signed = (await store.getContract(c.id)) as Contract;
      for (const it of signed.instalments.slice(0, collectFirst)) signed = await setInstalmentCollected(sales as StaffUser, signed, it.id, true, seedMeta);
    };
    await signPlan("Abdulfattah Abdi", "abdulfattah@example.com", 1500, [[1300, 24]], 0);
    await signPlan("Amira Hassan", "amira.hassan@example.com", 1000, [[600, -30], [600, -6], [600, 24]], 1);
    await signPlan("Daniel Okafor", "daniel.okafor@example.com", 800, [[1000, -14], [1000, 16]], 2);
  } catch (e) {
    console.error("Demo seed: could not create example contracts", e);
  }
}
