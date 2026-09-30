/* SkillHeader — detail header: type tile, mono name, type + version badges, "Run on evals" (L04). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { TYPE_META } from "../../../constants";
import { TypeIconTile } from "../../../_components/TypeIconTile";
import { s } from "./styles";

export function SkillHeader({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const meta = TYPE_META[skill.type];
  return (
    <div style={s.row}>
      <TypeIconTile type={skill.type} size={32} />
      <h1 className="mono" style={s.name}>
        {skill.name}
      </h1>
      <Badge color={meta.color} bg={meta.bg}>
        {t(`type.${skill.type}`)}
      </Badge>
      <Badge icon="GitCommit" mono>
        {t("header.version", { version: skill.version })}
      </Badge>
      <div style={s.right}>
        {/* Evals land in L04; the button is a visible placeholder. */}
        <span title={t("header.runOnEvalsTitle")}>
          <Button kind="secondary" size="sm" icon="Play" disabled>
            {t("header.runOnEvals")}
          </Button>
        </span>
      </div>
    </div>
  );
}
