import assert from "node:assert/strict";
import test from "node:test";
import { auditWeb } from "../dist/web-audit.js";
import { webUrl } from "../dist/web-fetch.js";

test("webUrl accepts public HTTPS sitemap URLs", () => {
  assert.equal(webUrl("https://example.com/sitemap.xml").href, "https://example.com/sitemap.xml");
});

test("webUrl rejects credentials, custom ports, fragments, and internal targets", () => {
  for (const value of [
    "https://user:placeholder@example.com/sitemap.xml",
    "https://example.com:8443/sitemap.xml",
    "https://example.com/sitemap.xml#fragment",
    "http://127.0.0.1/sitemap.xml",
    "http://169.254.169.254/latest/meta-data/",
    "http://service.internal/sitemap.xml",
    "http://printer.local/sitemap.xml",
    "http://intranet/sitemap.xml",
  ]) assert.throws(() => webUrl(value), /public website|standard port|credentials|fragment/u);
});

test("auditWeb validates a sitemap and performs bounded optional status checks", async () => {
  const xml = new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/</loc></url>
      <url><loc>https://example.com/about</loc></url>
    </urlset>`);
  const calls = [];
  const fetcher = async (url, _signal, head = false) => {
    calls.push({ url, head });
    return head
      ? { bytes: new Uint8Array(), status: 200, url }
      : { bytes: xml, status: 200, url };
  };

  const result = await auditWeb("https://example.com/sitemap.xml", true, new AbortController().signal, fetcher);
  assert.equal(result.summary?.valid, true);
  assert.equal(result.validUrls, 2);
  assert.equal(result.invalidUrls, 0);
  assert.deepEqual(result.rows.map(row => row.status), [200, 200]);
  assert.equal(calls.filter(call => call.head).length, 2);
});

