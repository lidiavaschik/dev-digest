/**
 * Onion-architecture boundaries for reviewer-core (see .claude/skills/onion-architecture).
 *
 * reviewer-core is the application core of a review: NO I/O. The only side effect is the
 * injected LLMProvider port. src/llm/ is the single in-package adapter area
 * (OpenRouter over the openai SDK + its Zod→JSON-Schema helper) — nothing else may touch an SDK.
 *
 * Run:   npm run arch:check
 */
module.exports = {
  forbidden: [
    {
      name: 'core-no-io',
      severity: 'error',
      comment: 'No fs/network/process I/O in the engine; ask for a port and let the server inject it.',
      from: { path: '^src/' },
      to: {
        path: [
          '^(node:)?(fs|fs/promises|child_process|net|http|https|dgram|worker_threads)$',
          'node_modules/(drizzle-orm|postgres|fastify|@fastify|octokit|@octokit|simple-git|@anthropic-ai|@ast-grep|@vscode/ripgrep|dotenv)/',
        ],
      },
    },
    {
      name: 'sdk-only-in-llm-adapter',
      severity: 'error',
      comment: 'The openai SDK is allowed only in src/llm/ (the LLM adapter area).',
      from: { path: '^src/', pathNot: '^src/llm/' },
      to: { path: 'node_modules/openai/' },
    },
    {
      name: 'only-shared-from-server',
      severity: 'error',
      comment:
        'From ../server only @devdigest/shared (contracts + ports) is allowed — never db, adapters, modules or platform.',
      from: { path: '^src/' },
      to: { path: '^\\.\\./server/', pathNot: '^\\.\\./server/src/vendor/shared/' },
    },
    {
      name: 'no-circular',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules', '^\\.\\./server/'] },
    exclude: { path: '^test/|\\.test\\.ts$' },
    tsPreCompilationDeps: true,
    preserveSymlinks: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.d.ts'],
    },
  },
};
