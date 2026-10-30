-- Either partner may remove a shared plan; private plans remain owner-only.
alter policy saves_delete on public.saves
using (
  couple_id = (select private.current_couple_id())
  and (owner_id = (select auth.uid()) or visibility = 'shared')
);
