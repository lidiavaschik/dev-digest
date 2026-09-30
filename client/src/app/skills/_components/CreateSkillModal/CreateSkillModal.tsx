/* CreateSkillModal — author a skill by hand (source: manual). A duplicate name
   (409) is shown inline under the Name field. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, Textarea } from "@devdigest/ui";
import { useCreateSkill } from "../../../../lib/hooks/skills";
import { ApiError } from "../../../../lib/api";
import { skillHref } from "../../helpers";
import { SkillMetaFields, type SkillMeta } from "../SkillMetaFields";
import { BODY_ROWS, DEFAULT_TYPE, MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();
  const [meta, setMeta] = React.useState<SkillMeta>({ name: "", description: "", type: DEFAULT_TYPE });
  const [body, setBody] = React.useState("");
  const [nameTaken, setNameTaken] = React.useState(false);

  const canSubmit = meta.name.trim() !== "" && body.trim() !== "" && !create.isPending;

  const submit = async () => {
    setNameTaken(false);
    try {
      const skill = await create.mutateAsync({
        name: meta.name.trim(),
        description: meta.description,
        type: meta.type,
        body,
        source: "manual",
      });
      onClose();
      router.push(skillHref(skill.id));
    } catch (e) {
      // Other failures are surfaced by the global mutation error toast.
      if (e instanceof ApiError && e.status === 409) setNameTaken(true);
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={!canSubmit}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <SkillMetaFields
          value={meta}
          onChange={(next) => {
            if (next.name !== meta.name) setNameTaken(false);
            setMeta(next);
          }}
          nameError={nameTaken ? t("form.nameTaken") : null}
        />
        <FormField label={t("form.body")} required>
          <Textarea value={body} onChange={setBody} rows={BODY_ROWS} mono placeholder={t("form.bodyPlaceholder")} />
        </FormField>
      </div>
    </Modal>
  );
}
