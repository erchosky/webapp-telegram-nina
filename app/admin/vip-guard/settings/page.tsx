import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin-session";
import { SectionHeader, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { groupTestAction, settingsAction } from "@/app/admin/actions";
import { dashboardTexts } from "@/lib/dashboard/texts";
import { READ_ONLY_DISABLE_CONFIRMATION } from "@/lib/admin/modes";

export const dynamic = "force-dynamic";

const yesNo = (value?: string) => value === "true" ? "sí" : value === "false" ? "no" : "—";
const groupReadinessText = (params: Record<string, string | undefined>) => {
  if (params.group_test === "ok") return "Grupo válido y listo";
  if (params.group_found === "false") return "El bot no puede acceder al grupo. Revisa TELEGRAM_GROUP_CHAT_ID.";
  if (params.bot_inside === "false") return "El bot no está en el grupo";
  if (params.bot_admin === "false") return "El bot no es administrador";
  if (params.can_create_invite === "false") return "Falta permiso para crear enlaces";
  if (params.can_restrict_members === "false") return "Falta permiso para expulsar usuarios";
  return "Prueba del grupo fallida";
};
const settingsError = (code?: string) => {
  if (code === "group_change_confirmation_required") return "Para cambiar el Telegram VIP escribe CAMBIAR GRUPO y guarda de nuevo.";
  if (code === "read_only_disable_confirmation_required") return `Para desactivar el modo solo lectura escribe ${READ_ONLY_DISABLE_CONFIRMATION} y guarda de nuevo.`;
  if (code === "read_only_password_required") return "Para cambiar el modo solo lectura reintroduce la contraseña admin actual.";
  if (code === "group_check_failed") return "No se guardó el grupo porque el bot no puede operar ahí. El bot debe ser administrador y tener permiso para crear enlaces y sacar miembros.";
  return null;
};
const settingsWarning = (code?: string) => {
  if (code === "group_check_failed_saved_texts") return "Textos y contacto guardados. La prueba de Telegram falló, así que no actives expulsión automática hasta corregir permisos del bot/grupo.";
  return null;
};

function telegramGroupEnvNotice(configuredChatId?: string | number | null) {
  const raw = process.env.TELEGRAM_GROUP_CHAT_ID?.trim();
  if (!raw) return "TELEGRAM_GROUP_CHAT_ID no está configurado. Si lo usas en Vercel, debe coincidir con el Chat ID del Telegram VIP activo.";
  if (configuredChatId && Number(raw) !== Number(configuredChatId)) {
    return "TELEGRAM_GROUP_CHAT_ID no coincide con el Telegram VIP guardado. Revisa la variable en Vercel o actualiza el Chat ID del grupo activo.";
  }
  return null;
}

function TextAreaField({ name, label, value, placeholder }: { name: string; label: string; value?: string | null; placeholder?: string }) {
  return (
    <label className="block text-sm">
      {label}
      <textarea name={name} defaultValue={value ?? ""} placeholder={placeholder} rows={3} className="mt-1 block w-full rounded-md border border-borderSoft bg-black/20 px-3 py-2 text-base outline-none focus:border-accent sm:text-sm"/>
    </label>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const { data } = await createAdminClient().from("vip_groups").select("*").limit(1).maybeSingle();
  const error = settingsError(params.settings_error);
  const warning = settingsWarning(params.settings_warning);
  const envNotice = telegramGroupEnvNotice(data?.telegram_chat_id);
  const contactNotice = data?.is_active && !data.admin_contact?.trim()
    ? "Contacto Nina no está configurado para el grupo activo. La MiniApp usará NEXT_PUBLIC_ADMIN_CONTACT si existe; si no, mostrará contacto no configurado."
    : null;
  return <><SectionHeader title={dashboardTexts.pages.settingsTitle} description={dashboardTexts.pages.settingsDescription}/>{error ? <div className="mb-5 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</div> : null}{warning ? <div className="mb-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">{warning}</div> : null}{envNotice ? <div className="mb-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">{envNotice}</div> : null}{contactNotice ? <div className="mb-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">{contactNotice}</div> : null}{data?.read_only_mode ? <div className="mb-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">Modo solo lectura activo: el dashboard permite consultar y cambiar configuración, pero las acciones operativas quedan bloqueadas.</div> : null}{data?.beta_mode ? <div className="mb-5 rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-accent">Modo beta activo: revisa dos veces acciones delicadas y prueba el grupo antes de activar la expulsión automática.</div> : null}<form action={settingsAction} className="grid gap-5 xl:grid-cols-[1fr_.8fr]"><div className="space-y-5"><Card><h2 className="font-semibold">Grupo Telegram</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block text-sm">Nombre interno del grupo<input name="name" required defaultValue={data?.name??"VIP Nina"} className="mt-1 block w-full rounded-md border border-borderSoft bg-black/20 px-3 py-2 text-base outline-none focus:border-accent sm:text-sm"/></label><label className="block text-sm">Telegram Chat ID<input name="telegram_chat_id" required defaultValue={data?.telegram_chat_id??""} placeholder="-1001234567890" className="mt-1 block w-full rounded-md border border-borderSoft bg-black/20 px-3 py-2 text-base outline-none focus:border-accent sm:text-sm"/></label></div><label className="mt-4 block text-sm">Confirmación para cambiar grupo<input name="group_change_confirmation" placeholder="Escribe CAMBIAR GRUPO si cambias el Chat ID" className="mt-1 block w-full rounded-md border border-borderSoft bg-black/20 px-3 py-2 text-base outline-none focus:border-accent sm:text-sm"/></label><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="flex min-h-11 items-center gap-2 rounded-md border border-borderSoft px-3 py-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={data?.is_active??true}/>Grupo activo</label><label className="flex min-h-11 items-center gap-2 rounded-md border border-borderSoft px-3 py-2 text-sm"><input type="checkbox" name="beta_mode" defaultChecked={data?.beta_mode??true}/>Modo beta</label><label className="flex min-h-11 items-center gap-2 rounded-md border border-borderSoft px-3 py-2 text-sm"><input type="checkbox" name="read_only_mode" defaultChecked={data?.read_only_mode??false}/>Modo solo lectura</label></div><label className="mt-4 block text-sm">Contraseña admin para cambiar solo lectura<input name="read_only_password" type="password" autoComplete="current-password" className="mt-1 block w-full rounded-md border border-borderSoft bg-black/20 px-3 py-2 text-base outline-none focus:border-accent sm:text-sm"/></label>{data?.read_only_mode ? <label className="mt-4 block text-sm">Confirmación para desactivar solo lectura<input name="read_only_confirmation" placeholder={`Escribe ${READ_ONLY_DISABLE_CONFIRMATION} si desmarcas el modo`} className="mt-1 block w-full rounded-md border border-borderSoft bg-black/20 px-3 py-2 text-base outline-none focus:border-accent sm:text-sm"/></label> : null}{params.group_test ? <div className={`mt-4 rounded-md border p-3 text-sm ${params.group_test === "ok" ? "border-success/30 bg-success/10" : "border-danger/30 bg-danger/10"}`}><h2 className="font-semibold">{groupReadinessText(params)}</h2><dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2"><div>Grupo encontrado: {yesNo(params.group_found)}</div><div>Nombre del grupo: {params.chat_title || "—"}</div><div>Bot dentro: {yesNo(params.bot_inside)}</div><div>Bot admin: {yesNo(params.bot_admin)}</div><div>Puede crear enlaces: {yesNo(params.can_create_invite)}</div><div>Puede expulsar: {yesNo(params.can_restrict_members)}</div></dl>{params.group_error ? <p className="mt-2 text-xs text-danger">{params.group_error}</p> : null}</div> : null}</Card><Card><h2 className="font-semibold">Textos y contacto</h2><p className="mt-1 text-sm text-muted">Estos son los textos que verá el usuario. Puedes cambiarlos sin tocar código.</p><div className="mt-4 grid gap-4"><label className="block text-sm">Nombre público del grupo<input name="public_name" defaultValue={data?.public_name??""} placeholder="Ej. Archivo VIP de Nina" className="mt-1 block w-full rounded-md border border-borderSoft bg-black/20 px-3 py-2 text-base outline-none focus:border-accent sm:text-sm"/></label><TextAreaField name="admin_contact" label="Contacto Nina" value={data?.admin_contact} placeholder="@DominaNinaMad, WhatsApp, email o contacto privado"/><TextAreaField name="payment_instructions" label="Instrucciones de pago" value={data?.payment_instructions} placeholder="Ej. Para validar tu acceso, envía el justificante por el canal acordado."/><TextAreaField name="welcome_text" label="Texto corto de bienvenida" value={data?.welcome_text} placeholder="Ya estás registrado en mi sistema VIP."/><TextAreaField name="renewal_text" label="Texto de renovación" value={data?.renewal_text} placeholder="Para renovar y seguir dentro de mi archivo VIP, contacta conmigo y confirma el pago."/><TextAreaField name="support_text" label="Texto de soporte" value={data?.support_text} placeholder="Si tienes cualquier problema, escribe a Nina."/></div></Card><Card className="border-amber-400/30 bg-amber-400/10"><label className="flex items-start gap-3 text-sm"><input type="checkbox" name="automatic_expulsion_enabled" defaultChecked={data?.automatic_expulsion_enabled??false} className="mt-1"/><span><strong>Expulsión automática activa</strong><span className="mt-1 block text-xs text-muted">Actívalo solo cuando ya tengas revisados a los miembros actuales. Mientras esté apagado, el sistema avisa y registra caducidades, pero no saca a nadie.</span><span className="mt-2 block text-xs font-semibold text-amber-200">No activar expulsión automática hasta terminar pruebas y migración.</span><span className="mt-2 block text-xs font-semibold text-amber-200">Confirmación fuerte: no se permite activar si la prueba de grupo falla.</span></span></label></Card><div className="flex flex-col gap-2 sm:flex-row"><Button className="w-full sm:w-auto">Guardar configuración</Button><Button formAction={groupTestAction} variant="secondary" className="w-full sm:w-auto">Probar bot y grupo</Button></div></div><aside className="space-y-5"><Card><h2 className="font-semibold">Permisos necesarios</h2><p className="mt-2 text-sm text-muted">Añade el bot como administrador del Telegram VIP y permite:</p><ul className="mt-3 list-disc space-y-2 pl-5 text-sm"><li>Crear enlaces de invitación</li><li>Restringir y sacar miembros</li></ul><p className="mt-4 text-sm">Grupo: <span className={data?"text-success":"text-amber-300"}>{data?"Configurado":"Pendiente"}</span></p><p className="mt-2 text-sm">Expulsión automática: <span className={data?.automatic_expulsion_enabled?"text-success":"text-amber-300"}>{data?.automatic_expulsion_enabled?"Activa":"Desactivada"}</span></p></Card><Card><h2 className="font-semibold">Login futuro</h2><p className="mt-2 text-sm text-muted">Fase futura recomendada: login con Google/OAuth y lista de emails permitidos para no depender de una contraseña compartida.</p></Card></aside></form></>;
}
