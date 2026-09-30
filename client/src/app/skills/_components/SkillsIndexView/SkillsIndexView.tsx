/* SkillsIndexView — /skills with no id: jump to the first skill, or show the empty state. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Skeleton } from "@devdigest/ui";
import { useSkills } from "../../../../lib/hooks/skills";
import { skillHref } from "../../helpers";
import { IMPORT_MODE_ICON } from "../../constants";
import { SkillsLayout } from "../SkillsLayout";
import { s } from "./styles";

export function SkillsIndexView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading } = useSkills();
  const first = skills?.[0]?.id;

  // Redirect is a reaction to data arriving (an external system), not derived state.
  React.useEffect(() => {
    if (first) router.replace(skillHref(first));
  }, [first, router]);

  return (
    <SkillsLayout>
      {({ openCreate, openImport }) =>
        isLoading || first ? (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div>
            <EmptyState
              icon="Sparkles"
              title={t("page.empty.title")}
              body={t("page.empty.body")}
              cta={t("page.empty.cta")}
              onCta={openCreate}
            />
            <div style={s.secondary}>
              <Button kind="ghost" icon={IMPORT_MODE_ICON.file} onClick={() => openImport("file")}>
                {t("page.empty.import")}
              </Button>
              <Button kind="ghost" icon={IMPORT_MODE_ICON.url} onClick={() => openImport("url")}>
                {t("page.empty.fromUrl")}
              </Button>
              <Button kind="ghost" icon={IMPORT_MODE_ICON.community} onClick={() => openImport("community")}>
                {t("page.empty.community")}
              </Button>
            </div>
          </div>
        )
      }
    </SkillsLayout>
  );
}
