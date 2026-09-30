# Skills for the manual import demo

Files here are **not** seeded. They exist to demo the Skills page's
"Import from file" flow (L02):

- `response-shape-compat/` — a skill folder in the common `SKILL.md` layout
  (frontmatter `name` / `description` / `type` + markdown body).
- `response-shape-compat.zip` — the same folder zipped, ready to upload.

## What the demo shows
1. Skills → Add Skill → Import from file → pick `response-shape-compat.zip`.
2. The preview shows the parsed name/description/type/body. `scripts/check.sh`
   is listed as **ignored — not stored, never executed**: DevDigest keeps only
   the `SKILL.md` text. The script is a harmless decoy that only prints a
   warning; it exists to prove nothing in an archive is run.
3. The skill is saved **disabled** ("needs vetting") — a third-party skill is
   third-party instructions inside your agent's prompt, so read it first.
4. Link it to **API Contract Reviewer** (Agents → Skills tab), enable it, and
   re-run the review on a PR that changes a response shape.

Rebuild the zip after editing the folder:

```sh
cd docs/skills && rm -f response-shape-compat.zip && zip -r response-shape-compat.zip response-shape-compat
```
