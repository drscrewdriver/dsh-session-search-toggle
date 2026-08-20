import type { Context } from 'cordis';
import { type SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client';
import { type SwitchSearchConfig } from '../config.ts';
/** ------------------------------------------------------------------ types */
/** The client slots service face (structural subset used here). */
interface SwitchSlotsService {
    inject(key: string, callback: () => () => void, label?: string): () => void;
    register(options: {
        name: string;
        id?: string;
        key?: string;
        order?: number;
        store?: unknown;
        locale?: string;
        inject?: (actions: unknown) => unknown;
    }, component: unknown): () => void;
}
/** The client sessions service face: open a session from a search result. */
interface SwitchSessionsService {
    open(id: string): void;
}
/** The client settings-scope service face (structural subset). */
interface SwitchSettingsScope<T> {
    bind<T>(spec: {
        namespace: string;
    }): SwitchScopeLike<T>;
}
interface SwitchScopeLike<T> {
    getSnapshot(): SettingsScopeSnapshot<T>;
    subscribe(listener: () => void): () => void;
    set(field: string, value: unknown): Promise<void>;
}
/** Local mirror of the settings namespace the General row edits. */
export interface SwitchSearchSettingsState {
    enabled: boolean;
    defaultMode: SwitchSearchConfig['defaultMode'];
    /** Namespace revision fencing the sync (skips stale snapshots). */
    revision: number;
    /** Whether the Host document accepts writes. */
    writable: boolean;
    /** Namespace not exposed to this client (row renders the unavailable note). */
    unavailable: boolean;
}
/** Write face the settings row receives from the inject factory. */
export interface SwitchSearchSettingsInjected {
    setEnabled: (value: boolean) => void;
    setDefaultMode: (value: SwitchSearchConfig['defaultMode']) => void;
}
/** The settings store: mirror of the namespace section plus the write set. */
export declare const switchSearchStore: import("@deepseek-ai/dsh-client-runtime/client").EngineStoreHandle<SwitchSearchSettingsState, {
    sync(d: SwitchSearchSettingsState, snap: SettingsScopeSnapshot<SwitchSearchConfig>): void;
}>;
/** Baked store actions handed to the inject factory (the `sync` write set;
 *  the draft parameter is bound by the framework, so consumers pass only snap). */
export type SwitchSearchActions = {
    sync: (snap: SettingsScopeSnapshot<SwitchSearchConfig>) => void;
};
/** The store handle type, for props derivation. */
export type SwitchSearchStore = {
    create: () => SwitchSearchSettingsState;
};
declare module 'cordis' {
    interface Context {
        slots: SwitchSlotsService;
        sessions?: SwitchSessionsService;
        settingsScope?: SwitchSettingsScope<SwitchSearchConfig>;
    }
}
/** ------------------------------------------------------------------ plugin */
/** Services required before mounting: the slot registry, sessions, and settings scope. */
export declare const inject: string[];
/**
 * Client plugin body: inject the stylesheet and register the footer entry
 * plus the General settings row.
 * @param ctx - client plugin context (slots, sessions, settingsScope).
 */
export declare function apply(ctx: Context): void;
export {};
//# sourceMappingURL=index.d.ts.map