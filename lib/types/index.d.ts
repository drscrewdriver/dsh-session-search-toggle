/**
 * dsh-switch-search host half: one fenced HTTP route `/switch-search/api`
 * that drives the sidebar search panel's two modes:
 *
 * - `list-sessions` — the title-search corpus: every session id + folded
 *   title (+ cwd/updatedAt), read through `sessionQuery` (live-preferred).
 * - `content-search` — FTS5 message-content search grouped by session: each
 *   hit is the session header plus its strongest matching event's snippet,
 *   seq, and type. This is the "switch to content mode" data source.
 *
 * Both ride `sessionQuery`'s live-preferred corpus, so results include
 * sessions that are not currently loaded into the conversation window.
 * The route is browser-trust fenced exactly like dsh-history's `/history/api`.
 */
import type { Context } from 'cordis';
import z from '@deepseek-ai/schemastery';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type SwitchSearchConfig } from './config.ts';
export { DEFAULT_CONFIG, SWITCH_SEARCH_SETTINGS_NAMESPACE } from './config.ts';
export type { SwitchSearchConfig } from './config.ts';
/** The webServer service face this plugin uses (structural mirror). */
interface SwitchWebServer {
    register(route: {
        kind: 'exact' | 'prefix';
        path: string;
        handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
    }): () => void;
}
/** The web runtime service face: bind-derived trusted authorities. */
interface SwitchWebRuntime {
    trustedHosts: readonly string[];
}
/** One session header shape the query service returns (structural subset). */
interface SwitchSessionHeader {
    id: string;
    version: number;
    createdAt: number;
    cwd?: string;
    parentSession?: string;
    seedLength?: number;
    delegationDepth?: number;
    agentPreset?: string;
}
/** One logical-session record (structural subset). */
interface SwitchSessionRecord {
    header: SwitchSessionHeader;
    live: boolean;
    persisted: boolean;
}
/** One title observation result (structural subset). */
interface SwitchTitleObservationResult {
    status: 'fulfilled' | 'rejected';
    value?: {
        session: SwitchSessionHeader;
        title?: {
            title: string;
        };
    };
    reason?: unknown;
}
/** One strongest matching event hit (structural subset). */
interface SwitchEventHit {
    sessionId: string;
    seq: number;
    type: string;
    time: number;
    surface: string;
    snippet: string;
}
/** One grouped cross-session search hit (structural subset). */
interface SwitchSearchHit {
    header: SwitchSessionHeader;
    live: boolean;
    persisted: boolean;
    bestMatch: SwitchEventHit;
}
/** One content-search page (structural subset). */
interface SwitchSearchPage {
    items: readonly SwitchSearchHit[];
    nextCursor?: string;
}
/** The session-query service face: corpus reads, title folding, FTS5 search. */
interface SwitchSessionQuery {
    listSessions(signal?: AbortSignal): Promise<readonly SwitchSessionRecord[]>;
    readTitleSnapshots(sessionIds: readonly string[], signal?: AbortSignal): Promise<readonly SwitchTitleObservationResult[]>;
    searchSessions(request: {
        query: string;
        eventFilters?: readonly unknown[];
        limit?: number;
    }, exec?: {
        signal?: AbortSignal;
    }): Promise<SwitchSearchPage>;
}
declare module 'cordis' {
    interface Context {
        webServer: SwitchWebServer;
        webRuntime: SwitchWebRuntime;
        sessionQuery?: SwitchSessionQuery;
    }
}
/** Stable plugin name for the cordis row. */
export declare const name = "dsh-switch-search";
/** Services required before mounting: the web server routes and the trust list. */
export declare const inject: string[];
/** Composition-entry schema: what a dsh profile may configure at assembly time. */
export declare const Config: z<SwitchSearchConfig>;
/** Coarse type-filter buckets mapped onto raw session event types. */
export type SwitchContentType = 'all' | 'user' | 'reply' | 'tool';
/**
 * Plugin body: mount the fenced /switch-search/api route.
 * @param ctx - host plugin context (webServer, webRuntime).
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map