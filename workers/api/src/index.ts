import { createRemoteJWKSet, jwtVerify } from "jose";

interface Env {
  DB: D1Database;
  ACCESS_ISSUER: string;
  ACCESS_AUD: string;
}

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(issuer: string) {
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksByIssuer.set(issuer, jwks);
  }
  return jwks;
}

async function getUserId(request: Request, env: Env): Promise<string | null> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token || !env.ACCESS_ISSUER || !env.ACCESS_AUD) return null;

  try {
    const { payload } = await jwtVerify(token, getJwks(env.ACCESS_ISSUER), {
      issuer: env.ACCESS_ISSUER,
      audience: env.ACCESS_AUD,
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return json({ ok: true });
    if (!url.pathname.startsWith("/api/data/")) return json({ error: "Not found" }, 404);

    const userId = await getUserId(request, env);
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const key = decodeURIComponent(url.pathname.slice("/api/data/".length));
    if (!key || key.includes("/")) return json({ error: "Invalid key" }, 400);

    if (request.method === "GET") {
      const row = await env.DB.prepare(
        "SELECT value FROM app_data WHERE app_id = ? AND user_id = ? AND key = ?",
      )
        .bind(url.hostname, userId, key)
        .first<{ value: string }>();
      return json({ value: row?.value ?? null });
    }

    if (request.method === "PUT") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
      if (
        !body ||
        typeof body !== "object" ||
        !("value" in body) ||
        typeof body.value !== "string"
      ) {
        return json({ error: "Expected a string value" }, 400);
      }
      await env.DB.prepare(
        "INSERT INTO app_data (app_id, user_id, key, value, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT (app_id, user_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
      )
        .bind(url.hostname, userId, key, body.value)
        .run();
      return json({ ok: true });
    }

    return json({ error: "Method not allowed" }, 405);
  },
};
