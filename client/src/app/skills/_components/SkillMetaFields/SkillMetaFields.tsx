/* SkillMetaFields — the Name / Description (+directive hint) / Type trio shared by
   the Config tab, the Create modal and the Import drawer. Controlled. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, TextInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "../../constants";
import { s } from "./styles";

export interface SkillMeta {
  name: string;
  description: string;
  type: SkillType;
}

export function SkillMetaFields({
  value,
  onChange,
  nameError,
}: {
  value: SkillMeta;
  onChange: (next: SkillMeta) => void;
  /** Inline error under the name (e.g. 409 name taken). */
  nameError?: string | null;
}) {
  const t = useTranslations("skills");
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }));
  return (
    <>
      <FormField label={t("form.name")} required hint={nameError ? <span role="alert" style={s.error}>{nameError}</span> : undefined}>
        <TextInput
          value={value.name}
          onChange={(name) => onChange({ ...value, name })}
          placeholder={t("form.namePlaceholder")}
          aria-label={t("form.name")}
          mono
        />
      </FormField>
      <FormField label={t("form.description")} hint={t("config.descHint")}>
        <TextInput
          value={value.description}
          onChange={(description) => onChange({ ...value, description })}
          placeholder={t("form.descriptionPlaceholder")}
          aria-label={t("form.description")}
        />
      </FormField>
      <FormField label={t("form.type")}>
        <SelectInput
          value={value.type}
          onChange={(v) => onChange({ ...value, type: v as SkillType })}
          options={typeOptions}
        />
      </FormField>
    </>
  );
}
