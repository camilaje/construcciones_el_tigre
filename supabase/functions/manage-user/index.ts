import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

function syntheticEmail(): string {
  return `${Date.now()}.${Math.random().toString(36).slice(2, 8)}@app.internal`;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Verificar que el llamador está autenticado
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'No autorizado' }, 401);

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !user) return json({ error: 'No autorizado' }, 401);

  // Obtener el rol del llamador desde perfiles_usuario (fuente de verdad)
  const { data: callerProfile } = await supabaseAdmin
    .from('perfiles_usuario')
    .select('role')
    .eq('user_id', user.id)
    .single();

  const callerRole: string | null = callerProfile?.role ?? null;
  if (!callerRole || !['admin', 'super_admin'].includes(callerRole)) {
    return json({ error: 'Acceso denegado: se requiere rol admin o super_admin' }, 403);
  }

  const body = await req.json();
  const { action, userId, username, password, role } = body;

  // ── CREATE ────────────────────────────────────────────────
  if (action === 'create') {
    if (!username || !password) return json({ error: 'username y password son obligatorios' }, 400);

    const targetRole: string = role ?? 'worker';

    if (targetRole === 'super_admin') {
      return json({ error: 'No se pueden crear cuentas super_admin desde la app' }, 403);
    }
    if (callerRole === 'admin' && targetRole !== 'worker') {
      return json({ error: 'Los administradores solo pueden crear cuentas de trabajador' }, 403);
    }

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: syntheticEmail(),
      password,
      email_confirm: true,
      user_metadata: { full_name: username }
    });

    if (createError) return json({ error: createError.message }, 400);

    const { error: profileError } = await supabaseAdmin
      .from('perfiles_usuario')
      .insert({
        user_id: newUser.user.id,
        role: targetRole,
        display_name: username,
        username
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return json({ error: profileError.message }, 500);
    }

    return json({ data: { user_id: newUser.user.id } });
  }

  // ── DELETE ────────────────────────────────────────────────
  if (action === 'delete') {
    if (!userId) return json({ error: 'userId es obligatorio' }, 400);
    if (userId === user.id) return json({ error: 'No puedes eliminar tu propia cuenta' }, 400);

    const { data: targetProfile } = await supabaseAdmin
      .from('perfiles_usuario')
      .select('role')
      .eq('user_id', userId)
      .single();

    const targetRole: string | null = targetProfile?.role ?? null;

    if (targetRole === 'super_admin') {
      return json({ error: 'No se pueden eliminar cuentas super_admin desde la app' }, 403);
    }
    if (callerRole === 'admin' && targetRole !== 'worker') {
      return json({ error: 'Los administradores solo pueden eliminar cuentas de trabajador' }, 403);
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) return json({ error: deleteError.message }, 500);

    return json({ data: { deleted: true } });
  }

  return json({ error: 'Acción desconocida' }, 400);
});
