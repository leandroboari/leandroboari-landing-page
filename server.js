import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

const env = (k, d = "") => (process.env[k] ?? d).trim();
const config = {
  port: Number(env("PORT", "3000")),
  host: env("HOST", "127.0.0.1"),
  trustProxy: env("TRUST_PROXY", "loopback"),
  turnstileSiteKey: env("TURNSTILE_SITE_KEY"),
  turnstileSecret: env("TURNSTILE_SECRET_KEY"),
  allowedHostnames: env("TURNSTILE_HOSTNAMES").split(",").map((s) => s.trim()).filter(Boolean),
  smtp: {
    host: env("SMTP_HOST"),
    port: Number(env("SMTP_PORT", "587")),
    secure: env("SMTP_SECURE", "false") === "true",
    user: env("SMTP_USER"),
    pass: env("SMTP_PASS"),
  },
  mailFrom: env("MAIL_FROM"),
  mailTo: env("MAIL_TO"),
};

if (!config.turnstileSiteKey || !config.turnstileSecret) {
  console.error("TURNSTILE_SITE_KEY e TURNSTILE_SECRET_KEY são obrigatórias (veja .env.example).");
  process.exit(1);
}

/* ---------- Mail transport ---------- */
let transport = null;
if (config.smtp.host) {
  if (!config.mailFrom || !config.mailTo) {
    console.error("MAIL_FROM e MAIL_TO são obrigatórias quando SMTP_HOST está definido.");
    process.exit(1);
  }
  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    requireTLS: !config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  transport.verify()
    .then(() => console.log(`SMTP pronto (${config.smtp.host}:${config.smtp.port}).`))
    .catch((err) => console.error("Falha ao conectar no SMTP:", err.message));
} else {
  console.warn("SMTP_HOST não definido: modo de desenvolvimento, as mensagens serão só exibidas no log.");
}

/* ---------- Helpers ---------- */
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const oneLine = (s) => s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function verifyTurnstile(token, ip) {
  const body = new URLSearchParams({ secret: config.turnstileSecret, response: token });
  if (ip) body.set("remoteip", ip);
  const ctrl = AbortSignal.timeout(8000);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
    signal: ctrl,
  });
  const data = await res.json();
  if (!data.success) return { ok: false, codes: data["error-codes"] || [] };
  if (config.allowedHostnames.length && !config.allowedHostnames.includes(data.hostname)) {
    return { ok: false, codes: ["hostname-mismatch"] };
  }
  return { ok: true };
}

/* Simple in-memory rate limit: N requests per window per IP */
const RATE_MAX = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE_MAX;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) {
    if (list.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(ip);
  }
}, RATE_WINDOW_MS).unref();

/* ---------- App ---------- */
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", config.trustProxy);

app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  next();
});

// index.html com a site key do Turnstile injetada
const indexHtml = readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8")
  .replaceAll("%TURNSTILE_SITE_KEY%", escapeHtml(config.turnstileSiteKey));
const sendIndex = (_req, res) => res.type("html").set("Cache-Control", "no-cache").send(indexHtml);
app.get(["/", "/index.html"], sendIndex);

app.use(express.static(PUBLIC_DIR, { index: false, maxAge: "7d" }));

app.post("/api/contact", express.json({ limit: "16kb" }), async (req, res) => {
  const ip = req.ip;
  const fail = (status, error) => res.status(status).json({ ok: false, error });

  if (rateLimited(ip)) return fail(429, "Muitas tentativas. Tente novamente em alguns minutos.");

  const b = req.body || {};
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const name = oneLine(str(b.name));
  const email = str(b.email);
  const message = str(b.message);
  const token = str(b.token);

  // Honeypot: bots preenchem; respondemos sucesso sem enviar.
  if (str(b.website)) return res.json({ ok: true });

  if (name.length < 2 || name.length > 100) return fail(400, "Informe seu nome.");
  if (email.length > 254 || !EMAIL_RE.test(email)) return fail(400, "Informe um e-mail válido.");
  if (message.length < 10 || message.length > 5000) return fail(400, "A mensagem deve ter entre 10 e 5000 caracteres.");
  if (!token || token.length > 2048) return fail(400, "Confirme a verificação anti-robô.");

  try {
    const check = await verifyTurnstile(token, ip);
    if (!check.ok) {
      console.warn(`Turnstile recusado (${ip}):`, check.codes.join(","));
      return fail(403, "Não foi possível validar a verificação anti-robô. Recarregue e tente de novo.");
    }
  } catch (err) {
    console.error("Erro ao validar Turnstile:", err.message);
    return fail(502, "Falha temporária na verificação. Tente novamente.");
  }

  const subject = `[leandroboari.com] Contato de ${name}`.slice(0, 160);
  const text = `Nome: ${name}\nE-mail: ${email}\nIP: ${ip}\n\n${message}\n`;
  const html = `<p><b>Nome:</b> ${escapeHtml(name)}<br><b>E-mail:</b> ${escapeHtml(email)}<br><b>IP:</b> ${escapeHtml(ip || "")}</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p>`;

  if (!transport) {
    console.log("---- [DEV] mensagem de contato ----\n" + subject + "\n" + text + "-----------------------------------");
    return res.json({ ok: true });
  }

  try {
    await transport.sendMail({
      from: config.mailFrom,
      to: config.mailTo,
      replyTo: { name, address: email },
      subject,
      text,
      html,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao enviar e-mail:", err.message);
    return fail(502, "Não consegui enviar agora. Tente novamente ou escreva direto para o e-mail.");
  }
});

app.use((_req, res) => res.status(404).type("text").send("Not found"));

app.listen(config.port, config.host, () => {
  console.log(`leandroboari.com ouvindo em http://${config.host}:${config.port}`);
});
