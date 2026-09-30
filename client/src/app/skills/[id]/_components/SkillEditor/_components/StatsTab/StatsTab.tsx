/* Stats tab — usage (real, from /skills/:id/usage) + placeholder metrics until Evals (L04). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillUsage } from "../../../../../../../lib/hooks/skills";
import { NO_VALUE, PENDING_METRICS } from "./constants";
import { s } from "./styles";

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: usage, isLoading, isError, refetch } = useSkillUsage(skill.id);
  const agents = usage?.agents ?? [];

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        <div style={s.tile}>
          <div style={s.tileLabel}>{t("stats.usedBy")}</div>
          <div className="tnum" style={s.tileValue}>
            {isLoading ? NO_VALUE : t("stats.usedByValue", { count: agents.length })}
          </div>
        </div>
        {PENDING_METRICS.map((m) => (
          <div key={m} style={s.tile}>
            <div style={s.tileLabel}>{t(`stats.${m}`)}</div>
            <div style={s.tileValueMuted}>{NO_VALUE}</div>
          </div>
        ))}
      </div>
      <p style={s.note}>{t("stats.metricsNote")}</p>

      <section style={s.panel}>
        <div style={s.panelTitle}>{t("stats.agentsTitle")}</div>
        {isLoading && <Skeleton height={40} />}
        {isError && <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && agents.length === 0 && <EmptyState icon="Cpu" title={t("stats.noAgents")} />}
        {agents.map((a) => (
          <div key={a.id} style={s.agentRow}>
            <Icon.Cpu size={14} style={s.agentIcon} />
            <span style={s.agentName}>{a.name}</span>
            {!a.link_enabled && <Badge color="var(--text-muted)">{t("stats.offForAgent")}</Badge>}
            <Link href={`/agents/${a.id}?tab=skills`} style={s.open}>
              {t("stats.open")}
              <Icon.ArrowRight size={12} />
            </Link>
          </div>
        ))}
      </section>
    </div>
  );
}
