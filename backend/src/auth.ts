import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);
export const SESSION_COOKIE = "carebuddy_session";
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const token = () => randomBytes(32).toString("hex");
export const hashToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function hashPassword(password: string, salt = token()) {
  return {
    salt,
    hash: ((await derive(password, salt, 64)) as Buffer).toString("hex"),
  };
}
export async function checkPassword(
  password: string,
  salt: string,
  hash: string,
) {
  const actual = await hashPassword(password, salt);
  const left = Buffer.from(actual.hash, "hex"),
    right = Buffer.from(hash, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
export function sessionCookie(
  value: string,
  production: boolean,
  clear = false,
) {
  return `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : SESSION_MS / 1000}${production ? "; Secure" : ""}`;
}
export function readSessionCookie(raw?: string) {
  return raw
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}
