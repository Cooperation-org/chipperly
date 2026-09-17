// Hand-written twin declaration for embedded.mjs (plain JS, no build step),
// so TS consumers (test/globalSetup.ts) get real types instead of implicit any.
import type EmbeddedPostgres from 'embedded-postgres';

export declare const PORT: number;
export declare const HOST: string;
export declare const USER: string;
export declare const PASSWORD: string;
export declare const DATA_DIR: string;

export declare function ensureServer(): Promise<EmbeddedPostgres>;
export declare function ensureDatabase(name: string): Promise<void>;
export declare function connectionUrl(database: string): string;
