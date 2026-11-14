"use client";

import { useState } from "react";
import { CreditCard, Link2, ShieldCheck } from "lucide-react";
import type { MeDTO } from "@/lib/api/dto";
import { Button } from "@/components/ui/Button";
import { StatusScreen } from "@/components/screens/StatusScreen";
import { RenewScreen } from "@/components/screens/RenewScreen";
import { InviteScreen } from "@/components/screens/InviteScreen";
import { cn } from "@/lib/client/cn";

type AccessSection = "status" | "renew" | "invite";

const sections: { id: AccessSection; label: string; icon: React.ReactNode }[] = [
  { id: "status", label: "Estado", icon: <ShieldCheck className="h-4 w-4" /> },
  { id: "renew", label: "Entrar / renovar", icon: <CreditCard className="h-4 w-4" /> },
  { id: "invite", label: "Enlace", icon: <Link2 className="h-4 w-4" /> },
];

export function AccessScreen({
  me,
  onHome,
  onContact,
  onRequested,
}: {
  me: MeDTO;
  onHome: () => void;
  onContact: () => void;
  onRequested: () => void;
}) {
  const [section, setSection] = useState<AccessSection>("status");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1 rounded-card bg-tg-secondaryBg p-1">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            aria-pressed={section === item.id}
            aria-label={item.label}
            className={cn(
              "flex min-h-11 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold transition",
              section === item.id
                ? "bg-tg-bg text-tg-button shadow-sm"
                : "text-tg-hint",
            )}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {section === "status" && (
        <StatusScreen
          me={me}
          onNavigate={(target) => {
            if (target === "home") onHome();
            else setSection(target);
          }}
        />
      )}

      {section === "renew" && <RenewScreen me={me} onRequested={onRequested} />}

      {section === "invite" && (
        <InviteScreen
          me={me}
          onNavigate={(target) => {
            if (target === "renew") setSection("renew");
            else if (target === "help") onContact();
            else onHome();
          }}
        />
      )}
    </div>
  );
}
