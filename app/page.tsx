import { TelegramProvider } from "@/components/TelegramProvider";
import { AppShell } from "@/components/AppShell";

export default function Page() {
  return (
    <TelegramProvider>
      <AppShell />
    </TelegramProvider>
  );
}
