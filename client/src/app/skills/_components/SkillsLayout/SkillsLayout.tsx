/* SkillsLayout — Skills Lab master-detail frame: AppShell + left SkillsRail + detail pane.
   Owns the Create modal / Import drawer so both the rail menu and empty-state CTAs open them. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Crumb } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { SkillsRail } from "../SkillsRail";
import { CreateSkillModal } from "../CreateSkillModal";
import { ImportSkillDrawer } from "../ImportSkillDrawer";
import type { ImportMode } from "../../constants";
import { s } from "./styles";

type Overlay = { kind: "create" } | { kind: "import"; mode: ImportMode } | null;

export interface SkillsLayoutActions {
  openCreate: () => void;
  openImport: (mode: ImportMode) => void;
}

export function SkillsLayout({
  activeId,
  tab,
  skillName,
  children,
}: {
  activeId?: string;
  tab?: string;
  skillName?: string;
  /** Detail pane; a function receives the overlay openers (for empty-state CTAs). */
  children: React.ReactNode | ((actions: SkillsLayoutActions) => React.ReactNode);
}) {
  const t = useTranslations("skills");
  const [overlay, setOverlay] = React.useState<Overlay>(null);
  const actions: SkillsLayoutActions = {
    openCreate: () => setOverlay({ kind: "create" }),
    openImport: (mode) => setOverlay({ kind: "import", mode }),
  };
  const crumb: Crumb[] = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    ...(skillName ? [{ label: skillName }] : []),
  ];

  return (
    <AppShell crumb={crumb}>
      {overlay?.kind === "create" && <CreateSkillModal onClose={() => setOverlay(null)} />}
      {overlay?.kind === "import" && (
        // key: re-opening from another menu entry starts in that entry's mode.
        <ImportSkillDrawer key={overlay.mode} mode={overlay.mode} onClose={() => setOverlay(null)} />
      )}
      <div style={s.frame}>
        <SkillsRail activeId={activeId} tab={tab} onCreate={actions.openCreate} onImport={actions.openImport} />
        <main style={s.detail}>{typeof children === "function" ? children(actions) : children}</main>
      </div>
    </AppShell>
  );
}
