#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const cache = process.env.SITEMAP_VALIDATOR_NPM_CACHE ?? join(tmpdir(), "sitemap-validator-npm-cache");
await mkdir(cache, { recursive: true });

const npmCli = process.env.npm_execpath;
const command = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const args = npmCli
  ? [npmCli, "pack", "--dry-run", "--cache", cache]
  : ["pack", "--dry-run", "--cache", cache];
const child = spawn(command, args, {
  stdio: "inherit",
  shell: !npmCli && process.platform === "win32",
  env: {
    ...process.env,
    npm_config_cache: cache,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

