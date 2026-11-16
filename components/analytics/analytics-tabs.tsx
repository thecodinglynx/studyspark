"use client";

import { Fragment, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface AnalyticsTab {
  id: string;
  label: string;
  /** Smaller text under the label, such as the group's name. */
  hint?: string;
  panel: ReactNode;
}

const tabId = (id: string) => `analytics-tab-${id}`;
const panelId = (id: string) => `analytics-panel-${id}`;

/**
 * Tabs for the analytics page. Every panel stays in the page and the others
 * are only hidden. A panel's contents are mounted again each time its tab is
 * opened: a chart drawn while its panel was hidden has no size and stays blank.
 */
export function AnalyticsTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: AnalyticsTab[];
  active: string;
  onChange: (id: string) => void;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === active);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;

    event.preventDefault();
    onChange(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  }

  return (
    <div className="flex flex-col gap-8">
      <div
        role="tablist"
        aria-label="Analytics view"
        onKeyDown={handleKeyDown}
        className="flex gap-2 border-b border-white/10"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                refs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-selected={selected}
              aria-controls={panelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={`-mb-px flex flex-col items-start border-b-2 px-4 py-3 text-left transition ${
                selected
                  ? "border-blue-400 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="text-sm font-semibold">{tab.label}</span>
              {tab.hint && (
                <span className="max-w-[10rem] truncate text-xs text-slate-400 sm:max-w-[16rem]">
                  {tab.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={panelId(tab.id)}
          aria-labelledby={tabId(tab.id)}
          hidden={tab.id !== active}
        >
          <Fragment key={tab.id === active ? "open" : "closed"}>
            {tab.panel}
          </Fragment>
        </div>
      ))}
    </div>
  );
}
