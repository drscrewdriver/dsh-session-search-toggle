/**
 * tsdown build for dsh-session-search-toggle:
 *
 * - `lib/index.mjs` — the host half (ESM node): one fenced HTTP route
 *   `/switch-search/api` that lists sessions (title search) and searches
 *   message content through `sessionQuery` (FTS5), returning session-level
 *   hits with the strongest snippet.
 * - `lib/client.js` — the browser client bundle (CJS closure factory),
 *   registering with the package-name id `dsh-session-search-toggle` (the
 *   client-modules compose keys on the package name; keep it in sync with
 *   package.json `name`). It mounts a `sidebar.footer.action` entry whose
 *   panel toggles 标题搜索 / 内容搜索.
 *
 * Types ship from lib/types (tsc -p tsconfig.build.json), not from tsdown.
 */
import { builtinModules } from 'node:module'
import type { UserConfig } from 'tsdown'

/** Node builtins must never survive into the browser module-loader factory. */
const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map(id => `node:${id}`),
])

/** Module specifiers the web shell shares into the frozen module table. */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'cordis',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-client-ui-conversation',
]

/** Host half: plain ESM node output. */
const hostConfig: UserConfig = {
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'node20',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: [/^node:/, '@deepseek-ai/dsh-session-query', '@deepseek-ai/dsh-session'],
  },
}

/** One client bundle build for a plugin id. */
function clientBundle(pluginId: string, entryFile: string): UserConfig {
  return {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: [...CLIENT_EXTERNALS],
      alwaysBundle: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
      'import.meta.resolve': 'undefined',
    },
    inputOptions: {
      resolve: {
        conditionNames: ['browser', 'import', 'require', 'default'],
      },
    },
    outputOptions: {
      entryFileNames: entryFile,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pluginId)}, factory: (require) => {`,
      footer: `return module.exports; } });`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      codeSplitting: false,
    },
  }
}

export default [
  hostConfig,
  clientBundle('dsh-session-search-toggle', 'client.js'),
]
