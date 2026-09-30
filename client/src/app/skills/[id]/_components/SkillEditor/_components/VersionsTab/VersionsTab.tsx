/* Versions tab — immutable snapshots of the skill; Diff against current, Restore (as a new version). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { VersionDiffModal } from "./_components/VersionDiffModal";
import { isoDate } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffOf, setDiffOf] = React.useState<SkillVersion | null>(null);
  const versions = [...(data ?? [])].sort((x, y) => y.version - x.version);

  const doRestore = (v: SkillVersion) => {
    if (!window.confirm(t("versions.restoreConfirm", { version: v.version }))) return;
    restore.mutate(
      { id: skill.id, version: v.version },
      {
        onSuccess: (next) =>
          toast.success(t("versions.restoredToast", { version: v.version, newVersion: next.version })),
      },
    );
  };

  return (
    <div style={s.wrap}>
      {diffOf && <VersionDiffModal version={diffOf} skill={skill} onClose={() => setDiffOf(null)} />}
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        {data && <Badge>{t("versions.count", { count: versions.length })}</Badge>}
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>

      {isLoading && <Skeleton height={120} />}
      {isError && <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />}
      {data && versions.length === 0 && <EmptyState icon="History" title={t("versions.fallbackMessage")} />}
      {versions.length > 0 && (
        <div style={s.list}>
          {versions.map((v) => {
            const current = v.version === skill.version;
            return (
              <div key={v.version} style={s.row} data-testid={`version-${v.version}`}>
                <span className="mono" style={s.pill}>
                  v{v.version}
                </span>
                <span style={s.message}>{v.message || t("versions.fallbackMessage")}</span>
                <span className="mono tnum" style={s.date}>
                  {isoDate(v.created_at)}
                </span>
                <div style={s.actions}>
                  {current ? (
                    <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
                      {t("versions.current")}
                    </Badge>
                  ) : (
                    <>
                      <Button kind="ghost" size="sm" onClick={() => setDiffOf(v)}>
                        {t("versions.diff")}
                      </Button>
                      <Button kind="secondary" size="sm" icon="RefreshCw" onClick={() => doRestore(v)} disabled={restore.isPending}>
                        {t("versions.restore")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
