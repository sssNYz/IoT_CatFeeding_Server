import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "../lib/contract/registry";
import { Cat } from "../lib/contract/schemas";
import { call, errorShaped, login, shaped } from "./helpers";

const CatList = z.object({ cats: z.array(Cat) });

// There is no way to delete a cat, so every run registers fresh tags.
const newTag = () => randomBytes(4).toString("hex").toUpperCase();

let owner: string;

beforeAll(async () => {
  owner = await login("OWNER");
});

async function listCats(token = owner) {
  const { status, body } = await call("GET", "/cats", { token });
  expect(status).toBe(200);
  return shaped(CatList, body).cats;
}

describe("POST /cats", () => {
  it("registers a cat by name and RFID tag", async () => {
    const tag = newTag();
    const { status, body } = await call("POST", "/cats", { token: owner, body: { name: "Mochi", rfid_tag: tag } });
    expect(status).toBe(201);
    const cat = shaped(Cat, body);
    expect(cat).toMatchObject({ name: "Mochi", rfid_tag: tag });
    expect(await listCats()).toContainEqual(cat);
  });

  it("refuses a tag that is already registered with 409 conflict", async () => {
    const tag = newTag();
    expect((await call("POST", "/cats", { token: owner, body: { name: "Mochi", rfid_tag: tag } })).status).toBe(201);
    const { status, body } = await call("POST", "/cats", { token: owner, body: { name: "Tora", rfid_tag: tag } });
    expect(status).toBe(409);
    const error = errorShaped(body);
    expect(error.code).toBe("conflict");
    expect(error.message).toBe(`RFID tag ${tag} is already registered`);
  });

  it.each([
    ["name", { rfid_tag: "E200001A" }],
    ["name", { name: "", rfid_tag: "E200001A" }],
    ["rfid_tag", { name: "Mochi", rfid_tag: "e200001a" }],
    ["rfid_tag", { name: "Mochi", rfid_tag: "E2-00" }],
    ["rfid_tag", { name: "Mochi" }],
  ])("returns 422 naming %s for %j", async (field, body) => {
    const res = await call("POST", "/cats", { token: owner, body });
    expect(res.status).toBe(422);
    const error = errorShaped(res.body);
    expect(error.code).toBe("validation_error");
    expect(error.details?.map((d) => d.field)).toEqual([field]);
  });
});

describe("GET /cats", () => {
  it("gives the owner only their own cats, and the admin every cat", async () => {
    const admin = await login("ADMIN");
    const mine = shaped(Cat, (await call("POST", "/cats", { token: owner, body: { name: "Mochi", rfid_tag: newTag() } })).body);
    const theirs = shaped(Cat, (await call("POST", "/cats", { token: admin, body: { name: "Shiro", rfid_tag: newTag() } })).body);

    const ownerSees = await listCats();
    expect(ownerSees).toContainEqual(mine);
    expect(ownerSees).not.toContainEqual(theirs);
    expect(await listCats(admin)).toEqual(expect.arrayContaining([mine, theirs]));
  });

  it("includes the two seeded cats with their tags", async () => {
    const cats = (await listCats()).map(({ name, rfid_tag }) => ({ name, rfid_tag }));
    expect(cats).toEqual(
      expect.arrayContaining([
        { name: "Mochi", rfid_tag: "E200001A" },
        { name: "Tora", rfid_tag: "E200001B" },
      ]),
    );
  });

  it("returns 401 without a token", async () => {
    expect((await call("GET", "/cats")).status).toBe(401);
  });
});
