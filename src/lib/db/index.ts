import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "../config";
import type { Store } from "./types";
import { DemoStore } from "./demo";
import { SupabaseStore } from "./supabase";

let store: Store | null = null;
let seeding: Promise<void> | null = null;
const insideSeed = new AsyncLocalStorage<boolean>();

export async function getStore(): Promise<Store> {
  if (!store) store = config.supabase ? new SupabaseStore() : new DemoStore();
  if (store instanceof DemoStore && !insideSeed.getStore()) {
    // First run in demo mode: create demo staff, a sample template and example contracts.
    const demo = store;
    seeding ??= import("../services/demo-seed").then((m) => insideSeed.run(true, () => m.seedDemo(demo)));
    await seeding;
  }
  return store;
}

export type { Store } from "./types";
