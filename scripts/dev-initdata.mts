import { signInitData } from "../lib/telegram/initData.ts";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN. Load .env.local or export it first.");
  process.exit(1);
}

const user = {
  id: Number(process.env.DEV_TELEGRAM_USER_ID ?? 424242),
  first_name: process.env.DEV_TELEGRAM_FIRST_NAME ?? "Creator Dev",
  username: process.env.DEV_TELEGRAM_USERNAME ?? "creator_dev",
  language_code: process.env.DEV_TELEGRAM_LANGUAGE ?? "es",
};

const initData = signInitData(
  {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `dev-${Date.now()}`,
    start_param: process.env.DEV_TELEGRAM_START_PARAM ?? "dev",
    user: JSON.stringify(user),
  },
  token,
);

console.log(`Authorization: tma ${initData}`);
