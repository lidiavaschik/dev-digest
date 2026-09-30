import type { DiffLine } from "../../helpers";

export const MODAL_WIDTH = 820;
export const DIFF_PREFIX: Record<DiffLine["kind"], string> = { add: "+", del: "-", same: " " };
