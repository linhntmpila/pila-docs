import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { AppEnv, Env, User } from "./types";

const SESSION_COOKIE = "pila_session";
const SESSION_TTL = 60 * 60 * 24 * 7;

const randomId = (bytes = 32) =>
  [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");

export const isAdminEmail = (env: Env, email: string) =>
  env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());

const emailAllowed = (env: Env, email: string) =>
  email.toLowerCase().endsWith("@" + env.ALLOWED_DOMAIN.toLowerCase());

async function startSession(c: any, user: Omit<User, "isAdmin">) {
  const id = randomId();
  await c.env.SESSIONS.put(`sess:${id}`, JSON.stringify(user), { expirationTtl: SESSION_TTL });
  setCookie(c, SESSION_COOKIE, id, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

/** Attach c.var.user (or null) from the session cookie. */
export const loadUser = createMiddleware<AppEnv>(async (c, next) => {
  let user: User | null = null;
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid && /^[0-9a-f]{64}$/.test(sid)) {
    const raw = await c.env.SESSIONS.get(`sess:${sid}`);
    if (raw) {
      const u = JSON.parse(raw) as Omit<User, "isAdmin">;
      // Re-evaluate on every request so removing an admin takes effect immediately.
      if (emailAllowed(c.env, u.email)) user = { ...u, isAdmin: isAdminEmail(c.env, u.email) };
    }
  }
  c.set("user", user);
  await next();
});

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("user")) return c.json({ error: "Chưa đăng nhập" }, 401);
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "Chưa đăng nhập" }, 401);
  if (!u.isAdmin) return c.json({ error: "Chỉ quản trị viên mới có quyền này" }, 403);
  await next();
});

/** Block cross-site state-changing requests (cookies are SameSite=Lax; this is defence in depth). */
export const sameOriginWrites = createMiddleware<AppEnv>(async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: "Origin không hợp lệ" }, 403);
  }
  await next();
});

export const auth = new Hono<AppEnv>();

auth.get("/login", async (c) => {
  const next = c.req.query("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const origin = new URL(c.req.url).origin;
  const state = randomId(16);
  await c.env.SESSIONS.put(`oauth:${state}`, safeNext, { expirationTtl: 600 });
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/auth/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    hd: c.env.ALLOWED_DOMAIN, // UI hint only; enforced again in the callback
    prompt: "select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

auth.get("/callback", async (c) => {
  const { code, state, error } = c.req.query();
  if (error || !code || !state) return c.redirect("/login.html?error=cancelled");
  const next = await c.env.SESSIONS.get(`oauth:${state}`);
  if (!next) return c.redirect("/login.html?error=state");
  await c.env.SESSIONS.delete(`oauth:${state}`);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${new URL(c.req.url).origin}/auth/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return c.redirect("/login.html?error=token");
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) return c.redirect("/login.html?error=token");

  // The id_token came straight from Google's token endpoint over TLS, so decoding it
  // without checking the signature is what Google's docs allow for this flow.
  const b64 = id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)))) as {
    aud: string; email?: string; email_verified?: boolean; hd?: string; name?: string; picture?: string;
  };
  if (claims.aud !== c.env.GOOGLE_CLIENT_ID) return c.redirect("/login.html?error=token");
  const email = claims.email?.toLowerCase();
  if (!email || !claims.email_verified || claims.hd !== c.env.ALLOWED_DOMAIN || !emailAllowed(c.env, email)) {
    return c.redirect("/login.html?error=domain");
  }
  await startSession(c, { email, name: claims.name ?? email, picture: claims.picture });
  return c.redirect(next);
});

// Local development only: sign in without Google. Disabled unless DEV_LOGIN=true.
auth.get("/dev", async (c) => {
  if (c.env.DEV_LOGIN !== "true") return c.notFound();
  const email = (c.req.query("email") ?? "").toLowerCase();
  if (!emailAllowed(c.env, email)) return c.json({ error: "email phải thuộc domain được phép" }, 400);
  await startSession(c, { email, name: email.split("@")[0] });
  return c.redirect("/");
});

auth.post("/logout", async (c) => {
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) await c.env.SESSIONS.delete(`sess:${sid}`);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
