/* TypeIconTile — small colored icon square keyed by skill type (card + header). */
import React from "react";
import { Icon } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { TYPE_META } from "../../constants";
import { s } from "./styles";

export function TypeIconTile({ type, size = 28 }: { type: SkillType; size?: number }) {
  const meta = TYPE_META[type];
  const I = Icon[meta.icon];
  return (
    <div style={s.tile(size, meta.color, meta.bg)} aria-hidden>
      <I size={Math.round(size * 0.55)} />
    </div>
  );
}
