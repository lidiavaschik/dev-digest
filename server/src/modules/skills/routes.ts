import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CreateSkillInput, ImportSkillFromUrlInput, UpdateSkillInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { IMPORT_BODY_LIMIT } from './constants.js';
import { SkillsService } from './service.js';

/** `/skills/:id/versions/:version` — id is a uuid, version a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const RestoreBody = z
  .object({ message: z.string().max(500).nullish() })
  .nullish();

const ImportPreviewBody = z.object({
  filename: z.string().min(1).max(255),
  content_base64: z.string().min(1).max(IMPORT_BODY_LIMIT),
});

const CommunityQuery = z.object({
  q: z.string().max(200).optional(),
  lang: z.string().max(50).optional(),
});

/**
 * Skills module (Skills Lab). All routes are workspace-scoped; an unknown or
 * other-workspace id is a 404 (thrown by the service).
 *   GET    /skills                                  → Skill[] (by name, + tokens, agent_count)
 *   GET    /skills/:id                              → Skill
 *   POST   /skills                                  → 201 Skill (v1 + snapshot; dup name → 409)
 *   PUT    /skills/:id                              → Skill (content change → v+1 + snapshot)
 *   DELETE /skills/:id                              → 204 (versions + agent links cascade)
 *   GET    /skills/:id/versions                     → SkillVersion[] newest first
 *   GET    /skills/:id/versions/:version            → SkillVersion
 *   POST   /skills/:id/versions/:version/restore    → Skill (new version with vN content)
 *   GET    /skills/:id/usage                        → SkillUsage
 *   POST   /skills/import/preview                   → SkillImportPreview (writes nothing)
 *   POST   /skills/import/preview-url               → SkillImportPreview from an https URL (writes nothing)
 *   GET    /skills/community?q=&lang=               → CommunitySkill[] (curated static catalog)
 * `/skills/community` is a static path, so find-my-way matches it before `/skills/:id`.
 */
export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new SkillsService({
    repo: container.skillsRepo,
    uow: container.skillsRepo,
    tokenizer: container.tokenizer,
    fetcher: container.skillFetcher,
  });

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/community', { schema: { querystring: CommunityQuery } }, async (req) => {
    await getContext(container, req);
    return service.community(req.query);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.post('/skills', { schema: { body: CreateSkillInput } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const skill = await service.create(workspaceId, req.body);
    return reply.status(201).send(skill);
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillInput } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    await service.delete(workspaceId, req.params.id);
    return reply.status(204).send();
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listVersions(workspaceId, req.params.id);
  });

  app.get(
    '/skills/:id/versions/:version',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getVersion(workspaceId, req.params.id, req.params.version);
    },
  );

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams, body: RestoreBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const { id, version } = req.params;
      return service.restore(workspaceId, id, version, req.body?.message);
    },
  );

  app.get('/skills/:id/usage', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.usage(workspaceId, req.params.id);
  });

  app.post(
    '/skills/import/preview',
    { bodyLimit: IMPORT_BODY_LIMIT, schema: { body: ImportPreviewBody } },
    async (req) => {
      // Tenancy is resolved (auth) even though nothing is read or written.
      await getContext(container, req);
      return service.preview(req.body.filename, req.body.content_base64);
    },
  );

  app.post(
    '/skills/import/preview-url',
    { schema: { body: ImportSkillFromUrlInput } },
    async (req) => {
      // Tenancy is resolved (auth) even though nothing is read or written.
      await getContext(container, req);
      return service.previewFromUrl(req.body.url);
    },
  );
}
