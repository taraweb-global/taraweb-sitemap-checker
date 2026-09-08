// Copyright 2026 TaraWeb. Licensed under Apache-2.0.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { auditWeb } from "./web-audit.js";
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const origin = process.env.APP_ORIGIN ?? `http://localhost:${port}`;
const assets = new Map([["/", ["index.html", "text/html; charset=utf-8"]], ["/app.js", ["app.js", "text/javascript; charset=utf-8"]], ["/style.css", ["style.css", "text/css; charset=utf-8"]]]);
let active = 0;
const server = createServer(async (req, res) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    const json = (status, data) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
    if (req.headers.host !== new URL(origin).host) {
        json(403, { error: "Unrecognised host. Open the configured app URL." });
        return;
    }
    const asset = assets.get(req.url ?? "");
    if (req.method === "GET" && asset) {
        try {
            res.setHeader("Content-Type", asset[1]);
            res.end(await readFile(new URL(`../web/${asset[0]}`, import.meta.url)));
        }
        catch {
            json(500, { error: "Web assets unavailable." });
        }
        return;
    }
    if (req.url !== "/api/validate" || req.method !== "POST") {
        json(404, { error: "Not found." });
        return;
    }
    if (req.headers.origin !== origin || req.headers["content-type"] !== "application/json") {
        json(403, { error: "Use the form on the app page." });
        return;
    }
    if (active >= 2) {
        res.setHeader("Retry-After", "10");
        json(429, { error: "Two checks are already running. Please retry shortly." });
        return;
    }
    active++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    res.on("close", () => controller.abort());
    try {
        let body = "";
        for await (const chunk of req) {
            body += String(chunk);
            if (Buffer.byteLength(body) > 4096)
                throw new Error("Request is too large.");
        }
        const data = JSON.parse(body);
        if (!data || typeof data !== "object" || !("url" in data))
            throw new Error("Enter a sitemap URL.");
        json(200, await auditWeb(data.url, "checkStatus" in data && data.checkStatus === true, controller.signal));
    }
    catch (error) {
        json(400, { error: controller.signal.aborted ? "Check timed out. Try a smaller sitemap or use the CLI." : error instanceof Error ? error.message : "Unable to validate this sitemap." });
    }
    finally {
        clearTimeout(timer);
        active--;
    }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(port, host, () => console.log(`TaraWeb Sitemap Checker: ${origin}`));

