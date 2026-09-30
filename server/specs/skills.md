# Spec — Skills (перевикористовувані скіли агентів)

Статус: in progress · 2026-09-30 · пакети: server, client, reviewer-core (без змін інтерфейсу), e2e · урок L02

## 1. Мета

Скіл — це текстова інструкція в markdown: `name`, `description`, `type`, `body`. Інструментів і
виконуваного коду в ньому немає. Один скіл можна прив'язати до кількох агентів-рев'юерів.
Користувач створює, редагує, імпортує й версіонує скіли. В агенті скіли вмикаються
й вимикаються, а їхній порядок задає послідовність блоків у промпті.

## 2. Бізнес-правила

- **R1 — джерело правди — БД** (`skills`, `skill_versions`, `agent_skills`).
- **R2 — description = інтерфейс скіла.** Формулюється директивно: коли агент застосовує скіл і
  що він має робити. UI підказує це підписом до поля.
- **R3 — потрапляння в промпт**: скіл іде в промпт, лише якщо `skills.enabled AND agent_skills.enabled`.
  Порядок блоків визначає `agent_skills.order`. Кожен скіл рендериться окремим блоком `### <name>\n<body>`
  у секції `## Skills / rules`. Скіли — це інструкції, тому їх **не** загортають в `<untrusted>`;
  замість цього застосовується `neutralizeDelimiters` (див. reviewer-core/INSIGHTS.md).
- **R4 — версії**: зміна будь-якого з name / description / type / body дає `version+1` і snapshot
  **усіх** полів у `skill_versions` з опційним `message` («What changed?»). Сама лише зміна `enabled`
  версії не створює.
- **R5 — restore vN** створює **нову** версію з вмістом vN. Історія незмінна.
- **R6 — версія агента** піднімається при будь-якій зміні набору скілів, порядку чи per-agent
  `enabled`. Snapshot зберігає `{skill_id, skill_version, order, enabled}`.
- **R7 — імпорт** `.md` / `.zip` відбувається в два кроки: спершу preview (у БД нічого не пишеться),
  потім збереження після явного підтвердження.
  - Ядро скіла береться з `SKILL.md` (корінь або 1 рівень вкладеності) або з єдиного `.md`:
    frontmatter `name` / `description` / `type` + тіло.
  - Решта файлів архіву не зберігається й **ніколи не виконується**. Вони показуються в
    `ignored_files`, а для скриптів додається warning.
  - Zip розбирається в пам'яті (node:zlib). Є ліміти розміру й кількості записів; path traversal відкидається.
  - Імпортований скіл зберігається з `source='imported_file'`, `enabled=false`.
- **R8 — довіра**: чужий скіл — це чужі інструкції в промпті агента. У UI імпорту є банер довіри
  і обов'язковий чекбокс «прочитав». Картка показує «needs vetting», доки скіл не ввімкнуть.
- **R9 — tenancy**: усі запити обмежені workspace. Чужий або невідомий id дає 404.
- **R10 — траса**: `prompt_assembly.skills` містить блок скілів, `prompt_assembly.skills_tokens` —
  кількість доданих ним токенів (серверний tokenizer). У логах прогону є рядок `skills: N active (…)`.

- **R11 — імпорт з URL**: сервер сам завантажує файл, і діє захист від SSRF:
  - лише https, без credentials, лише порт 443;
  - адреси localhost, приватні, loopback, link-local і reserved (IPv4, IPv6 та mapped) відхиляються.
    Перевірка IP повторюється і в момент з'єднання (`node:https` + guarded lookup), бо інакше лишається
    вразливість до DNS rebinding;
  - щонайбільше 3 редиректи, кожен перевіряється заново; таймаут 10 с; ліміт 2 MB на потоці;
  - посилання GitHub `blob`/`tree` перетворюються на raw.
  Далі той самий парсер і preview, що й для файлу. Скіл зберігається з `source='imported_url'`, `enabled=false`.
- **R12 — community**: курований allowlist-каталог `modules/skills/community-catalog.ts`
  (anthropics/skills, obra/superpowers; кількість зірок — знімок). Скіл з каталогу імпортується через URL-флоу,
  тобто теж проходить preview і підтвердження, і зберігається з `source='community'`, `enabled=false`.

## 3. API

| Метод | Шлях | Відповідь |
|---|---|---|
| GET | `/skills` | `Skill[]` (+ `agent_count`, `tokens`) |
| GET | `/skills/:id` | `Skill` |
| POST | `/skills` | 201 `Skill`; 409 для дубля імені |
| PUT | `/skills/:id` | `Skill` (R4) |
| DELETE | `/skills/:id` | 204 |
| GET | `/skills/:id/versions` | `SkillVersion[]`, newest first |
| GET | `/skills/:id/versions/:version` | `SkillVersion` |
| POST | `/skills/:id/versions/:version/restore` | `Skill` (R5) |
| GET | `/skills/:id/usage` | `SkillUsage` |
| POST | `/skills/import/preview` | `{filename, content_base64}` → `SkillImportPreview` |
| POST | `/skills/import/preview-url` | `{url}` → `SkillImportPreview` (+`source_url`), R11 |
| GET | `/skills/community?q=&lang=` | `CommunitySkill[]` (курований каталог), R12 |
| GET | `/agents/:id/skills` | `AgentSkill[]` |
| PUT | `/agents/:id/skills` | `{items:[{skill_id, enabled}]}` → `AgentSkill[]` (R6) |

Імпорт приймає JSON із base64, а не multipart. Так не потрібна нова залежність
(`server/package.json` має skip-worktree).

## 4. UI

- «Add Skill ▾»: Import from file · Import from URL · Search community skills… · ─ · Create from scratch.
  Три перші пункти відкривають один drawer з режимами File / URL / Community і спільним кроком preview.
- `/skills/[id]?tab=` — master-detail за дизайном:
  - rail з картками: назва, тип, source, toggle, «N agents · — pull · — accept»;
  - кнопка «Add Skill ▾» з пунктами Create / Import from file.
- Вкладки:
  - **Config** — поля, body-редактор з лічильником токенів і бейджем `unsaved`, поле «What changed?».
  - **Preview** — рендер так, як його отримує агент.
  - **Versions** — історія з Diff і Restore.
  - **Stats** — «Used by N agents» + список агентів; метрики поки «—».
  - **Context**, **Evals** — заглушки для наступних уроків. «Run on evals» — disabled.
- Редактор агента → вкладка **Skills**: attach, detach, ↑↓ порядок, per-agent toggle, Save.

## 5. Seed і демо

- Агенти **Test Quality Reviewer** (скіли `untested-branches`, `missing-corner-cases`, `over-mocking`,
  `flaky-tests`) і **API Contract Reviewer** (`route-signature-breaking-change`).
- `docs/skills/response-shape-compat.zip` для ручного імпорту. Всередині `scripts/check.sh` —
  приманка, яка ніколи не виконується.

## 6. Контрольний експеримент

| Агент | PR | Без скілів | Зі скілами |
|---|---|---|---|
| Test Quality | тест лише на happy-path | пропуск | флаг непокритої гілки й межового випадку |
| API Contract | зміна сигнатури роуту | пропуск | breaking change |

Run Trace → Prompt assembly: видно блок Skills і `skills_tokens`; вимкненого скіла там немає.

## 7. Поза обсягом

Context-документи скіла, evals, метрики pull/accept/findings, живий пошук у GitHub для community-скілів.
