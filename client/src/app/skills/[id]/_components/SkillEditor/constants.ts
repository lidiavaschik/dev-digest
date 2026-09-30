import type { IconName } from "@devdigest/ui";
import type { SkillTab } from "../../../constants";

/** Editor tabs in display order; labels resolve under skills.tabs.* */
export const TABS: readonly { key: SkillTab; icon: IconName }[] = [
  { key: "config", icon: "Settings" },
  { key: "context", icon: "Layers" },
  { key: "preview", icon: "Eye" },
  { key: "evals", icon: "FlaskConical" },
  { key: "stats", icon: "BarChart" },
  { key: "versions", icon: "History" },
];
