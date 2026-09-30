/* BodyEditor — mono skill-body editor: file header (name.md · unsaved · tokens) +
   line-number gutter kept in sync with the textarea's scroll. Lines don't wrap,
   so each gutter row maps to exactly one text line. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { lineNumbers } from "./helpers";
import { s } from "./styles";

export function BodyEditor({
  filename,
  value,
  onChange,
  dirty,
  tokens,
  placeholder,
}: {
  filename: string;
  value: string;
  onChange: (v: string) => void;
  dirty: boolean;
  tokens: number;
  placeholder?: string;
}) {
  const t = useTranslations("skills");
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const lines = lineNumbers(value);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filename}>
          {filename}
        </span>
        {dirty && (
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {t("config.unsaved")}
          </Badge>
        )}
        <span className="tnum" style={s.tokens}>
          {t("config.tokens", { count: tokens })}
        </span>
      </div>
      <div style={s.editor}>
        <div ref={gutterRef} style={s.gutter} aria-hidden>
          {lines.map((n) => (
            <div key={n} style={s.lineNo}>
              {n}
            </div>
          ))}
        </div>
        <textarea
          className="mono"
          aria-label={t("config.body")}
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          wrap="off"
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          style={s.textarea}
        />
      </div>
    </div>
  );
}
