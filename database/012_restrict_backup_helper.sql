-- Prevent bypass of access checks by calling the internal helper directly.
-- The authorized SECURITY DEFINER wrapper continues to invoke it as its owner.
revoke execute on function public.crm_import_backup(jsonb) from public, anon, authenticated;
