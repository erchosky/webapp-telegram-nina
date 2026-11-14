"use client";

import { useEffect, useState } from "react";
import { VISIBLE_DEV_SCENARIOS, type DevScenario } from "@/lib/dev/mockData";
import {
  getDevScenario,
  onDevScenarioChange,
  setDevScenario,
} from "@/lib/dev/mockTelegram";
import { useTelegram } from "@/components/TelegramProvider";

export function DevSandboxPanel({
  onScenarioChange,
}: {
  onScenarioChange: () => void;
}) {
  const { t } = useTelegram();
  const [scenario, setScenario] = useState<DevScenario>("no_vip");

  useEffect(() => {
    setScenario(getDevScenario());
    return onDevScenarioChange((next) => {
      setScenario(next);
      onScenarioChange();
    });
  }, [onScenarioChange]);

  if (process.env.NODE_ENV !== "development") return null;

  return (
    <div className="sticky top-0 z-20 border-b border-black/10 bg-tg-bg/95 px-4 py-2 backdrop-blur">
      <label className="flex items-center gap-2 text-xs font-semibold text-tg-hint">
        {t.dev.label}
        <select
          value={scenario}
          onChange={(event) => {
            setDevScenario(event.target.value as DevScenario);
          }}
          className="min-w-0 flex-1 rounded-md border border-black/10 bg-tg-secondaryBg px-2 py-1 text-sm font-medium text-tg-text"
        >
          {VISIBLE_DEV_SCENARIOS.map((item) => (
            <option key={item.id} value={item.id}>
              {t.dev.scenarioLabels[item.id] ?? item.id}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-xs text-tg-hint">{t.dev.simulated}</p>
    </div>
  );
}
