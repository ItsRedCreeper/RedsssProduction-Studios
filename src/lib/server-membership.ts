import { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

/**
 * Look up the server's default @everyone role.
 * Creation is owned by DB triggers (private.ensure_default_member_role);
 * the client must not insert roles or member_roles (RLS blocks joiners).
 */
export async function ensureServerDefaultRole(
  supabase: Supabase,
  serverId: string,
) {
  const { data: existing, error } = await supabase
    .from("roles")
    .select("*")
    .eq("server_id", serverId)
    .eq("is_default", true)
    .maybeSingle();

  if (error) {
    return { role: null, error: error.message };
  }
  if (!existing) {
    return {
      role: null,
      error: "Server has no @everyone role yet.",
    };
  }
  return { role: existing, error: null as string | null };
}

/**
 * Best-effort verify that the DB AFTER INSERT trigger assigned the default role.
 * Never hard-fails on RLS-denied client inserts — assignment is trigger-owned.
 */
export async function assignDefaultRoleToMember(
  supabase: Supabase,
  serverId: string,
  userId: string,
) {
  const { role, error: roleError } = await ensureServerDefaultRole(
    supabase,
    serverId,
  );
  if (roleError || !role) {
    // Membership may still be valid; default role is trigger-owned.
    return { error: null as string | null, roleId: null as string | null };
  }

  const { data: assignment } = await supabase
    .from("member_roles")
    .select("role_id")
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .eq("role_id", role.id)
    .maybeSingle();

  return {
    error: null as string | null,
    roleId: assignment?.role_id ?? role.id,
  };
}

/**
 * Join a server. Membership insert alone is success — the private AFTER INSERT
 * trigger assigns the default Member role. Do not treat missing client-side
 * member_roles writes as join failures (RLS only allows owner / MANAGE_ROLES).
 */
export async function joinServerWithDefaultRole(
  supabase: Supabase,
  serverId: string,
  userId: string,
) {
  const { error: memberError } = await supabase.from("server_members").insert({
    server_id: serverId,
    user_id: userId,
  });

  const duplicate =
    !!memberError && /duplicate|unique|already/i.test(memberError.message);
  if (memberError && !duplicate) {
    return { error: memberError.message, alreadyMember: false };
  }

  // Optional verify; ignore failures — trigger owns default role assignment.
  await assignDefaultRoleToMember(supabase, serverId, userId);

  return { error: null as string | null, alreadyMember: duplicate };
}
