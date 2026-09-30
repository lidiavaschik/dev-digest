/* FilePicker — "From file" step of the Import drawer: upload a SKILL.md / .zip and let the
   server parse it (nothing persisted). 422 parse errors render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { useImportSkillPreview } from "../../../../../../lib/hooks/skills";
import { ApiError } from "../../../../../../lib/api";
import type { OnPreview } from "../../types";
import { ACCEPT } from "./constants";
import { fileToBase64 } from "./helpers";
import { s } from "./styles";

export function FilePicker({ onPreview }: { onPreview: OnPreview }) {
  const t = useTranslations("skills");
  const previewMut = useImportSkillPreview();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const content_base64 = await fileToBase64(file);
      const p = await previewMut.mutateAsync({ filename: file.name, content_base64 });
      onPreview(p, { kind: "file" });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("import.parseFailed"));
      // Let the same file be picked again after fixing it.
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div style={s.pick}>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        aria-label={t("import.choose")}
        style={s.hiddenInput}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Icon.Upload size={24} style={s.pickIcon} />
      <Button kind="secondary" icon="FileText" onClick={() => fileRef.current?.click()} loading={previewMut.isPending}>
        {previewMut.isPending ? t("import.parsing") : t("import.choose")}
      </Button>
      <div style={s.hint}>{t("import.acceptHint")}</div>
      {error && (
        <div role="alert" style={s.error}>
          {error}
        </div>
      )}
    </div>
  );
}
