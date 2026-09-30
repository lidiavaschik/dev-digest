import { SkillsIndexView } from "./_components/SkillsIndexView";

/* Route: /skills — redirects to the first skill, or shows the empty state.
   Thin route entry; the view lives under _components/SkillsIndexView. */
export default function SkillsPage() {
  return <SkillsIndexView />;
}
