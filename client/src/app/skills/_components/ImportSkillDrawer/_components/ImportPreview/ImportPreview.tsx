/* ImportPreview — the confirm step every import mode (file / URL / community) ends in:
   trust banner, source link, editable meta, rendered/raw body, ignored files, warnings and
   the required "I've read it" checkbox. Controlled; the drawer owns save. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon, Markdown } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { SkillMetaFields, type SkillMeta } from "../../../SkillMetaFields";
import { isHttpUrl } from "../../helpers";
import { s } from "./styles";

export function ImportPreview({
  preview,
  sourceUrl,
  meta,
  onMetaChange,
  nameError,
  ack,
  onAck,
}: {
  preview: SkillImportPreview;
  /** Where the content was fetched from; null for uploads. */
  sourceUrl: string | null;
  meta: SkillMeta;
  onMetaChange: (next: SkillMeta) => void;
  nameError?: string | null;
  ack: boolean;
  onAck: (next: boolean) => void;
}) {
  const t = useTranslations("skills");
  const [raw, setRaw] = React.useState(false);

  return (
    <div>
      <div role="note" style={s.trust}>
        <Icon.AlertTriangle size={16} style={s.trustIcon} />
        <span>{t("import.trust")}</span>
      </div>
      {sourceUrl && (
        <div style={s.source}>
          <span style={s.sectionTitle}>{t("import.sourceTitle")}</span>
          {isHttpUrl(sourceUrl) ? (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mono" style={s.sourceLink} title={sourceUrl}>
              {sourceUrl}
            </a>
          ) : (
            <span className="mono" style={s.sourceLink} title={sourceUrl}>
              {sourceUrl}
            </span>
          )}
          <Icon.ExternalLink size={12} style={s.sourceIcon} />
        </div>
      )}
      <SkillMetaFields value={meta} onChange={onMetaChange} nameError={nameError} />
      <div style={s.bodyHeader}>
        <span style={s.sectionTitle}>{t("import.bodyTitle")}</span>
        <Button kind="tertiary" size="sm" icon={raw ? "Eye" : "Code"} onClick={() => setRaw((r) => !r)}>
          {raw ? t("import.viewRendered") : t("import.viewRaw")}
        </Button>
      </div>
      <div style={s.bodyCard}>
        {raw ? <pre className="mono" style={s.raw}>{preview.body}</pre> : <Markdown>{preview.body}</Markdown>}
      </div>
      {preview.ignored_files.length > 0 && (
        <section style={s.section}>
          <div style={s.sectionTitle}>{t("import.ignoredTitle")}</div>
          <ul style={s.list}>
            {preview.ignored_files.map((f) => (
              <li key={f} className="mono" style={s.ignored}>
                {f}
              </li>
            ))}
          </ul>
        </section>
      )}
      {preview.warnings.length > 0 && (
        <section style={s.section}>
          <div style={s.sectionTitle}>{t("import.warningsTitle")}</div>
          <ul style={s.list}>
            {preview.warnings.map((w) => (
              <li key={w} style={s.warning}>
                {w}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div style={s.ack}>
        <Checkbox checked={ack} onChange={onAck} label={t("import.ack")} />
      </div>
    </div>
  );
}
