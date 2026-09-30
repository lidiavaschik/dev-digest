/* SkillCard — one skill in the Skills rail: type tile, mono name, enabled toggle,
   one-line description, type/source chips (+ "needs vetting"), usage footer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SOURCE_ICON, TYPE_META } from "../../constants";
import { needsVetting } from "../../helpers";
import { TypeIconTile } from "../TypeIconTile";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const meta = TYPE_META[skill.type];
  const SourceIcon = Icon[SOURCE_ICON[skill.source]];
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onClick?.();
      }}
      style={s.card(!!active)}
    >
      <div style={s.headerRow}>
        <TypeIconTile type={skill.type} size={26} />
        <span className="mono" style={s.name(skill.enabled)}>
          {skill.name}
        </span>
        {onToggle && (
          // Stop the click here so toggling never navigates to the skill.
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} aria-label={t("card.toggleLabel", { name: skill.name })}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
      </div>
      {skill.description && <div style={s.description}>{skill.description}</div>}
      <div style={s.chips}>
        <Badge color={meta.color} bg={meta.bg}>
          {t(`type.${skill.type}`)}
        </Badge>
        <span style={s.source}>
          <SourceIcon size={12} />
          {t(`source.${skill.source}`)}
        </span>
        {needsVetting(skill) && (
          <span title={t("card.vettingTitle")}>
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("card.needsVetting")}
            </Badge>
          </span>
        )}
      </div>
      <div style={s.divider} />
      <div className="tnum" style={s.footer}>
        {t("card.agents", { count: skill.agent_count ?? 0 })} · {t("card.pull")} · {t("card.accept")}
      </div>
    </div>
  );
}
