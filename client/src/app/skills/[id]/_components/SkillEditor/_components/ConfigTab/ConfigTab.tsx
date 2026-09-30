/* Config tab — edit the versioned content of a skill (name/description/type/body).
   Save creates a new version (with an optional "what changed" note); the Enabled
   toggle saves immediately and does NOT create a version. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, TextInput, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { estimateTokens } from "../../../../../helpers";
import { SkillMetaFields } from "../../../../../_components/SkillMetaFields";
import { BodyEditor } from "./_components/BodyEditor";
import { buildPatch, formFromSkill, isDirty, type SkillForm } from "./helpers";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const update = useUpdateSkill();
  const toggle = useUpdateSkill();
  const del = useDeleteSkill();
  // No reset Effect: SkillEditor keys this tab by id+version, so a different skill,
  // a save or a restore remounts it with fresh seeds.
  const [form, setForm] = React.useState<SkillForm>(() => formFromSkill(skill));
  const [message, setMessage] = React.useState("");

  const dirty = isDirty(skill, form);
  const tokens = dirty || skill.tokens == null ? estimateTokens(form.body) : skill.tokens;
  const canSave = dirty && form.name.trim() !== "" && form.body.trim() !== "" && !update.isPending;

  const save = () =>
    update.mutate(
      { id: skill.id, patch: buildPatch(skill, form, message) },
      { onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })) },
    );

  const setEnabled = (enabled: boolean) =>
    toggle.mutate(
      { id: skill.id, patch: { enabled } },
      { onSuccess: () => toast.success(enabled ? t("config.enabledOn") : t("config.enabledOff")) },
    );

  const remove = () => {
    if (!window.confirm(t("config.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("config.deletedToast"));
        router.push("/skills");
      },
    });
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <Badge icon="GitCommit" mono>
          {t("header.version", { version: skill.version })}
        </Badge>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={skill.enabled} onChange={setEnabled} size={16} />
        </label>
      </div>

      <SkillMetaFields
        value={form}
        onChange={(meta) => setForm((f) => ({ ...f, ...meta }))}
      />

      <FormField label={t("config.body")} required>
        <BodyEditor
          filename={`${form.name.trim() || "skill"}.md`}
          value={form.body}
          onChange={(body) => setForm((f) => ({ ...f, body }))}
          dirty={dirty}
          tokens={tokens}
          placeholder={t("form.bodyPlaceholder")}
        />
      </FormField>

      {dirty && (
        <FormField label={t("config.message")}>
          <TextInput
            value={message}
            onChange={setMessage}
            placeholder={t("config.messagePlaceholder")}
            aria-label={t("config.message")}
            maxLength={500}
          />
        </FormField>
      )}

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={!canSave}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
      </div>

      <section style={s.danger}>
        <div style={s.dangerText}>
          <div style={s.dangerTitle}>{t("config.dangerTitle")}</div>
          <div style={s.dangerBody}>{t("config.dangerBody")}</div>
        </div>
        <Button kind="danger" icon="Trash" onClick={remove} disabled={del.isPending}>
          {t("config.delete")}
        </Button>
      </section>
    </div>
  );
}
