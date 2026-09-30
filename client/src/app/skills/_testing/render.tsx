/* Test-only helpers for the Skills Lab route: providers, fixtures and a routed fetch mock.
   Imported only from *.test.tsx files. */
import React from "react";
import { render, type RenderResult } from "@testing-library/react";
import { vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../messages/en/skills.json";
import { ToastProvider } from "../../../lib/toast";

export function makeSkill(o: Partial<Skill> = {}): Skill {
  return {
    id: "sk1",
    name: "untested-branches",
    description: "When new code adds a branch, flag it if no test covers it.",
    type: "rubric",
    source: "manual",
    body: "# Rule\nEvery new branch needs a test.",
    enabled: true,
    version: 3,
    evidence_files: null,
    tokens: 12,
    agent_count: 2,
    updated_at: "2026-09-29T10:00:00.000Z",
    ...o,
  };
}

export type ProvidersRenderResult = Omit<RenderResult, "rerender"> & {
  qc: QueryClient;
  rerender: (next: React.ReactElement) => void;
};

export function renderWithProviders(ui: React.ReactElement): ProvidersRenderResult {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrap = (node: React.ReactElement) => (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ToastProvider>{node}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const utils = render(wrap(ui));
  return { ...utils, qc, rerender: (next: React.ReactElement) => utils.rerender(wrap(next)) };
}

/** A handler returns plain data (→ 200 JSON) or a ready Response. */
type Handler = (body: unknown) => unknown;

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

export function apiErrorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status);
}

/**
 * Stub global fetch; routes by "METHOD /path". Unmatched calls reject loudly.
 * Returns the spy so tests can assert method + body of calls.
 */
export function mockFetch(handlers: Record<string, Handler>) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const key = `${(init?.method ?? "GET").toUpperCase()} ${url.pathname}`;
    const h = handlers[key];
    if (!h) throw new Error(`unmocked fetch: ${key}`);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const out = h(body);
    return out instanceof Response ? out : jsonResponse(out);
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** Parsed JSON bodies of every call to `METHOD /path`. */
export function callBodies(spy: ReturnType<typeof mockFetch>, method: string, path: string): unknown[] {
  return spy.mock.calls
    .filter(([input, init]) => (init?.method ?? "GET") === method && new URL(String(input)).pathname === path)
    .map(([, init]) => (typeof init?.body === "string" ? JSON.parse(init.body) : undefined));
}
