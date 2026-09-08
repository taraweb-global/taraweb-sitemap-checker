export declare function webUrl(value: unknown): URL;
export declare function publicFetch(raw: string, signal: AbortSignal, head?: boolean): Promise<{
    bytes: Uint8Array;
    status: number;
    url: string;
}>;

