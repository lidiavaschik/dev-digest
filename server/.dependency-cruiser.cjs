/**
 * Onion-architecture boundaries for server/ (see .claude/skills/onion-architecture).
 *
 *   domain  ←  application (service.ts, ports.ts, use cases)  ←  infrastructure (repository, adapters)
 *                                                             ←  presentation (routes.ts, job handlers)
 *   platform/container.ts is the composition root — the only file allowed to wire adapters.
 *
 * Run:   pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known
 * Known (pre-existing) violations live in .dependency-cruiser-known-violations.json.
 * Shrink that file as modules are migrated; never grow it to make CI green.
 * Regenerate after a fix: pnpm exec depcruise-baseline src --config .dependency-cruiser.cjs
 *
 * preserveSymlinks: pnpm packages are reported as node_modules/<pkg>/… (not the versioned
 * node_modules/.pnpm/<pkg>@x.y.z/… path), so the baseline survives lockfile bumps and scratch
 * copies whose node_modules is a symlink.
 */

// Modules that would put I/O or a framework into the core.
const INFRA_PACKAGES =
  '(node_modules/(drizzle-orm|postgres|fastify|@fastify|fastify-.*|openai|@anthropic-ai|octokit|@octokit|simple-git|@ast-grep|@vscode/ripgrep|dependency-cruiser|js-tiktoken|p-queue)/|(node:)?(fs|child_process|net|http|https)$)';

// Layer file patterns inside src/modules/<name>/.
const DOMAIN = '^src/modules/[^/]+/domain/';
const ROUTES = '^src/modules/[^/]+/routes\\.ts$';
const SERVICE = '^src/modules/[^/]+/(service|ports)\\.ts$';

module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment:
        'domain/ is plain TypeScript: no framework, ORM, SDK, fs or DB schema. ' +
        'Only other domain files, @devdigest/shared contracts/ports and the AppError taxonomy.',
      from: { path: DOMAIN },
      to: {
        pathNot: [DOMAIN, '^src/vendor/shared/', '^src/platform/errors\\.ts$'],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'domain-no-infra-types',
      severity: 'error',
      comment: 'Even type-only imports of db/, adapters/, platform/ leak infrastructure into the domain.',
      from: { path: DOMAIN },
      to: {
        path: ['^src/(db|adapters|platform)/', '^src/modules/[^/]+/(routes|service|repository)'],
        pathNot: '^src/platform/errors\\.ts$',
      },
    },
    {
      name: 'routes-no-db',
      severity: 'error',
      comment:
        'routes.ts is a thin HTTP adapter: parse (Zod type provider) → call a service → map. ' +
        'Move queries into repository.ts behind the service.',
      from: { path: ROUTES },
      to: { path: ['^src/db/', 'node_modules/(drizzle-orm|postgres)/'] },
    },
    {
      name: 'routes-no-repository',
      severity: 'error',
      comment:
        'routes.ts must not construct a repository (`new XRepository(container.db)`): the composition ' +
        'root (platform/container.ts) builds it and routes pass `container.xRepo` into the service.',
      from: { path: ROUTES },
      to: { path: '^src/modules/[^/]+/repository(\\.ts$|/)', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'service-no-orm',
      severity: 'error',
      comment:
        'The application layer depends on repository ports, not on Drizzle or the schema. ' +
        'Row types ($inferSelect / db/rows.ts) stay in repository.ts + mappers.ts.',
      from: { path: SERVICE },
      to: { path: ['^src/db/', 'node_modules/(drizzle-orm|postgres)/'] },
    },
    {
      name: 'service-no-http',
      severity: 'error',
      comment: 'The application layer must not know about Fastify; throw AppError subclasses instead.',
      from: { path: SERVICE },
      to: { path: ['node_modules/(fastify|@fastify)/', ROUTES] },
    },
    {
      name: 'service-no-container',
      severity: 'error',
      comment:
        'Inject narrow ports through the constructor instead of the whole Container ' +
        '(service locator). routes.ts builds the service from container.*.',
      from: { path: SERVICE },
      to: { path: '^src/platform/container\\.ts$' },
    },
    {
      name: 'service-no-concrete-repository',
      severity: 'error',
      comment:
        'service.ts must not construct its repository (`new XRepository(db)`). Depend on the port ' +
        'in ports.ts (type-only imports are fine) and receive the instance through the constructor.',
      from: { path: SERVICE },
      to: { path: '^src/modules/[^/]+/repository(\\.ts$|/)', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'adapters-only-via-composition-root',
      severity: 'error',
      comment:
        'Concrete adapters are constructed in platform/container.ts only; modules use the ' +
        'port interface from @devdigest/shared. Pure helpers living in adapters/ belong in the module or shared.',
      from: { path: '^src/', pathNot: ['^src/adapters/', '^src/platform/container\\.ts$'] },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        'Another module is reached through its index.ts or through the container, never its internals.',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: ['^src/modules/$1/', '^src/modules/_shared/', '^src/modules/[^/]+/(index|types)\\.ts$'],
      },
    },
    {
      name: 'shared-is-innermost',
      severity: 'error',
      comment: '@devdigest/shared (contracts + ports) is the core: it imports nothing from the app.',
      from: { path: '^src/vendor/shared/' },
      to: { path: '^src/', pathNot: '^src/vendor/shared/' },
    },
    {
      name: 'core-no-infra-packages',
      severity: 'error',
      comment: 'Innermost code must not import I/O or framework packages.',
      from: { path: [DOMAIN, '^src/vendor/shared/'] },
      to: { path: INFRA_PACKAGES },
    },
    {
      name: 'no-circular',
      severity: 'warn',
      comment: 'Cycles usually mean a layer is reaching outward.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(test|dist|clones)/|\\.test\\.ts$' },
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
