import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrMeta, PrDetail, PrReviewComment } from '@devdigest/shared';
import { PrCommentInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { PullsService } from './service.js';

/**
 * F1 — pulls module. PR import via Octokit (list + per-PR detail).
 *   GET  /repos/:id/pulls    → list PRs for a repo (open + recently merged/closed,
 *                              synced from GitHub, persisted). `status` is
 *                              GitHub's merge state (open/merged/closed).
 *   GET  /pulls/:id          → full PR detail (diff/files, commits, body)
 *   GET  /pulls/:id/comments → inline review comments, proxied from GitHub
 *   POST /pulls/:id/comments → create one, proxied to GitHub
 *
 * Import is idempotent (unique repo_id + number). Review trigger is MANUAL and
 * owned by A2 — this module only imports/reads.
 *
 * This file is the composition point for the module: it builds the service from
 * `container.*` and maps HTTP ⇄ use case. Queries live in repository.ts and the
 * rules in service.ts / helpers.ts, so both are testable without Fastify.
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  // The repository comes from the composition root; this file only wires it to
  // the use cases and to Fastify's logger.
  const service = new PullsService(container.pullsRepo, () => container.github(), app.log);

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await getContext(container, req);
    return service.listPullsForRepo(workspaceId, req.params.id);
  });

  app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
    const { workspaceId } = await getContext(container, req);
    return service.getPullDetail(workspaceId, req.params.id);
  });

  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams } },
    async (req): Promise<PrReviewComment[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.listComments(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req): Promise<PrReviewComment> => {
      const { workspaceId } = await getContext(container, req);
      return service.createComment(workspaceId, req.params.id, req.body);
    },
  );
}
