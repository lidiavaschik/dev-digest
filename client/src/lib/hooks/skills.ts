/* hooks/skills.ts — React Query hooks for the Skills Lab (list, editor, versions, import). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CommunitySkill,
  ImportSkillFromUrlInput,
  CreateSkillInput,
  Skill,
  SkillImportPreview,
  SkillUsage,
  SkillVersion,
  UpdateSkillInput,
} from "@devdigest/shared";

export const skillKeys = {
  all: ["skills"] as const,
  one: (id: string | null | undefined) => ["skill", id] as const,
  versions: (id: string | null | undefined) => ["skill-versions", id] as const,
  version: (id: string | null | undefined, v: number | null | undefined) =>
    ["skill-version", id, v] as const,
  usage: (id: string | null | undefined) => ["skill-usage", id] as const,
};

export function useSkills() {
  return useQuery({
    queryKey: skillKeys.all,
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.one(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

/** Input as sent over the wire — server applies the Zod defaults. */
export type CreateSkillBody = Pick<CreateSkillInput, "name" | "body"> &
  Partial<Omit<CreateSkillInput, "name" | "body">>;

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillBody) => api.post<Skill>("/skills", input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: skillKeys.all });
      qc.setQueryData(skillKeys.one(data.id), data);
    },
  });
}

export interface UpdateSkillArgs {
  id: string;
  patch: UpdateSkillInput;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillArgs) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: skillKeys.all });
      qc.invalidateQueries({ queryKey: skillKeys.versions(data.id) });
      qc.setQueryData(skillKeys.one(data.id), data);
      // Agent skill lists embed skill fields (name/enabled) — refresh them too.
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: skillKeys.all });
      qc.removeQueries({ queryKey: skillKeys.one(id) });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.versions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useSkillVersion(id: string | null | undefined, version: number | null | undefined) {
  return useQuery({
    queryKey: skillKeys.version(id, version),
    queryFn: () => api.get<SkillVersion>(`/skills/${id}/versions/${version}`),
    enabled: !!id && version != null,
  });
}

export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`, {}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: skillKeys.all });
      qc.invalidateQueries({ queryKey: skillKeys.versions(data.id) });
      qc.setQueryData(skillKeys.one(data.id), data);
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}

export function useSkillUsage(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.usage(id),
    queryFn: () => api.get<SkillUsage>(`/skills/${id}/usage`),
    enabled: !!id,
  });
}

/** Parse an uploaded .md / .zip server-side. Nothing is persisted. */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: { filename: string; content_base64: string }) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

/** Server fetches the URL (https, public hosts only) and parses it. Nothing is persisted. */
export function useImportSkillFromUrl() {
  return useMutation({
    mutationFn: (input: ImportSkillFromUrlInput) =>
      api.post<SkillImportPreview>("/skills/import/preview-url", input),
  });
}

/** Curated community catalog, filtered server-side by `q` and `lang`. */
export function useCommunitySkills(params: { q?: string; lang?: string }) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.lang) qs.set("lang", params.lang);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: ["community-skills", params.q ?? "", params.lang ?? ""],
    queryFn: () => api.get<CommunitySkill[]>(`/skills/community${suffix}`),
    staleTime: 5 * 60_000,
  });
}
