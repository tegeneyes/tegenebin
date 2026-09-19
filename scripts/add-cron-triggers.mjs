#!/usr/bin/env node
// Postbuild: inject cron triggers into the auto-generated wrangler.json for
// Cloudflare Workers deploys. Skips silently on other platforms (Vercel, etc.)
// where wrangler.json is not generated.
import { readFileSync, writeFileSync, existsSync } from "fs";
const path = ".output/server/wrangler.json";
if (!existsSync(path)) {
  console.log("[postbuild] No wrangler.json found — skipping cron injection");
  process.exit(0);
}
const config = JSON.parse(readFileSync(path, "utf8"));
config.triggers = config.triggers || {};
config.triggers.crons = ["* * * * *"];
writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
console.log("[postbuild] Added cron trigger to wrangler.json");
