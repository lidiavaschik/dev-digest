/* CommunityBrowser — "Community" step of the Import drawer: search the curated catalog,
   filter by language, and import an entry through the URL preview flow (nothing persisted
   until the shared preview step is confirmed). Entries already in the workspace show "Installed". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Icon, SelectInput, Skeleton } from "@devdigest/ui";
import type { CommunitySkill } from "@devdigest/shared";
import { useCommunitySkills, useImportSkillFromUrl, useSkills } from "../../../../../../lib/hooks/skills";
import { ApiError } from "../../../../../../lib/api";
import type { OnPreview } from "../../types";
import { CommunityCard } from "./_components/CommunityCard";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { ALL_LANGS, SEARCH_DEBOUNCE_MS, SKELETON_COUNT } from "./constants";
import { filterByLang, installedNames, languageOptions } from "./helpers";
import { s } from "./styles";

export function CommunityBrowser({ onPreview }: { onPreview: OnPreview }) {
  const t = useTranslations("skills");
  const [search, setSearch] = React.useState("");
  const [lang, setLang] = React.useState(ALL_LANGS);
  const q = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  // Language is filtered client-side so the select can list every language of the current search.
  const { data, isLoading, isError, refetch } = useCommunitySkills({ q: q || undefined });
  const { data: skills } = useSkills();
  const importMut = useImportSkillFromUrl();
  const [importingId, setImportingId] = React.useState<string | null>(null);
  const [importError, setImportError] = React.useState<string | null>(null);

  const entries = filterByLang(data ?? [], lang);
  const installed = installedNames(skills);
  const langOptions = [
    { value: ALL_LANGS, label: t("community.allLanguages") },
    ...languageOptions(data ?? [], lang).map((l) => ({ value: l, label: l })),
  ];

  const onImport = async (entry: CommunitySkill) => {
    setImportError(null);
    setImportingId(entry.id);
    try {
      const p = await importMut.mutateAsync({ url: entry.url });
      onPreview(p, { kind: "community", entry });
    } catch (e) {
      setImportError(e instanceof ApiError ? e.message : t("community.importFailed"));
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div style={s.root}>
      <div role="note" style={s.note}>
        <Icon.Info size={15} style={s.noteIcon} />
        <span>{t("community.note")}</span>
      </div>
      <div style={s.filters}>
        <div style={s.search}>
          <Icon.Search size={14} style={s.searchIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("community.searchPlaceholder")}
            aria-label={t("community.searchPlaceholder")}
            style={s.searchInput}
            autoFocus
          />
        </div>
        <div style={s.lang}>
          <SelectInput
            value={lang}
            onChange={setLang}
            options={langOptions}
            mono={false}
            aria-label={t("community.language")}
          />
        </div>
      </div>
      {importError && (
        <div role="alert" style={s.error}>
          {importError}
        </div>
      )}
      {isLoading ? (
        <div style={s.list} aria-busy="true">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <Skeleton key={i} height={96} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState body={t("community.loadError")} onRetry={() => refetch()} />
      ) : entries.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyTitle}>{t("community.noMatchTitle")}</div>
          <div style={s.emptyBody}>{t("community.noMatchBody")}</div>
        </div>
      ) : (
        <div style={s.list}>
          {entries.map((entry) => (
            <CommunityCard
              key={entry.id}
              entry={entry}
              installed={installed.has(entry.name.toLowerCase())}
              importing={importingId === entry.id}
              disabled={importingId !== null}
              onImport={() => onImport(entry)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
