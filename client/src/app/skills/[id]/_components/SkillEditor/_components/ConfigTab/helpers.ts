import type { Skill, SkillType, UpdateSkillInput } from "@devdigest/shared";

/** The versioned (content) fields the Config form edits. `enabled` is saved separately. */
export interface SkillForm {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export function formFromSkill(skill: Skill): SkillForm {
  return { name: skill.name, description: skill.description, type: skill.type, body: skill.body };
}

/** Only the changed content fields (+ trimmed message when given). Empty object = nothing to save. */
export function buildPatch(skill: Skill, form: SkillForm, message: string): UpdateSkillInput {
  const patch: UpdateSkillInput = {};
  if (form.name.trim() !== skill.name) patch.name = form.name.trim();
  if (form.description !== skill.description) patch.description = form.description;
  if (form.type !== skill.type) patch.type = form.type;
  if (form.body !== skill.body) patch.body = form.body;
  if (Object.keys(patch).length > 0 && message.trim()) patch.message = message.trim();
  return patch;
}

export function isDirty(skill: Skill, form: SkillForm): boolean {
  return Object.keys(buildPatch(skill, form, "")).length > 0;
}
