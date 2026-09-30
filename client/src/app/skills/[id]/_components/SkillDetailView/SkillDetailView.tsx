/* SkillDetailView — /skills/:id: rail + header + tabbed editor. Tab lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { useSkill } from "../../../../../lib/hooks/skills";
import { ApiError } from "../../../../../lib/api";
import type { SkillTab } from "../../../constants";
import { SkillsLayout } from "../../../_components/SkillsLayout";
import { SkillHeader } from "../SkillHeader";
import { SkillEditor } from "../SkillEditor";
import { s } from "./styles";

export function SkillDetailView({ id, tab, onTab }: { id: string; tab: SkillTab; onTab: (t: SkillTab) => void }) {
  const t = useTranslations("skills");
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  let content: React.ReactNode;
  if (isLoading) {
    content = (
      <div style={s.loading}>
        <Skeleton height={24} width={240} />
        <Skeleton height={200} />
      </div>
    );
  } else if (isError || !skill) {
    const notFound = error instanceof ApiError && error.status === 404;
    content = (
      <ErrorState
        title={notFound ? t("detail.notFound") : t("detail.loadError")}
        body={error instanceof ApiError && !notFound ? error.message : undefined}
        onRetry={notFound ? undefined : () => refetch()}
      />
    );
  } else {
    content = (
      <>
        <SkillHeader skill={skill} />
        <div style={s.editor}>
          <SkillEditor skill={skill} tab={tab} onTab={onTab} />
        </div>
      </>
    );
  }

  return (
    <SkillsLayout activeId={id} tab={tab} skillName={skill?.name}>
      {content}
    </SkillsLayout>
  );
}
