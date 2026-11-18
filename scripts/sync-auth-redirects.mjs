#!/usr/bin/env node
/**
 * Sync Vercel project domains into Supabase Auth redirect allow-list.
 *
 * Why: Google OAuth only needs ONE authorized redirect URI —
 *   https://<project-ref>.supabase.co/auth/v1/callback
 * After Google, Supabase redirects to your app. If that app URL is not in
 * Auth → URL Configuration → Redirect URLs, Supabase silently falls back to
 * Site URL (often localhost). This script keeps the Supabase allow-list in
 * sync with every Vercel domain / preview pattern.
 *
 * Required env:
 *   SUPABASE_ACCESS_TOKEN  — https://supabase.com/dashboard/account/tokens
 *
 * Optional env:
 *   SUPABASE_PROJECT_REF   — defaults to baseline.projectRef
 *   VERCEL_TOKEN           — if set, pulls live project domains
 *   VERCEL_PROJECT_ID      — defaults to baseline.vercelProjectId
 *   VERCEL_TEAM_ID         — defaults to baseline.vercelTeamId
 *   SITE_URL               — overrides preferred Site URL
 *
 * Flags:
 *   --dry-run   print the planned PATCH without applying
 *   --replace   replace uri_allow_list instead of merging with existing
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(
  readFileSync(join(__dirname, "auth-redirects.baseline.json"), "utf8"),
);

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const replace = args.has("--replace");

const projectRef =
  process.env.SUPABASE_PROJECT_REF?.trim() || baseline.projectRef;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const vercelToken = process.env.VERCEL_TOKEN?.trim();
const vercelProjectId =
  process.env.VERCEL_PROJECT_ID?.trim() || baseline.vercelProjectId;
const vercelTeamId =
  process.env.VERCEL_TEAM_ID?.trim() || baseline.vercelTeamId || "";
const preferredSiteUrl =
  process.env.SITE_URL?.trim() || baseline.preferredSiteUrl || "";

if (!accessToken) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN. Create one at https://supabase.com/dashboard/account/tokens",
  );
  process.exit(1);
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function unique(urls) {
  return [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
}

function domainToRedirectPattern(domain) {
  const host = String(domain)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
  if (!host) return null;
  return `https://${host}/**`;
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const detail =
      typeof body === "string" ? body : JSON.stringify(body, null, 2);
    throw new Error(`${init.method || "GET"} ${url} → ${res.status}\n${detail}`);
  }
  return body;
}

async function listVercelDomains() {
  if (!vercelToken) {
    console.log("VERCEL_TOKEN not set — using baseline domains only.");
    return [];
  }

  const domains = [];
  let until = undefined;
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ limit: "100" });
    if (vercelTeamId) params.set("teamId", vercelTeamId);
    if (until) params.set("until", String(until));
    const data = await fetchJson(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(vercelProjectId)}/domains?${params}`,
      {
        headers: { Authorization: `Bearer ${vercelToken}` },
      },
    );
    const batch = Array.isArray(data?.domains) ? data.domains : [];
    for (const entry of batch) {
      if (entry?.name) domains.push(entry.name);
    }
    const next = data?.pagination?.next;
    if (!next || batch.length === 0) break;
    until = next;
  }

  console.log(`Fetched ${domains.length} Vercel domain(s).`);
  return domains;
}

async function getAuthConfig() {
  return fetchJson(
    `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );
}

async function patchAuthConfig(payload) {
  return fetchJson(
    `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
}

const current = await getAuthConfig();
const existing = normalizeList(current.uri_allow_list);
const vercelDomains = await listVercelDomains();

const fromBaseline = normalizeList(baseline.alwaysAllow);
const fromDomains = vercelDomains
  .map(domainToRedirectPattern)
  .filter(Boolean);

// Prefer exact production host pattern even before Vercel API is wired.
if (preferredSiteUrl) {
  fromDomains.push(domainToRedirectPattern(preferredSiteUrl));
}

const planned = unique(
  replace
    ? [...fromBaseline, ...fromDomains]
    : [...existing, ...fromBaseline, ...fromDomains],
);

const siteUrl =
  preferredSiteUrl ||
  (vercelDomains[0] ? `https://${vercelDomains[0]}` : current.site_url);

const payload = {
  site_url: siteUrl,
  uri_allow_list: planned.join(","),
};

console.log("Google Cloud Console: keep ONLY this Authorized redirect URI:");
console.log(
  `  https://${projectRef}.supabase.co/auth/v1/callback`,
);
console.log("(Do not add each site domain to Google — Supabase handles that.)");
console.log("");
console.log("Current Site URL:", current.site_url);
console.log("Planned Site URL:", payload.site_url);
console.log("Current allow-list count:", existing.length);
console.log("Planned allow-list count:", planned.length);
for (const url of planned) console.log("  -", url);

if (dryRun) {
  console.log("\nDry run only — no changes applied.");
  process.exit(0);
}

const sameSite = current.site_url === payload.site_url;
const sameList =
  unique(existing).sort().join(",") === planned.slice().sort().join(",");
if (sameSite && sameList) {
  console.log("\nAlready in sync — nothing to patch.");
  process.exit(0);
}

const updated = await patchAuthConfig(payload);
console.log("\nUpdated Site URL:", updated.site_url);
console.log("Updated allow-list:", updated.uri_allow_list);
console.log("Done.");
