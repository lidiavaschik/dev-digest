/* SkillsTab — every workspace skill, checkbox = enabled for THIS agent, drag
   (or Alt+↑/↓ on the handle) to reorder. Row order = order in the assembled
   prompt. Each change is saved immediately (PUT /agents/:id/skills). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent, AgentSkill, Skill } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { TYPE_META } from "../../../../../../../lib/skill-type-meta";
import {
  buildRows,
  countEnabled,
  filterRows,
  moveItem,
  seedKey,
  toItems,
  type SkillRow,
} from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const linked = useAgentSkills(agent.id);
  const workspace = useSkills();
  // The mutation lives HERE, not in the keyed editor below: a successful save
  // writes the new list into the cache, which changes the editor's key and
  // remounts it — state kept in the editor would be lost mid-flight.
  const setSkills = useSetAgentSkills();

  if (linked.isError || workspace.isError) {
    return (
      <ErrorState
        title={t("skills.loadError")}
        onRetry={() => {
          linked.refetch();
          workspace.refetch();
        }}
      />
    );
  }
  if (!linked.data || !workspace.data) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={220} />
        <div style={{ height: 16 }} />
        <Skeleton height={220} />
      </div>
    );
  }

  return (
    // key = identity of the saved state: after a save (or an external change)
    // the editor remounts and reseeds its rows — no syncing Effect.
    <SkillsEditor
      key={seedKey(linked.data, workspace.data)}
      linked={linked.data}
      all={workspace.data}
      saving={setSkills.isPending}
      onCommit={(rows, onError) =>
        setSkills.mutate({ agentId: agent.id, items: toItems(rows) }, { onError })
      }
    />
  );
}

function SkillsEditor({
  linked,
  all,
  saving,
  onCommit,
}: {
  linked: AgentSkill[];
  all: Skill[];
  saving: boolean;
  onCommit: (rows: SkillRow[], onError: () => void) => void;
}) {
  const t = useTranslations("agents");
  const initial = React.useMemo(() => buildRows(linked, all), [linked, all]);
  const [rows, setRows] = React.useState<SkillRow[]>(initial);
  const [query, setQuery] = React.useState("");
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState<number | null>(null);

  const filtering = query.trim().length > 0;
  const visible = filterRows(rows, query);

  // Optimistic: show the change at once, persist it, roll back on failure
  // (the global mutation-error toast explains why).
  const commit = (next: SkillRow[]) => {
    const prev = rows;
    setRows(next);
    onCommit(next, () => setRows(prev));
  };

  const toggle = (index: number) =>
    commit(rows.map((r, i) => (i === index ? { ...r, enabled: !r.enabled } : r)));

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= rows.length) return;
    commit(moveItem(rows, from, to));
  };

  const endDrag = () => {
    setDragFrom(null);
    setDragOver(null);
  };

  if (all.length === 0) {
    return (
      <div style={s.wrap}>
        <Header t={t} enabled={0} total={0} saving={saving} query={query} onQuery={setQuery} />
        <div style={s.empty}>
          {t("skills.noWorkspaceSkills")}{" "}
          <Link href="/skills" style={s.link}>
            {t("skills.goToSkills")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <Header
        t={t}
        enabled={countEnabled(rows)}
        total={rows.length}
        saving={saving}
        query={query}
        onQuery={setQuery}
      />
      <p style={s.hint}>{filtering ? t("skills.filterHint") : t("skills.orderHint")}</p>

      {visible.length === 0 ? (
        <div style={s.empty}>{t("skills.noMatch")}</div>
      ) : (
        <ol style={s.list} aria-label={t("skills.listLabel")}>
          {visible.map(({ row, index }) => {
            const { skill } = row;
            const meta = TYPE_META[skill.type];
            const globallyOff = !skill.enabled;
            const canDrag = !filtering;
            return (
              <li
                key={skill.id}
                data-testid="agent-skill-row"
                draggable={canDrag}
                onDragStart={(e) => {
                  setDragFrom(index);
                  e.dataTransfer.effectAllowed = "move";
                  // Firefox won't start a drag without data.
                  e.dataTransfer.setData("text/plain", skill.id);
                }}
                onDragOver={(e) => {
                  if (dragFrom === null) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOver !== index) setDragOver(index);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom !== null) move(dragFrom, index);
                  endDrag();
                }}
                onDragEnd={endDrag}
                style={s.row({
                  checked: row.enabled,
                  dimmed: globallyOff,
                  dragging: dragFrom === index,
                  dropAbove: dragOver === index && dragFrom !== null && dragFrom > index,
                  dropBelow: dragOver === index && dragFrom !== null && dragFrom < index,
                })}
              >
                <button
                  type="button"
                  style={s.handle(canDrag)}
                  disabled={!canDrag}
                  aria-label={t("skills.reorder", { name: skill.name })}
                  title={canDrag ? t("skills.reorderHint") : t("skills.filterHint")}
                  onKeyDown={(e) => {
                    if (!e.altKey) return;
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      move(index, index - 1);
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      move(index, index + 1);
                    }
                  }}
                >
                  <Icon.Menu size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={row.enabled}
                  aria-label={t("skills.enableFor", { name: skill.name })}
                  onClick={() => toggle(index)}
                  style={s.checkbox(row.enabled)}
                >
                  {row.enabled && <Icon.Check size={12} style={{ color: "#fff" }} />}
                </button>
                <span
                  className="mono"
                  style={s.name}
                  title={skill.description || undefined}
                  onClick={() => toggle(index)}
                >
                  {skill.name}
                </span>
                {globallyOff && (
                  <span title={t("skills.disabledGloballyHint")}>
                    <Badge color="var(--warn)" icon="AlertTriangle" style={{ fontSize: 11 }}>
                      {t("skills.disabledGlobally")}
                    </Badge>
                  </span>
                )}
                <span style={s.type(meta.color, meta.bg)}>{skill.type}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Header({
  t,
  enabled,
  total,
  saving,
  query,
  onQuery,
}: {
  t: ReturnType<typeof useTranslations>;
  enabled: number;
  total: number;
  saving: boolean;
  query: string;
  onQuery: (q: string) => void;
}) {
  return (
    <div style={s.header}>
      <h2 style={s.h2}>{t("skills.title")}</h2>
      <span style={s.counter} className="tnum">
        {t("skills.enabledCount", { linked: enabled, total })}
      </span>
      {saving && <span style={s.saving}>{t("skills.saving")}</span>}
      <div style={s.filter}>
        <Icon.Search size={13} style={s.filterIcon} />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("skills.filterPlaceholder")}
          aria-label={t("skills.filterPlaceholder")}
          style={s.filterInput}
        />
      </div>
    </div>
  );
}
