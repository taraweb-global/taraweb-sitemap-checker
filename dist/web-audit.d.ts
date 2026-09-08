import { publicFetch } from "./web-fetch.js";
import type { SitemapDiagnostic, SitemapSetSummary } from "./types.js";
export declare function auditWeb(raw: unknown, checkStatus: boolean, signal: AbortSignal, fetcher?: typeof publicFetch): Promise<{
    url: string;
    sitemapStatus: number;
    summary: SitemapSetSummary | undefined;
    rows: {
        url: string;
        source: string;
        valid: boolean;
        status: number | null;
        statusNote: string;
    }[];
    diagnostics: SitemapDiagnostic[];
    diagnosticCount: number;
    validUrls: number;
    invalidUrls: number;
    statusRequested: boolean;
}>;

