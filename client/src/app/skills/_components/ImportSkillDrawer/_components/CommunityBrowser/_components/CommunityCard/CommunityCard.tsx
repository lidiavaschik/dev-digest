/* CommunityCard — one community catalog entry: name, repo, stars, language + type chips,
   2-line description and an Import button (or "Installed" when the workspace has it). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { CommunitySkill } from "@devdigest/shared";
import { TYPE_META } from "../../../../../../constants";
import { formatStars } from "../../helpers";
import { s } from "./styles";

export function CommunityCard({
  entry,
  installed,
  importing,
  disabled,
  onImport,
}: {
  entry: CommunitySkill;
  /** A workspace skill already has this name — importing again would 409. */
  installed: boolean;
  /** This entry's import is in flight. */
  importing: boolean;
  /** Another entry's import is in flight. */
  disabled: boolean;
  onImport: () => void;
}) {
  const t = useTranslations("skills");
  const typeMeta = entry.type ? TYPE_META[entry.type] : null;
  return (
    <article style={s.card} aria-label={entry.name}>
      <div style={s.main}>
        <div style={s.titleRow}>
          <span className="mono" style={s.name}>
            {entry.name}
          </span>
          <span className="mono" style={s.repo} title={entry.repo}>
            {entry.repo}
          </span>
        </div>
        <div style={s.meta}>
          <span className="tnum" style={s.stars} title={t("community.stars", { stars: entry.stars })}>
            <Icon.Star size={12} style={s.starIcon} />
            {formatStars(entry.stars)}
          </span>
          {entry.lang && <Badge>{entry.lang}</Badge>}
          {entry.type && typeMeta && (
            <Badge color={typeMeta.color} bg={typeMeta.bg}>
              {t(`type.${entry.type}`)}
            </Badge>
          )}
        </div>
        {entry.desc && <div style={s.desc}>{entry.desc}</div>}
      </div>
      <div style={s.action}>
        {installed ? (
          <Button kind="ghost" size="sm" icon="Check" disabled title={t("community.installedTitle")}>
            {t("community.installed")}
          </Button>
        ) : (
          <Button
            kind="secondary"
            size="sm"
            icon="Upload"
            loading={importing}
            disabled={disabled}
            onClick={onImport}
            aria-label={t("community.importLabel", { name: entry.name })}
          >
            {importing ? t("community.importing") : t("community.import")}
          </Button>
        )}
      </div>
    </article>
  );
}
