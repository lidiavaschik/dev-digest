/* ImportSkillDrawer — import a skill from a file, a URL or the community catalog. Each mode
   asks the server for a preview (nothing persisted); all three end in the same ImportPreview
   step, which saves the skill DISABLED after an explicit "I've read it". */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Drawer, Tabs } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { useCreateSkill } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { ApiError } from "../../../../lib/api";
import { skillHref } from "../../helpers";
import { IMPORT_MODES, IMPORT_MODE_ICON, type ImportMode } from "../../constants";
import type { SkillMeta } from "../SkillMetaFields";
import { FilePicker } from "./_components/FilePicker";
import { UrlPicker } from "./_components/UrlPicker";
import { CommunityBrowser } from "./_components/CommunityBrowser";
import { ImportPreview } from "./_components/ImportPreview";
import { DRAWER_WIDTH } from "./constants";
import { importSource, initialImportType, previewSourceUrl } from "./helpers";
import type { ImportOrigin, OnPreview } from "./types";
import { s } from "./styles";

interface Parsed {
  preview: SkillImportPreview;
  origin: ImportOrigin;
}

export function ImportSkillDrawer({ mode: initialMode = "file", onClose }: { mode?: ImportMode; onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkill();

  const [mode, setMode] = React.useState<ImportMode>(initialMode);
  const [parsed, setParsed] = React.useState<Parsed | null>(null);
  const [meta, setMeta] = React.useState<SkillMeta>({ name: "", description: "", type: "custom" });
  const [ack, setAck] = React.useState(false);
  const [nameTaken, setNameTaken] = React.useState(false);

  const onPreview: OnPreview = (preview, origin) => {
    setParsed({ preview, origin });
    setMeta({ name: preview.name, description: preview.description, type: initialImportType(preview, origin) });
    setAck(false);
    setNameTaken(false);
  };

  const back = () => {
    setParsed(null);
    setAck(false);
    setNameTaken(false);
    create.reset();
  };

  const sourceUrl = parsed ? previewSourceUrl(parsed.preview, parsed.origin) : null;

  const versionMessage = ({ preview, origin }: Parsed): string => {
    switch (origin.kind) {
      case "file":
        return t("import.importedMessage", { filename: preview.filename });
      case "url":
        return t("import.importedFromUrl", { url: sourceUrl ?? origin.url });
      case "community":
        return t("import.importedFromCommunity", { repo: origin.entry.repo, name: origin.entry.name });
    }
  };

  const save = async () => {
    if (!parsed) return;
    setNameTaken(false);
    try {
      const skill = await create.mutateAsync({
        name: meta.name.trim(),
        description: meta.description,
        type: meta.type,
        body: parsed.preview.body,
        source: importSource(parsed.origin),
        enabled: false,
        message: versionMessage(parsed),
      });
      toast.success(t("import.savedToast", { name: skill.name }));
      onClose();
      router.push(skillHref(skill.id));
    } catch (e) {
      // Other failures are surfaced by the global mutation error toast.
      if (e instanceof ApiError && e.status === 409) setNameTaken(true);
    }
  };

  const canSave = !!parsed && ack && meta.name.trim() !== "" && !create.isPending;
  const subtitle = !parsed
    ? t("import.subtitle")
    : sourceUrl
      ? t("import.fromSource", { url: sourceUrl })
      : t("import.fromFile", { filename: parsed.preview.filename });
  const tabs = IMPORT_MODES.map((m) => ({ key: m, label: t(`drawer.tabs.${m}`), icon: IMPORT_MODE_ICON[m] }));

  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={t("import.title")}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {parsed && (
            <Button kind="ghost" icon="ChevronLeft" onClick={back}>
              {parsed.origin.kind === "file" ? t("import.chooseAnother") : t("import.back")}
            </Button>
          )}
          <div style={s.spacer} />
          <Button kind="ghost" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          {parsed && (
            <Button kind="primary" icon="Check" onClick={save} disabled={!canSave}>
              {create.isPending ? t("import.saving") : t("import.save")}
            </Button>
          )}
        </div>
      }
    >
      {parsed ? (
        <ImportPreview
          preview={parsed.preview}
          sourceUrl={sourceUrl}
          meta={meta}
          onMetaChange={(next) => {
            if (next.name !== meta.name) setNameTaken(false);
            setMeta(next);
          }}
          nameError={nameTaken ? t("form.nameTaken") : null}
          ack={ack}
          onAck={setAck}
        />
      ) : (
        <>
          <div style={s.tabs}>
            <Tabs tabs={tabs} value={mode} onChange={(k) => setMode(k as ImportMode)} pad="0" />
          </div>
          {mode === "file" && <FilePicker onPreview={onPreview} />}
          {mode === "url" && <UrlPicker onPreview={onPreview} />}
          {mode === "community" && <CommunityBrowser onPreview={onPreview} />}
        </>
      )}
    </Drawer>
  );
}
