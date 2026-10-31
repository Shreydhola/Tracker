import { randomBytes, createHash } from "node:crypto";
import { compare } from "bcryptjs";
import { cookies, headers } from "next/headers";
import { db } from "./db";
import { config } from "./config";
export const hashToken = (s: string) =>
  createHash("sha256").update(s).digest("hex");
const cookieName = "tracker_session";
export async function currentUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: true },
  });
  return s && s.expiresAt > new Date() ? s.user : null;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
export async function sameOrigin() {
  const h = await headers();
  if (h.get("origin") !== new URL(config().APP_URL).origin)
    throw new Error("FORBIDDEN");
}
export async function rateLimit(key: string, limit = 10, seconds = 900) {
  const result = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "RateLimit" (key,count,"resetAt") VALUES (${key},1,NOW()+${seconds}*INTERVAL '1 second') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN "RateLimit"."resetAt"<NOW() THEN 1 ELSE "RateLimit".count+1 END,"resetAt"=CASE WHEN "RateLimit"."resetAt"<NOW() THEN NOW()+${seconds}*INTERVAL '1 second' ELSE "RateLimit"."resetAt" END RETURNING count`;
  if (result[0].count > limit) throw new Error("RATE_LIMIT");
}
export async function login(email: string, password: string) {
  await rateLimit("login:" + hashToken(email.toLowerCase()));
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  const valid = await compare(
    password,
    user?.passwordHash ??
      "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxCgb8Hb9I2S4YveOnm7lZq9tPy",
  );
  if (!user || !valid) throw new Error("Invalid email or password");
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      id: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 8 * 3600000),
    },
  });
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure: config().APP_URL.startsWith("https:"),
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 3600,
  });
  await audit(user.email, "login", user.id);
}
export async function logout() {
  const jar = await cookies();
  const t = jar.get(cookieName)?.value;
  if (t) await db.session.deleteMany({ where: { id: hashToken(t) } });
  jar.delete(cookieName);
}
export async function audit(
  actor: string,
  action: string,
  target: string,
  detail?: object,
) {
  await db.auditLog.create({
    data: {
      actor,
      action,
      target,
      detail: detail ? JSON.parse(JSON.stringify(detail)) : undefined,
    },
  });
}
