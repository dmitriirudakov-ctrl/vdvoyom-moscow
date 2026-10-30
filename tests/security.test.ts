import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  C = "33333333-3333-4333-8333-333333333333";
const couple = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const personal = "10000000-0000-4000-8000-000000000001",
  shared = "10000000-0000-4000-8000-000000000002";
async function asUser(id: string) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    grant usage on schema public to anon,authenticated,service_role;`);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610300001_initial.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(`insert into auth.users values ('${A}'),('${B}'),('${C}');
    insert into public.couples(id) values ('${couple}'),('${other}');
    insert into public.profiles values ('${A}','${couple}','A'),('${B}','${couple}','B'),('${C}','${other}','C');
    insert into public.saves(id,couple_id,owner_id,visibility,payload) values
      ('${personal}','${couple}','${A}','private','{"title":"secret"}'),
      ('${shared}','${couple}','${A}','shared','{"title":"shared"}');`);
}, 20000);
afterAll(async () => {
  await db.close();
});

describe("Database authorization under real PostgreSQL RLS", () => {
  it("shows A both own saves; B only the shared save; outsiders none", async () => {
    await asUser(A);
    expect((await db.query("select * from public.saves")).rows).toHaveLength(2);
    await asUser(B);
    expect(
      (await db.query<{ id: string }>("select id from public.saves")).rows.map(
        (x) => x.id,
      ),
    ).toEqual([shared]);
    await asUser(C);
    expect((await db.query("select * from public.saves")).rows).toHaveLength(0);
  });
  it("denies partner direct reads, updates and deletion of the private record", async () => {
    await asUser(B);
    expect(
      (await db.query(`select * from public.saves where id='${personal}'`))
        .rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `update public.saves set visibility='shared' where id='${personal}' returning id`,
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `delete from public.saves where id='${personal}' returning id`,
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `update public.saves set owner_id='${B}' where id='${shared}' returning id`,
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("prevents spoofing a save owner or moving it into another couple", async () => {
    await asUser(A);
    await expect(
      db.exec(
        `insert into public.saves(couple_id,owner_id,payload) values('${couple}','${B}','{}')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `update public.saves set couple_id='${other}' where id='${personal}'`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `update public.profiles set couple_id='${other}' where id='${A}'`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `insert into public.profiles values('${C}','${couple}','Intruder')`,
      ),
    ).rejects.toThrow();
  });
  it("reveals the selected save only after the owner explicitly shares it", async () => {
    await asUser(A);
    await db.exec(
      `update public.saves set visibility='shared' where id='${personal}'`,
    );
    await asUser(B);
    expect(
      (await db.query(`select id from public.saves where id='${personal}'`))
        .rows,
    ).toHaveLength(1);
    await asUser(C);
    expect(
      (await db.query(`select id from public.saves where id='${personal}'`))
        .rows,
    ).toHaveLength(0);
  });
  it("keeps visits manual and shared within the couple, independent of save deletion", async () => {
    await asUser(A);
    expect((await db.query("select * from public.visits")).rows).toHaveLength(
      0,
    );
    await expect(
      db.exec(
        `insert into public.visits(couple_id,author_id,plan_id,payload) values('${couple}','${B}','${personal}','{"id":"${personal}"}')`,
      ),
    ).rejects.toThrow();
    await db.exec(
      `insert into public.visits(couple_id,author_id,plan_id,payload) values('${couple}','${A}','${personal}','{"id":"${personal}"}')`,
    );
    await db.exec(`delete from public.saves where id='${personal}'`);
    await asUser(B);
    expect((await db.query("select * from public.visits")).rows).toHaveLength(
      1,
    );
    await asUser(C);
    expect((await db.query("select * from public.visits")).rows).toHaveLength(
      0,
    );
  });
  it("makes likes common but does not let another couple read or change them", async () => {
    await asUser(A);
    await db.exec(
      `insert into public.place_feedback values('${couple}','park','liked')`,
    );
    await asUser(B);
    expect(
      (await db.query("select * from public.place_feedback")).rows,
    ).toHaveLength(1);
    await asUser(C);
    expect(
      (await db.query("select * from public.place_feedback")).rows,
    ).toHaveLength(0);
    await expect(
      db.exec(
        `insert into public.place_feedback values('${couple}','park2','blocked')`,
      ),
    ).rejects.toThrow();
  });
  it("denies anonymous reads and client access to the import function", async () => {
    await db.exec("reset role; set role anon;");
    await expect(db.query("select * from public.saves")).rejects.toThrow();
    await expect(
      db.query("select public.replace_event_catalog('[]')"),
    ).rejects.toThrow();
    await asUser(A);
    await expect(
      db.query("select public.replace_event_catalog('[]')"),
    ).rejects.toThrow();
    await expect(
      db.exec("insert into public.catalog values('rogue','{}',now())"),
    ).rejects.toThrow();
  });
  it("publishes importer snapshots atomically and retains the previous data on invalid input", async () => {
    await db.exec("reset role; set role service_role;");
    await db.query("select public.replace_event_catalog($1)", [
      JSON.stringify([{ id: "kudago-1", payload: { title: "old" } }]),
    ]);
    await expect(
      db.query("select public.replace_event_catalog($1)", [
        JSON.stringify([{ id: "kudago-2", payload: null }]),
      ]),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ id: string }>("select id from public.catalog")
      ).rows.map((r) => r.id),
    ).toEqual(["kudago-1"]);
    await db.query("select public.replace_event_catalog('[]')");
    expect((await db.query("select id from public.catalog")).rows).toHaveLength(
      0,
    );
  });
});
