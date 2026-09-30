/* SkillsRail — left rail of the Skills Lab: header + "Add Skill ▾", search, skill cards.
   Toggling a card flips the skill's global `enabled` (no new version). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { skillHref } from "../../helpers";
import { IMPORT_MODE_ICON, type ImportMode } from "../../constants";
import { SkillCard } from "../SkillCard";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsRail({
  activeId,
  tab,
  onCreate,
  onImport,
}: {
  activeId?: string;
  tab?: string;
  onCreate: () => void;
  onImport: (mode: ImportMode) => void;
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const list = filterSkills(skills ?? [], search);

  return (
    <aside style={s.rail}>
      <div style={s.top}>
        <div style={s.headerRow}>
          <h1 style={s.h1}>{t("page.heading")}</h1>
          <Dropdown
            width={240}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.fromFile"), icon: IMPORT_MODE_ICON.file, onClick: () => onImport("file") },
              { label: t("page.menu.fromUrl"), icon: IMPORT_MODE_ICON.url, onClick: () => onImport("url") },
              { label: t("page.menu.community"), icon: IMPORT_MODE_ICON.community, onClick: () => onImport("community") },
              { divider: true },
              { label: t("page.menu.create"), icon: "Edit", onClick: onCreate },
            ]}
          />
        </div>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("page.searchPlaceholder")}
            aria-label={t("page.searchPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>
      <div style={s.list}>
        {isLoading && (
          <>
            <Skeleton height={96} />
            <div style={s.gap} />
            <Skeleton height={96} />
          </>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && search.trim() && list.length === 0 && (
          <div style={s.noMatch}>{t("page.noMatch", { query: search.trim() })}</div>
        )}
        {list.map((sk) => (
          <SkillCard
            key={sk.id}
            skill={sk}
            active={sk.id === activeId}
            onClick={() => router.push(skillHref(sk.id, tab))}
            onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
          />
        ))}
      </div>
    </aside>
  );
}
