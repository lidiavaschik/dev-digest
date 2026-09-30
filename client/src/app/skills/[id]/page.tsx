/* /skills/:id — Skills Lab master-detail. Tab state lives in ?tab= (config default). */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { SkillTab } from "../constants";
import { toSkillTab } from "../helpers";
import { SkillDetailView } from "./_components/SkillDetailView";

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const tab = toSkillTab(search.get("tab"));
  const setTab = (next: SkillTab) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };
  return <SkillDetailView id={id} tab={tab} onTab={setTab} />;
}
