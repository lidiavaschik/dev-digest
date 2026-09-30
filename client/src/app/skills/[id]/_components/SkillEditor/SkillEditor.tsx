/* SkillEditor — tab bar + active tab body for one skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import type { SkillTab } from "../../../constants";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersionsTab } from "./_components/VersionsTab";
import { StatsTab } from "./_components/StatsTab";
import { LessonPlaceholder } from "./_components/LessonPlaceholder";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({ skill, tab, onTab }: { skill: Skill; tab: SkillTab; onTab: (t: SkillTab) => void }) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(`tabs.${tb.key}`), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={(k) => onTab(k as SkillTab)} pad="0 24px" />
      </div>
      <div style={s.body}>
        {/* key = id + version IS the form reset: switching skills, a save or a restore remounts
            the tab with fresh useState seeds — no reset Effect. */}
        {tab === "config" && <ConfigTab key={`${skill.id}:${skill.version}`} skill={skill} />}
        {tab === "context" && (
          <LessonPlaceholder icon="Layers" title={t("placeholder.contextTitle")} body={t("placeholder.contextBody")} />
        )}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "evals" && (
          <LessonPlaceholder icon="FlaskConical" title={t("placeholder.evalsTitle")} body={t("placeholder.evalsBody")} />
        )}
        {tab === "stats" && <StatsTab skill={skill} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </div>
  );
}
