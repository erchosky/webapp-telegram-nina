import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationFiles = [
  "20260626000001_core_schema.sql",
  "20260626000002_payment_intents.sql",
  "20260626000003_runtime_hardening.sql",
  "20260626000004_webapp_marketplace.sql",
  "20260626000005_seed_or_config.sql",
  "20260710000006_execution_leases.sql",
  "20260711000007_marketplace_functional_integrity.sql",
  "20260711000008_admin_media_usability.sql",
];
const migrationsDir = join(process.cwd(), "supabase", "migrations");

function splitTopLevel(body: string) {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      parts.push(body.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(body.slice(start));
  return parts;
}

function matchingParen(sql: string, openIndex: number) {
  let depth = 0;
  for (let index = openIndex; index < sql.length; index++) {
    const char = sql[index];
    if (char === "(") depth++;
    if (char === ")") {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function tableColumns(sql: string) {
  const tables: Array<{ table: string; columns: string[] }> = [];
  const regex = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_]+)\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(sql))) {
    const openIndex = regex.lastIndex - 1;
    const closeIndex = matchingParen(sql, openIndex);
    expect(closeIndex, `No se pudo cerrar create table public.${match[1]}`).toBeGreaterThan(openIndex);
    const body = sql.slice(openIndex + 1, closeIndex);
    const columns = splitTopLevel(body)
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !/^(constraint|primary|unique|foreign|check)\b/i.test(part))
      .map((part) => part.match(/^"?([a-z_][a-z0-9_]*)"?\b/i)?.[1])
      .filter((column): column is string => Boolean(column));
    tables.push({ table: match[1], columns });
  }
  return tables;
}

describe("Supabase migrations", () => {
  const allSql = () => migrationFiles.map((file) => readFileSync(join(migrationsDir, file), "utf8")).join("\n");

  it("mantiene una lista ordenada de migraciones SQL", () => {
    const actual = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    expect(actual).toEqual(migrationFiles);
  });

  it("no definen columnas duplicadas dentro de una misma tabla", () => {
    for (const file of migrationFiles) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      for (const table of tableColumns(sql)) {
        const repeated = table.columns.filter((column, index) => table.columns.indexOf(column) !== index);
        expect(repeated, `${file}: public.${table.table} tiene columnas duplicadas`).toEqual([]);
      }
    }
  });

  it("mantiene system_jobs.last_finished_at una sola vez", () => {
    const sql = readFileSync(join(migrationsDir, "20260626000001_core_schema.sql"), "utf8");
    const systemJobs = tableColumns(sql).find((table) => table.table === "system_jobs");
    expect(systemJobs?.columns.filter((column) => column === "last_finished_at")).toHaveLength(1);
  });

  it("mantiene grant de check_rate_limit y una sola primary image por item", () => {
    const hardening = readFileSync(join(migrationsDir, "20260626000003_runtime_hardening.sql"), "utf8");
    const marketplace = readFileSync(join(migrationsDir, "20260626000004_webapp_marketplace.sql"), "utf8");

    expect(hardening).toMatch(/create\s+or\s+replace\s+function\s+public\.check_rate_limit\(\s*p_key\s+text,\s*p_limit\s+integer,\s*p_window_ms\s+integer\s*\)/i);
    expect(hardening).toMatch(/security\s+definer/i);
    expect(hardening).toMatch(/set\s+search_path\s*=\s*public/i);
    expect(hardening).toMatch(/revoke\s+all\s+on\s+function\s+public\.check_rate_limit\(text,\s*integer,\s*integer\)\s+from\s+public/i);
    expect(hardening).toMatch(/grant\s+execute\s+on\s+function\s+public\.check_rate_limit\(text,\s*integer,\s*integer\)\s+to\s+service_role/i);
    expect(hardening).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.processed_telegram_updates/i);
    expect(marketplace).toMatch(/create\s+unique\s+index\s+if\s+not\s+exists\s+marketplace_item_images_one_primary_per_item_idx/i);
    expect(marketplace).toMatch(/where\s+is_primary/i);
  });

  it("toda tabla public creada queda con RLS, revoke anon/authenticated y grant service_role", () => {
    const sql = allSql();
    const tables = tableColumns(sql).map(({ table }) => table);

    for (const table of tables) {
      expect(sql, `Falta RLS en public.${table}`).toMatch(new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"));
      expect(sql, `Falta revoke anon/authenticated en public.${table}`).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+from\\s+anon\\s*,\\s*authenticated`, "i"));
      expect(sql, `Falta grant service_role en public.${table}`).toMatch(new RegExp(`grant\\s+select\\s*,\\s*insert\\s*,\\s*update\\s*,\\s*delete\\s+on\\s+table\\s+public\\.${table}\\s+to\\s+service_role`, "i"));
    }
  });

  it("no define policies duplicadas", () => {
    const sql = allSql();
    const policies = Array.from(sql.matchAll(/create\s+policy\s+"?([^"\s]+)"?\s+on\s+public\.([a-z_]+)/gi))
      .map((match) => `${match[2]}.${match[1]}`);
    const duplicated = policies.filter((policy, index) => policies.indexOf(policy) !== index);

    expect(duplicated).toEqual([]);
  });

  it("no define triggers duplicados en la misma tabla", () => {
    const sql = allSql();
    const triggers = Array.from(sql.matchAll(/create\s+trigger\s+([a-z_][a-z0-9_]*)\s+before\s+update\s+on\s+public\.([a-z_][a-z0-9_]*)/gi))
      .map((match) => `${match[2]}.${match[1]}`);
    const duplicated = triggers.filter((trigger, index) => triggers.indexOf(trigger) !== index);

    expect(duplicated).toEqual([]);
  });

  it("no define funciones public duplicadas fuera de create or replace", () => {
    const sql = allSql();
    const functions = Array.from(sql.matchAll(/create\s+(?!or\s+replace)(?:function|procedure)\s+public\.([a-z_][a-z0-9_]*)\s*\(/gi))
      .map((match) => match[1]);
    const duplicated = functions.filter((fn, index) => functions.indexOf(fn) !== index);

    expect(duplicated).toEqual([]);
  });

  it("considera activa una suscripción active sin ends_at en admin_list_users", () => {
    const install = readFileSync(join(migrationsDir, "20260626000001_core_schema.sql"), "utf8");

    expect(install).toMatch(/when\s+s\.status\s*=\s*'active'\s+and\s+\(s\.ends_at\s+is\s+null\s+or\s+s\.ends_at\s+>\s+p_now\)\s+then\s+'active'/i);
    expect(install).toMatch(/when\s+s\.status\s*=\s*'active'\s+and\s+s\.ends_at\s+is\s+not\s+null\s+and\s+s\.ends_at\s+<=\s+p_now\s+then\s+'expired'/i);
    expect(install).not.toMatch(/s\.ends_at\s+is\s+null\s+or\s+s\.ends_at\s+<=\s+p_now\)\s+then\s+'expired'/i);
  });

  it("admin_list_users selecciona la suscripción efectiva, no solo la última creada", () => {
    const install = readFileSync(join(migrationsDir, "20260626000001_core_schema.sql"), "utf8");

    expect(install).toMatch(/order\s+by\s+case\s+when\s+s\.status\s*=\s*'active'\s+and\s+\(s\.ends_at\s+is\s+null\s+or\s+s\.ends_at\s+>\s+p_now\)\s+then\s+0/is);
    expect(install).toMatch(/when\s+s\.status\s*=\s*'needs_manual_review'\s+then\s+1/is);
    expect(install).toMatch(/when\s+s\.status\s*=\s*'pending'\s+then\s+2/is);
    expect(install).toMatch(/when\s+s\.status\s*=\s*'cancelled'\s+then\s+4/is);
    expect(install).not.toMatch(/where\s+s\.telegram_user_id\s*=\s*u\.id\s+order\s+by\s+s\.created_at\s+desc\s+limit\s+1/is);
  });
});
