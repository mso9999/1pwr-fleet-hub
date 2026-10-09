/**
 * Per-org / per-country routing of mission-approval WhatsApp notices.
 * Pure: no I/O, env is injectable for tests.
 */

const JID_SUFFIXES = ["@g.us", "@s.whatsapp.net"];

function validJid(v: unknown): v is string {
  return typeof v === "string" && JID_SUFFIXES.some((s) => v.endsWith(s) && v.length > s.length);
}

/** Org ids are lower-cased; anything that looks like a 2-letter country code is upper-cased. */
function normaliseKey(k: string): string {
  const key = k.trim();
  return /^[A-Za-z]{2}$/.test(key) ? key.toUpperCase() : key.toLowerCase();
}

export function parseGroupJidMap(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const text = (raw ?? "").trim();
  if (!text) return out;

  const add = (k: unknown, v: unknown) => {
    if (typeof k !== "string" || typeof v !== "string") return;
    const key = normaliseKey(k);
    const jid = v.trim();
    if (!key || !validJid(jid)) return;
    out[key] = jid;
  };

  if (text.startsWith("{")) {
    try {
      const obj = JSON.parse(text) as unknown;
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        for (const [k, v] of Object.entries(obj)) add(k, v);
      }
    } catch {
      /* malformed JSON → empty map */
    }
    return out;
  }

  for (const part of text.split(/[,;]/)) {
    const idx = part.indexOf("=");
    if (idx < 1) continue;
    add(part.slice(0, idx), part.slice(idx + 1));
  }
  return out;
}

export interface ApprovalGroupResolution {
  jid: string | null;
  source: string;
  reason?: string;
}

export function resolveApprovalGroupJid(opts: {
  organizationId: string;
  country: string | null;
  env?: Record<string, string | undefined>;
}): ApprovalGroupResolution {
  const env = opts.env ?? process.env;
  const org = (opts.organizationId || "").trim().toLowerCase();
  const country = opts.country ? opts.country.trim().toUpperCase() : null;
  const map = parseGroupJidMap(env.WA_BRIDGE_GROUP_JID_BY_ORG);

  if (org && map[org]) return { jid: map[org], source: `map:${org}` };
  if (country && map[country]) return { jid: map[country], source: `map:${country}` };

  if (org === "1pwr_lesotho" || country === "LS") {
    const legacy = (env.WA_BRIDGE_GROUP_JID || "").trim();
    if (legacy) return { jid: legacy, source: "legacy:LS" };
  }

  return {
    jid: null,
    source: "none",
    reason: `no WhatsApp approval group configured for org ${org || "?"} (country ${country ?? "?"}) — suppressed`,
  };
}
