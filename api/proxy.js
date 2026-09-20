const AEGIS_BACKEND_ORIGIN = "http://aegis-alb-847890664.ap-southeast-2.elb.amazonaws.com";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    req.on("error", reject);
  });
}

function forwardHeaders(req) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers || {})) {
    const lowerKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerKey) || lowerKey === "authorization") continue;
    if (Array.isArray(value)) headers[key] = value.join(", ");
    else if (value != null) headers[key] = String(value);
  }
  headers.authorization = `Bearer ${process.env.AEGIS_API_TOKEN || ""}`;
  return headers;
}

function targetPath(req, prefix) {
  const rawUrl = req.url || "/health";
  if (rawUrl.startsWith("/api/")) return rawUrl;
  const path = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
  return `/api${prefix}${path}`;
}

export async function proxyAegis(req, res, prefix = "") {
  if (!process.env.AEGIS_API_TOKEN) {
    return res.status(500).json({ error: "Aegis proxy is not configured" });
  }

  const target = new URL(targetPath(req, prefix), AEGIS_BACKEND_ORIGIN);
  if (!target.pathname.startsWith("/api/")) {
    return res.status(404).json({ error: "Unsupported proxy path" });
  }

  const body = ["GET", "HEAD"].includes(req.method || "GET") ? undefined : await collectBody(req);
  const upstream = await fetch(target, {
    method: req.method,
    headers: forwardHeaders(req),
    body,
  });

  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lowerKey)) res.setHeader(key, value);
  });

  const responseBody = Buffer.from(await upstream.arrayBuffer());
  return res.send(responseBody);
}
