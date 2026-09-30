/* VersionDiffModal — an old version vs the current skill: changed metadata + line diff of the body. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { diffLines, metaChanges } from "../../helpers";
import { DIFF_PREFIX, MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function VersionDiffModal({
  version,
  skill,
  onClose,
}: {
  version: SkillVersion;
  skill: Skill;
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  const lines = React.useMemo(() => diffLines(version.body, skill.body), [version.body, skill.body]);
  const meta = metaChanges(version, skill);
  const bodyChanged = lines.some((l) => l.kind !== "same");

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("versions.diffTitle", { version: version.version, current: skill.version })}
      subtitle={t("versions.diffSubtitle", { version: version.version })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("versions.close")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {meta.length > 0 && (
          <ul style={s.meta}>
            {meta.map((c) => (
              <li key={c.field} style={s.metaItem}>
                {t("versions.fieldChanged", { field: t(`form.${c.field}`), from: c.from, to: c.to })}
              </li>
            ))}
          </ul>
        )}
        {!bodyChanged && <div style={s.same}>{t("versions.noChanges")}</div>}
        <pre className="mono" style={s.diff} aria-label="diff">
          {lines.map((l, i) => (
            <div key={i} style={s.line(l.kind)} data-kind={l.kind}>
              <span style={s.prefix}>{DIFF_PREFIX[l.kind]}</span>
              {l.text || " "}
            </div>
          ))}
        </pre>
      </div>
    </Modal>
  );
}
