/* UrlPicker — "From URL" step of the Import drawer: the server fetches the URL (https,
   public hosts only), parses it and returns a preview. Fetch/parse failures render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput } from "@devdigest/ui";
import { useImportSkillFromUrl } from "../../../../../../lib/hooks/skills";
import { ApiError } from "../../../../../../lib/api";
import type { OnPreview } from "../../types";
import { s } from "./styles";

export function UrlPicker({ onPreview }: { onPreview: OnPreview }) {
  const t = useTranslations("skills");
  const fetchMut = useImportSkillFromUrl();
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const trimmed = url.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || fetchMut.isPending) return;
    setError(null);
    try {
      const p = await fetchMut.mutateAsync({ url: trimmed });
      onPreview(p, { kind: "url", url: trimmed });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("url.fetchFailed"));
    }
  };

  return (
    <form style={s.form} onSubmit={submit}>
      <FormField label={t("url.label")} required hint={t("url.hint")}>
        <TextInput
          inputMode="url"
          spellCheck={false}
          value={url}
          onChange={(v) => {
            setUrl(v);
            setError(null);
          }}
          placeholder={t("url.placeholder")}
          aria-label={t("url.label")}
          mono
          autoFocus
        />
      </FormField>
      <div style={s.actions}>
        <Button type="submit" kind="primary" icon="Link" loading={fetchMut.isPending} disabled={!trimmed}>
          {fetchMut.isPending ? t("url.fetching") : t("url.fetch")}
        </Button>
      </div>
      {error && (
        <div role="alert" style={s.error}>
          {error}
        </div>
      )}
    </form>
  );
}
