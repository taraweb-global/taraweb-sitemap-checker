// Copyright 2026 TaraWeb. Licensed under Apache-2.0.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { gunzipSync } from "node:zlib";
import { isNonPublicIp } from "./guarded-live-fetch.js";
export function webUrl(value) {
    if (typeof value !== "string" || value.length > 2048 || /[\s\\]/u.test(value))
        throw new Error("Enter a complete HTTP or HTTPS URL without spaces.");
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error("Enter a complete URL, such as https://example.com/sitemap.xml.");
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash || url.port)
        throw new Error("Use HTTP or HTTPS with a standard port, without credentials or a fragment.");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const normalizedHost = host.toLowerCase();
    if (normalizedHost === "localhost"
        || normalizedHost.endsWith(".localhost")
        || normalizedHost.endsWith(".local")
        || normalizedHost.endsWith(".internal")
        || (!isIP(normalizedHost) && !normalizedHost.includes("."))
        || (isIP(normalizedHost) && isNonPublicIp(normalizedHost)))
        throw new Error("Only public website addresses are allowed.");
    return url;
}
export async function publicFetch(raw, signal, head = false) {
    let url = webUrl(raw);
    for (let redirect = 0; redirect <= 3; redirect++) {
        signal.throwIfAborted();
        const host = url.hostname.replace(/^\[|\]$/g, "");
        const records = await Promise.race([
            lookup(host, { all: true, verbatim: true }),
            new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error("DNS lookup timed out.")), 5000); timer.unref(); }),
        ]);
        if (!records.length || records.some(record => isNonPublicIp(record.address)))
            throw new Error("This address resolves to a private or reserved network.");
        const selected = records[0];
        const response = await new Promise((resolve, reject) => {
            const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
                method: head ? "HEAD" : "GET", agent: false, signal,
                // Pin the socket to the address just checked; preserve Host and TLS hostname verification.
                lookup: (_hostname, lookupOptions, callback) => {
                    if (lookupOptions.all) {
                        callback(null, [{ address: selected.address, family: selected.family }]);
                    }
                    else {
                        callback(null, selected.address, selected.family);
                    }
                },
                headers: { "User-Agent": "TaraWebSitemapChecker/1.0 (+https://taraweb.tech)", "Accept-Encoding": "identity" },
            }, res => {
                const chunks = [];
                let size = 0;
                res.on("data", (chunk) => {
                    size += chunk.length;
                    if (size > 2 * 1024 * 1024) {
                        request.destroy(new Error("Sitemap exceeds the 2 MiB download limit."));
                        return;
                    }
                    chunks.push(chunk);
                });
                res.on("error", reject);
                res.on("end", () => resolve({ bytes: Buffer.concat(chunks), status: res.statusCode ?? 0, ...(res.headers.location ? { location: res.headers.location } : {}), ...(res.headers["content-encoding"] ? { encoding: res.headers["content-encoding"] } : {}) }));
            });
            const timer = setTimeout(() => request.destroy(new Error("Website did not respond within 8 seconds.")), 8000);
            request.on("close", () => clearTimeout(timer));
            request.on("error", () => reject(new Error("Unable to fetch website: connection failed, timed out, or was cancelled.")));
            request.end();
        });
        if ([301, 302, 303, 307, 308].includes(response.status) && response.location) {
            url = webUrl(new URL(response.location, url).href);
            continue;
        }
        let bytes = response.bytes;
        if (!head && (response.encoding === "gzip" || (bytes[0] === 31 && bytes[1] === 139)))
            bytes = gunzipSync(bytes, { maxOutputLength: 2 * 1024 * 1024 });
        return { bytes, status: response.status, url: url.href };
    }
    throw new Error("Website exceeded the three-redirect limit.");
}

