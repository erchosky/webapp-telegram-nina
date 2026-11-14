import { TelegramProvider } from "@/components/TelegramProvider";
import { AppShell } from "@/components/AppShell";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default function DevPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <TelegramProvider devMock>
      <AppShell devSandbox />
    </TelegramProvider>
  );
}
