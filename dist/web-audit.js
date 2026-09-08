// Copyright 2026 TaraWeb. Licensed under Apache-2.0.
import { validateSitemapSetEvents } from "./index.js";
import { publicFetch, webUrl } from "./web-fetch.js";
export async function auditWeb(raw, checkStatus, signal, fetcher = publicFetch) {
    const url = webUrl(raw).href;
    let downloaded = 0;
    const load = async (target) => {
        const result = await fetcher(target, signal);
        if (result.status < 200 || result.status >= 300)
            throw new Error(`Sitemap returned HTTP ${result.status}.`);
        downloaded += result.bytes.byteLength;
        if (downloaded > 8 * 1024 * 1024)
            throw new Error("Sitemap set exceeds the 8 MiB total limit.");
        return result;
    };
    const root = await load(url);
    const rows = [];
    const diagnostics = [];
    let summary;
    let diagnosticCount = 0;
    for await (const event of validateSitemapSetEvents(root.bytes, {
        sourceId: root.url, sitemapLocation: root.url, signal, maxSources: 20, maxDepth: 3,
        limits: { maxUncompressedBytes: 2 * 1024 * 1024, maxUrlsPerSitemap: 5000, maxSitemapsPerIndex: 20 },
        loader: async ({ loc }) => { const child = await load(loc); return { input: child.bytes, sourceId: child.url, sitemapLocation: child.url }; },
    })) {
        if (event.type === "sitemap:url") {
            if (rows.length >= 5000)
                throw new Error("This web check supports up to 5,000 URL entries. Use the CLI for larger sitemaps.");
            let valid = false;
            try {
                const parsed = new URL(event.loc ?? "");
                valid = ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password && !parsed.hash && !/[\s\\]/u.test(event.loc ?? "");
            }
            catch { /* Invalid entries remain visible. */ }
            rows.push({ url: event.loc ?? "(missing URL)", source: event.sourceId, valid, status: null, statusNote: "Not checked" });
        }
        if (event.type === "diagnostic") {
            diagnosticCount++;
            if (diagnostics.length < 200)
                diagnostics.push(event.diagnostic);
        }
        if (event.type === "set:summary")
            summary = event.summary;
    }
    if (checkStatus) {
        const sample = rows.filter(row => row.valid).slice(0, 25);
        await Promise.all(Array.from({ length: 3 }, async (_, worker) => {
            for (let i = worker; i < sample.length; i += 3) {
                signal.throwIfAborted();
                const row = sample[i];
                try {
                    row.status = (await fetcher(row.url, signal, true)).status;
                    row.statusNote = "HEAD response";
                }
                catch {
                    row.statusNote = "Unavailable or blocked";
                }
            }
        }));
    }
    return { url, sitemapStatus: root.status, summary, rows, diagnostics, diagnosticCount, validUrls: rows.filter(row => row.valid).length, invalidUrls: rows.filter(row => !row.valid).length, statusRequested: checkStatus };
}

