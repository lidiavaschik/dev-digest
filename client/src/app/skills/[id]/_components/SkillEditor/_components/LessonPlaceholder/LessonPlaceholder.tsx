/* LessonPlaceholder — panel for tabs whose feature lands in a later lesson (Context, Evals). */
import React from "react";
import { EmptyState, type IconName } from "@devdigest/ui";
import { s } from "./styles";

export function LessonPlaceholder({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <div style={s.panel}>
      <EmptyState icon={icon} title={title} body={body} />
    </div>
  );
}
