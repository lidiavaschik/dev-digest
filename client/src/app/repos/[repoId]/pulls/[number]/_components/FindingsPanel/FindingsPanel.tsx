/* FindingsPanel — this run's severity tally + severity filter +
   hide-low-confidence + j/k navigation + FindingCard list, wiring the
   accept/dismiss action hook (A2).

   The pills and the filter are per RUN: the panel is rendered once inside each
   ReviewRunAccordion, so the numbers always describe the findings listed right
   below them. Both are a plain group-by over findings already in memory — no
   request, and certainly no model call, on open or on filter change. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, Chip, Icon, SEV } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { KEY_TO_ACTION, SEVERITIES } from "./constants";
import { bySeverity, countBySeverity, visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [severity, setSeverity] = React.useState<Severity | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  // Confidence filter first — the pills count what the severity filter WOULD
  // show, so each number matches the cards you get by clicking it.
  const candidates = React.useMemo(() => visibleFindings(findings, hideLow), [findings, hideLow]);
  const counts = React.useMemo(() => countBySeverity(candidates), [candidates]);
  const shown = React.useMemo(() => bySeverity(candidates, severity), [candidates, severity]);

  // A changed filter invalidates the cursor. Keyed on the filters, not on
  // `shown` — that gets a new identity on every background refetch and would
  // yank the cursor mid-read.
  React.useEffect(() => setFocusIdx(0), [severity, hideLow]);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, Math.max(0, shown.length - 1)));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      {/* «N CRITICAL · N WARNING · N SUGGESTION» — only the severities this run
          actually produced, so an all-clean run shows nothing here. */}
      {candidates.length > 0 && (
        <div style={s.countsRow} aria-label={t("panel.severityCounts")}>
          {SEVERITIES.filter(({ key }) => counts[key] > 0).map(({ key, labelKey }, i) => {
            const sev = SEV[key];
            const I = Icon[sev.icon];
            return (
              <React.Fragment key={key}>
                {i > 0 && <span style={s.countDot}>·</span>}
                <span style={s.countPill(sev.c)}>
                  <I size={13} />
                  {t("panel.severityCount", { count: counts[key], severity: t(`severity.${labelKey}`) })}
                </span>
              </React.Fragment>
            );
          })}
        </div>
      )}

      <div style={s.toolbar}>
        {/* Single-select: clicking the active one clears it. Pure local state —
            no refetch, no model call. */}
        {SEVERITIES.map(({ key, labelKey }) => (
          <Chip
            key={key}
            icon={SEV[key].icon}
            color={SEV[key].c}
            count={counts[key]}
            active={severity === key}
            onClick={() => setSeverity((cur) => (cur === key ? null : key))}
          >
            {t(`severity.${labelKey}`)}
          </Chip>
        ))}
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
