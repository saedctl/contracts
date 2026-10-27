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
import { completeDemoSignature, createContract, sendContract, startSigning } from "./contracts";

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
    createdBy: admin.id, bodySha256: sha256Hex(SAMPLE_TEMPLATE_BODY), isSample: true,
  });
  await store.activateTemplateVersion(t.id);

  const start = todayISO();
  const make = (name: string, email: string, amount: number, months: 3 | 6 | 12): ContractInput => ({
    customerName: name, customerEmail: email, customerPhone: "+44 7700 900000", duration: String(months) as "3",
    startDate: start, endDate: calculateEndDate(start, months), amountPaid: amount, currency: "GBP",
    paymentStatus: "paid_in_full", paymentSchedule: "", outstandingBalance: 0,
  });

  try {
    const john = await createContract(sales, make("John Smith", "john.smith@example.com", 499, 6), seedMeta);
    const sentJohn = await sendContract(sales, john, seedMeta);
    await startSigning(sentJohn, seedMeta);
    await completeDemoSignature((await store.getContract(john.id))!, { kind: "type", typedName: "John Smith" }, seedMeta);

    const sarah = await createContract(sales, make("Sarah Ahmed", "sarah.ahmed@example.com", 999, 12), seedMeta);
    await sendContract(sales, sarah, seedMeta);

    await createContract(sales, make("Michael Jones", "michael.jones@example.com", 299, 3), seedMeta);
  } catch (e) {
    console.error("Demo seed: could not create example contracts", e);
  }
}
