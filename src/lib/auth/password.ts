import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32, PARAMS);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(password, Buffer.from(salt, "base64"), expected.length, PARAMS);
  return timingSafeEqual(key, expected);
}

export function validateNewPassword(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters.";
  if (password.length > 128) return "Password is too long.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "Use a mix of letters and numbers.";
  return null;
}

export function generatePassword(): string {
  // ~20 chars, unambiguous alphabet, always contains letters and digits.
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(18);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out.slice(0, 6)}-${out.slice(6, 12)}-${out.slice(12, 16)}${(randomBytes(1)[0] % 90) + 10}`;
}
