// Run once by the project owner after applying the migration.
// A single JSON object is read from stdin, never from command arguments or a committed file.
// {url,serviceKey,accounts:[{login,password,displayName},{login,password,displayName}],emailDomain?}
import { createClient } from "@supabase/supabase-js";

let input = "";
for await (const chunk of process.stdin) input += chunk;
let config;
try {
  config = JSON.parse(input);
} catch {
  throw new Error(
    "Expected setup JSON on stdin; do not put credentials in shell arguments.",
  );
}
if (!Array.isArray(config.accounts) || config.accounts.length !== 2)
  throw new Error("Exactly two accounts are required");
const url = new URL(config.url);
if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co"))
  throw new Error("Use your official Supabase project URL");
for (const account of config.accounts) {
  if (
    !/^[a-z0-9._-]{2,40}$/.test(account.login) ||
    account.password?.length < 12 ||
    !account.displayName
  )
    throw new Error(
      "Invalid account fields: lowercase login, password of at least 12 characters, display name required",
    );
}
if (config.accounts[0].login === config.accounts[1].login)
  throw new Error("Logins must be different");
const domain = config.emailDomain ?? "weekend.invalid";
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain))
  throw new Error("Invalid alias domain");
const client = createClient(config.url, config.serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: couple, error } = await client
  .from("couples")
  .insert({ name: "Мы вдвоём" })
  .select("id")
  .single();
if (error)
  throw new Error(
    "Cannot create couple. Check migration and server credential. No credentials were printed.",
  );
const created = [];
try {
  for (const account of config.accounts) {
    const { data, error } = await client.auth.admin.createUser({
      email: `${account.login}@${domain}`,
      password: account.password,
      email_confirm: true,
    });
    if (error)
      throw new Error(
        "Account creation failed. Check login uniqueness and project auth configuration.",
      );
    created.push(data.user.id);
    const { error: profileError } = await client.from("profiles").insert({
      id: data.user.id,
      couple_id: couple.id,
      display_name: account.displayName,
    });
    if (profileError) throw new Error("Profile creation failed");
  }
  process.stdout.write(
    "Two accounts and one couple created. Public signup must remain disabled.\n",
  );
} catch (error) {
  // Roll back only accounts created by this invocation, never existing user accounts.
  let rollbackFailed = false;
  for (const id of created) {
    const result = await client.auth.admin.deleteUser(id);
    if (result.error) rollbackFailed = true;
  }
  const cleanup = await client.from("couples").delete().eq("id", couple.id);
  if (cleanup.error) rollbackFailed = true;
  if (rollbackFailed)
    process.stderr.write(
      "Setup incomplete: check newly created records in Supabase before retrying.\n",
    );
  throw error;
}
