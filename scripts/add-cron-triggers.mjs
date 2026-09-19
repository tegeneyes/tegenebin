#!/usr/bin/env node
// Postbuild: inject cron triggers into the auto-generated wrangler.json so
// Cloudflare Workers runs our bot-jobs route every minute.
import { readFileSync, writeFileSync } from "fs";
const path = ".output/server/wrangler.json";
const config = JSON.parse(readFileSync(path, "utf8"));
config.triggers = config.triggers || {};
config.triggers.crons = ["* * * * *"];
writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
console.log("[postbuild] Added cron trigger to wrangler.json");
