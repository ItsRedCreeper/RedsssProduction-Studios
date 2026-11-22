import { createClient } from "@/lib/supabase/client";
import { DEFAULT_MEMBER_PERMISSIONS } from "@/lib/permissions";

type Supabase = ReturnType<typeof createClient>;

/**
 * Ensure the server has a Discord-style @everyone / Member default role.
 * Discord always has @everyone — servers cannot have zero base roles.
 */
export async function ensureServerDefaultRole(
  supabase: Supabase,
  serverId: string,
) {
  const { data: existing } = await supabase
    .from("roles")
    .select("*")
    .eq("server_id", serverId)
    .eq("is_default", true)
    .maybeSingle();
  if (existing) return { role: existing, error: null as string | null };

  const { data: created, error } = await supabase
    .from("roles")
    .insert({
      server_id: serverId,
      name: "Member",
      color: "#99aab5",
      position: 0,
      hoist: false,
      is_default: true,
      permissions: DEFAULT_MEMBER_PERMISSIONS,
    })
    .select("*")
    .single();

  if (error || !created) {
    return {
      role: null,
      error: error?.message ?? "Could not create default Member role.",
    };
  }
  return { role: created, error: null as string | null };
}

/** Assign the server's default role to a member (idempotent). */
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
    return { error: roleError ?? "No default role." };
  }

  const { error } = await supabase.from("member_roles").insert({
    server_id: serverId,
    user_id: userId,
    role_id: role.id,
  });

  if (error && !/duplicate|unique/i.test(error.message)) {
    return { error: error.message };
  }

  // Keep legacy server_members.role_id in sync when empty.
  await supabase
    .from("server_members")
    .update({ role_id: role.id })
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .is("role_id", null);

  return { error: null as string | null, roleId: role.id };
}

/**
 * Join a server and receive the default Member / @everyone role.
 * Call after a successful server_members insert (or when already a member).
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

  const assigned = await assignDefaultRoleToMember(supabase, serverId, userId);
  if (assigned.error) {
    return { error: assigned.error, alreadyMember: duplicate };
  }

  return { error: null as string | null, alreadyMember: duplicate };
}
