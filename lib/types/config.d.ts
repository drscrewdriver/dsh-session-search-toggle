/**
 * Pure shared config surface for dsh-switch-search.
 *
 * Kept schemastery-free so the browser bundle can import it directly (the
 * host half owns the schemastery schema in src/index.ts). The settings
 * namespace reuses the same shape, so a value admitted at one surface is
 * admitted at the other — same pattern as dsh-thinking-levels' thinking-level.ts.
 */
/** Default mode of the sidebar search panel when it opens. */
export type SwitchSearchDefaultMode = 'title' | 'content';
/** Runtime-adjustable plugin configuration (settings namespace + composition entry). */
export interface SwitchSearchConfig {
    /** Whether the search plugin is active at all. */
    enabled: boolean;
    /** Which search mode the panel opens in by default. */
    defaultMode: SwitchSearchDefaultMode;
}
/** Defaults when nothing is configured. */
export declare const DEFAULT_CONFIG: SwitchSearchConfig;
/** The settings namespace the host half registers (kept in lockstep with src/index.ts). */
export declare const SWITCH_SEARCH_SETTINGS_NAMESPACE = "switch-search";
//# sourceMappingURL=config.d.ts.map