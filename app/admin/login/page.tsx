import { redirect } from "next/navigation";
import { getAdminSession, isAdminConfigured } from "@/lib/admin-auth";
import { LoginForm } from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (!isAdminConfigured()) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-[420px] rounded-xl border border-line bg-surface p-5 sm:p-7">
          <h1 className="mb-2 font-display text-[22px] font-bold">Panel sin configurar</h1>
          <p className="text-[13.5px] leading-relaxed text-ink-3">
            Faltan <code className="font-mono text-ink-2">ADMIN_PASSWORD_HASH</code> o{" "}
            <code className="font-mono text-ink-2">ADMIN_SESSION_SECRET</code>. Generalas
            con <code className="font-mono text-ink-2">npm run admin:hash -- &quot;tu clave&quot;</code> y
            cargalas en el entorno.
          </p>
        </div>
      </main>
    );
  }

  // Ya logueado: no tiene sentido mostrarle el formulario de nuevo.
  if (await getAdminSession()) redirect("/admin");

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <LoginForm />
    </main>
  );
}
