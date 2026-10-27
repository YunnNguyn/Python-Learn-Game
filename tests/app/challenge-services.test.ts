import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";

import { IndexedDbChallengePersistence, type SubmissionRecord } from "../../src/core/challenge";
import { GUEST_DATABASE_BASE_NAMES, accountScope } from "../../src/core/persistence";
import {
  InvalidChallengeCatalogError,
  createChallengeServices,
  type ChallengeCatalogEntry,
  type ChallengeServices,
} from "../../src/app/services";
import { createFlakyIndexedDb } from "../persistence/flaky-indexeddb";
import { rawGetAll, useIsolatedIndexedDb } from "../persistence/indexeddb-test-utils";

const CHALLENGE_DB = GUEST_DATABASE_BASE_NAMES.challenge;

const MAE_DEFINITION = {
  id: "house-prices",
  version: "1.0.0",
  title: "House prices",
  metric: "mae",
  idColumn: "id",
  targetColumn: "price",
  targetType: "numeric",
  limits: { maxSubmissionBytes: 10_000, maxRows: 100 },
};
const ACC_DEFINITION = {
  ...MAE_DEFINITION,
  id: "pet-labels",
  title: "Pet labels",
  metric: "accuracy",
  targetColumn: "label",
  targetType: "categorical",
};
const MAE_SOLUTION = "id,price\n1,10\n2,20\n3,30\n";
const ACC_SOLUTION = "id,label\n1,SECRET_cat\n2,SECRET_dog\n3,SECRET_cat\n4,SECRET_bird\n";

const CATALOG: ChallengeCatalogEntry[] = [
  { definition: MAE_DEFINITION, solutionCsv: MAE_SOLUTION },
  { definition: ACC_DEFINITION, solutionCsv: ACC_SOLUTION },
];

const maeCsv = (a: number, b: number, c: number) => `id,price\n1,${a}\n2,${b}\n3,${c}\n`;
const accCsv = (...labels: string[]) => `id,label\n${labels.map((label, i) => `${i + 1},${label}`).join("\n")}\n`;

describe("createChallengeServices", () => {
  const idb = useIsolatedIndexedDb();

  function setup(
    options: {
      factory?: IDBFactory;
      catalog?: ChallengeCatalogEntry[];
      scope?: string;
      times?: string[];
    } = {},
  ) {
    const factory = options.factory ?? idb.createFactory();
    const persistence = idb.track(
      new IndexedDbChallengePersistence(factory, options.scope === undefined ? undefined : accountScope(options.scope)),
    );
    const times = [...(options.times ?? [])];
    let counter = 0;
    const services = createChallengeServices(
      { catalog: options.catalog ?? CATALOG },
      {
        persistence,
        now: () => new Date(times.shift() ?? "2026-10-27T10:00:00.000Z"),
        generateId: () => `id-${(counter += 1)}`,
      },
    );
    return { factory, persistence, services };
  }

  async function saved(services: ChallengeServices, challengeId: string, csv: string) {
    const outcome = await services.submit(challengeId, csv);
    if (outcome.status !== "saved") throw new Error(`expected saved, got ${outcome.status}`);
    return outcome.submission;
  }

  describe("catalog and metadata", () => {
    it("lists and gets challenge metadata without any solution content", () => {
      const { services } = setup();
      const list = services.listChallenges();
      expect(list.ok && list.value.map((c) => c.id)).toEqual(["house-prices", "pet-labels"]);
      const one = services.getChallenge("pet-labels");
      expect(one).toMatchObject({ ok: true, value: { metric: "accuracy", direction: "higher-is-better", version: "1.0.0" } });

      const text = JSON.stringify([list, one]);
      expect(text).not.toContain("SECRET");
      expect(text).not.toContain("solution");
      expect(Object.keys((one as { value: object }).value).sort()).toEqual(
        ["direction", "id", "idColumn", "limits", "metric", "targetColumn", "targetType", "title", "version"],
      );
    });

    it("reports an unknown challenge as NOT_FOUND on every method", async () => {
      const { services } = setup();
      expect(services.getChallenge("nope")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(await services.submit("nope", "x")).toMatchObject({ status: "not-found" });
      expect(await services.listSubmissions("nope")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(await services.getBest("nope")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    });

    it("rejects an invalid or duplicate catalog at construction, before opening storage", () => {
      const persistence = new IndexedDbChallengePersistence(new IDBFactory());
      const open = vi.spyOn(persistence, "addSubmission");
      const make = (catalog: ChallengeCatalogEntry[]) => () => createChallengeServices({ catalog }, { persistence });
      expect(make([{ definition: { ...MAE_DEFINITION, metric: "accuracy" }, solutionCsv: "" }])).toThrow(InvalidChallengeCatalogError);
      expect(make([{ definition: "x", solutionCsv: "" }])).toThrow(InvalidChallengeCatalogError);
      expect(make([CATALOG[0]!, CATALOG[0]!])).toThrow(InvalidChallengeCatalogError);
      expect(open).not.toHaveBeenCalled();
    });

    it("is not affected by later mutation of the catalog input", () => {
      const definition = { ...MAE_DEFINITION, limits: { ...MAE_DEFINITION.limits } };
      const { services } = setup({ catalog: [{ definition, solutionCsv: MAE_SOLUTION }] });
      definition.limits.maxRows = 1;
      expect(services.getChallenge("house-prices")).toMatchObject({ value: { limits: { maxRows: 100 } } });
    });
  });

  describe("submit", () => {
    it("scores, persists durably and returns the stored record", async () => {
      const { factory, services } = setup({ times: ["2026-10-27T10:00:00.000Z"] });
      const csv = maeCsv(11, 22, 30);
      const outcome = await services.submit("house-prices", csv);
      expect(outcome).toEqual({
        status: "saved",
        submission: {
          id: "id-1",
          challengeId: "house-prices",
          challengeVersion: "1.0.0",
          metric: "mae",
          score: 1,
          rowCount: 3,
          submittedAt: "2026-10-27T10:00:00.000Z",
          // Independent of the code under test: `printf 'id,price\n1,11\n2,22\n3,30\n' | sha256sum`.
          submissionSha256: "649bbce26521adc8b338eed26492050a91ffa0babbacb7f82be2728568ba4b1e",
        },
      });

      const rows = await rawGetAll(factory, CHALLENGE_DB, "submissions");
      expect(rows).toEqual([(outcome as { submission: unknown }).submission]);
      expect(JSON.stringify(rows)).not.toContain("id,price"); // no CSV text
    });

    it("survives a reload: a new service set over the same storage sees the history", async () => {
      const first = setup();
      const submission = await saved(first.services, "house-prices", maeCsv(10, 20, 30));
      await first.services.dispose();

      const second = setup({ factory: first.factory });
      expect(await second.services.listSubmissions("house-prices")).toEqual({ ok: true, value: [submission] });
      expect(await second.services.getBest("house-prices")).toEqual({ ok: true, value: submission });
    });

    it("returns issues for an invalid submission and persists nothing", async () => {
      const { persistence, services } = setup();
      const add = vi.spyOn(persistence, "addSubmission");
      const outcome = await services.submit("house-prices", "id,price\n1,abc\n2,2\n3,3\n");
      expect(outcome).toMatchObject({ status: "rejected", issues: [{ code: "INVALID_NUMBER" }] });
      expect(await services.submit("pet-labels", accCsv("a", "b"))).toMatchObject({ status: "rejected" });
      expect(await services.submit("house-prices", 42 as unknown as string)).toMatchObject({ status: "rejected" });
      expect(add).not.toHaveBeenCalled();
      expect(await services.listSubmissions("house-prices")).toEqual({ ok: true, value: [] });
    });

    it("rejected feedback never contains solution labels", async () => {
      const { services } = setup();
      const outcome = await services.submit("pet-labels", accCsv("x", "y"));
      expect(JSON.stringify(outcome)).not.toContain("SECRET");
    });

    it("blames the challenge for a broken solution and stores nothing", async () => {
      const { services } = setup({ catalog: [{ definition: MAE_DEFINITION, solutionCsv: "id,price\n1,oops\n" }] });
      expect(await services.submit("house-prices", maeCsv(1, 2, 3))).toMatchObject({
        status: "rejected",
        issues: [{ code: "SOLUTION_INVALID" }],
      });
    });

    it("never claims success when storage fails, and stores nothing", async () => {
      const flaky = createFlakyIndexedDb(idb.createFactory());
      const { services } = setup({ factory: flaky.factory });
      await saved(services, "house-prices", maeCsv(10, 20, 30));
      flaky.failStores("submissions");
      const outcome = await services.submit("house-prices", maeCsv(10, 20, 31));
      expect(outcome.status).toBe("storage-unavailable");
      expect(JSON.stringify(outcome)).not.toContain("saved");
      expect(await services.listSubmissions("house-prices")).toMatchObject({ ok: false, error: { code: "STORAGE_UNAVAILABLE" } });
      flaky.heal();
      const history = await services.listSubmissions("house-prices");
      expect(history.ok && history.value).toHaveLength(1);
    });

    it("fails closed without IndexedDB", async () => {
      expect(typeof indexedDB).toBe("undefined");
      const services = createChallengeServices({ catalog: CATALOG });
      expect(services.getPersistenceKind()).toBe("indexeddb");
      expect(await services.submit("house-prices", maeCsv(10, 20, 30))).toMatchObject({ status: "storage-unavailable" });
      expect(await services.listSubmissions("house-prices")).toMatchObject({ ok: false, error: { code: "STORAGE_UNAVAILABLE" } });
      expect(await services.getBest("house-prices")).toMatchObject({ ok: false, error: { code: "STORAGE_UNAVAILABLE" } });
    });

    it("reports unreadable stored rows as CORRUPT instead of an empty history", async () => {
      const { persistence, services } = setup();
      await saved(services, "house-prices", maeCsv(10, 20, 30));
      vi.spyOn(persistence, "listSubmissions").mockRejectedValueOnce(
        Object.assign(new Error("bad"), { name: "ChallengeStorageUnreadableError" }),
      );
      expect(await services.listSubmissions("house-prices")).toMatchObject({ ok: false, error: { code: "CORRUPT" } });
    });
  });

  describe("history and best score", () => {
    it("orders history newest first, deterministically on equal timestamps", async () => {
      const { services } = setup({
        times: ["2026-10-27T10:00:00.000Z", "2026-10-27T12:00:00.000Z", "2026-10-27T11:00:00.000Z", "2026-10-27T12:00:00.000Z"],
      });
      for (let i = 0; i < 4; i += 1) await saved(services, "house-prices", maeCsv(10 + i, 20, 30));
      const history = await services.listSubmissions("house-prices");
      expect(history.ok && history.value.map((s) => s.id)).toEqual(["id-4", "id-2", "id-3", "id-1"]);
    });

    it("keeps repeated identical CSVs as separate records with one hash", async () => {
      const factory = idb.createFactory();
      // No injected id generator: the default one must produce unique ids.
      const persistence = idb.track(new IndexedDbChallengePersistence(factory));
      const services = createChallengeServices({ catalog: CATALOG }, { persistence });
      const csv = maeCsv(11, 22, 30);
      const first = await saved(services, "house-prices", csv);
      const second = await saved(services, "house-prices", csv);
      expect(first.id).not.toBe(second.id);
      expect(first.submissionSha256).toBe(second.submissionSha256);
      const history = await services.listSubmissions("house-prices");
      expect(history.ok && history.value).toHaveLength(2);
    });

    it("MAE: the minimum score is best", async () => {
      const { services } = setup();
      await saved(services, "house-prices", maeCsv(13, 20, 30)); // 1
      const lowest = await saved(services, "house-prices", maeCsv(10, 20, 30)); // 0
      await saved(services, "house-prices", maeCsv(40, 20, 30)); // 10
      expect(await services.getBest("house-prices")).toEqual({ ok: true, value: lowest });
    });

    it("Accuracy: the maximum score is best", async () => {
      const { services } = setup();
      await saved(services, "pet-labels", accCsv("x", "x", "x", "x")); // 0
      const highest = await saved(services, "pet-labels", accCsv("SECRET_cat", "SECRET_dog", "SECRET_cat", "x")); // .75
      await saved(services, "pet-labels", accCsv("SECRET_cat", "x", "x", "x")); // .25
      expect(await services.getBest("pet-labels")).toEqual({ ok: true, value: highest });
    });

    it("has no best score without submissions", async () => {
      const { services } = setup();
      expect(await services.getBest("house-prices")).toEqual({ ok: true, value: null });
    });

    it("breaks score ties by earliest time, then by id", async () => {
      const { services } = setup({
        times: ["2026-10-27T12:00:00.000Z", "2026-10-27T10:00:00.000Z", "2026-10-27T10:00:00.000Z"],
      });
      await saved(services, "house-prices", maeCsv(11, 20, 30)); // id-1, 12:00
      await saved(services, "house-prices", maeCsv(11, 20, 30)); // id-2, 10:00
      await saved(services, "house-prices", maeCsv(11, 20, 30)); // id-3, 10:00
      const best = await services.getBest("house-prices");
      expect(best.ok && best.value?.id).toBe("id-2");
    });

    it("ignores records of other versions and other metrics", async () => {
      const { persistence, services } = setup();
      const base: SubmissionRecord = {
        id: "old",
        challengeId: "house-prices",
        challengeVersion: "0.9.0",
        metric: "mae",
        score: 0,
        rowCount: 3,
        submittedAt: "2026-01-01T00:00:00.000Z",
        submissionSha256: "b".repeat(64),
      };
      await persistence.addSubmission(base); // a perfect score from a previous version
      await persistence.addSubmission({ ...base, id: "other-metric", challengeVersion: "1.0.0", metric: "accuracy", score: 0 });
      expect(await services.getBest("house-prices")).toEqual({ ok: true, value: null });
      expect(await services.listSubmissions("house-prices")).toEqual({ ok: true, value: [] });

      const current = await saved(services, "house-prices", maeCsv(15, 20, 30));
      expect(await services.getBest("house-prices")).toEqual({ ok: true, value: current });
      expect(await persistence.listSubmissions("house-prices", "0.9.0")).toHaveLength(1); // old data untouched
    });

    it("a new version starts a fresh history over the same storage", async () => {
      const first = setup();
      await saved(first.services, "house-prices", maeCsv(10, 20, 30));
      await first.services.dispose();
      const v2 = setup({
        factory: first.factory,
        catalog: [{ definition: { ...MAE_DEFINITION, version: "2.0.0" }, solutionCsv: MAE_SOLUTION }],
      });
      expect(await v2.services.getBest("house-prices")).toEqual({ ok: true, value: null });
    });
  });

  describe("scope isolation", () => {
    it("keeps Guest and account histories apart", async () => {
      const factory = idb.createFactory();
      const guest = setup({ factory });
      const account = setup({ factory, scope: "acct-A" });
      await saved(guest.services, "house-prices", maeCsv(10, 20, 30));
      expect(await account.services.listSubmissions("house-prices")).toEqual({ ok: true, value: [] });
      await saved(account.services, "house-prices", maeCsv(10, 20, 31));
      const guestHistory = await guest.services.listSubmissions("house-prices");
      expect(guestHistory.ok && guestHistory.value).toHaveLength(1);
    });

    it("touches only the challenge database", async () => {
      const { factory, services } = setup();
      await saved(services, "house-prices", maeCsv(10, 20, 30));
      await services.listSubmissions("house-prices");
      expect((await factory.databases()).map((database) => database.name)).toEqual([CHALLENGE_DB]);
    });
  });

  describe("disposal", () => {
    it("refuses every operation afterwards and opens no connection", async () => {
      const factory = idb.createFactory();
      const { services } = setup({ factory });
      expect(services.getLifecycleState()).toEqual({ status: "active" });
      expect(await services.dispose()).toMatchObject({ status: "disposed", persistence: "closed" });
      expect(services.getLifecycleState().status).toBe("disposed");

      expect(await services.submit("house-prices", maeCsv(10, 20, 30))).toMatchObject({ status: "retired" });
      expect(await services.listSubmissions("house-prices")).toMatchObject({ ok: false, error: { code: "RETIRED" } });
      expect(await services.getBest("house-prices")).toMatchObject({ ok: false, error: { code: "RETIRED" } });
      expect(services.listChallenges()).toMatchObject({ ok: false, error: { code: "RETIRED" } });
      expect(services.getChallenge("house-prices")).toMatchObject({ ok: false, error: { code: "RETIRED" } });
      expect(await factory.databases()).toEqual([]);
    });

    it("is idempotent and never rejects", async () => {
      const { services } = setup();
      const [a, b] = await Promise.all([services.dispose(), services.dispose()]);
      expect(a).toEqual(b);
      expect(await services.dispose()).toEqual(a);
    });

    it("drains a submission that was already admitted instead of cutting it off", async () => {
      const { factory, services } = setup();
      const pending = services.submit("house-prices", maeCsv(10, 20, 30));
      const disposal = services.dispose();
      expect(services.getLifecycleState().status).toBe("retiring");
      expect(await services.submit("house-prices", maeCsv(10, 20, 30))).toMatchObject({ status: "retired" });

      expect(await pending).toMatchObject({ status: "saved" });
      expect(await disposal).toMatchObject({ status: "disposed" });
      expect(await rawGetAll(factory, CHALLENGE_DB, "submissions")).toHaveLength(1);
    });

    it("reports an incomplete drain when a write does not settle in time", async () => {
      const { persistence, services } = setup();
      vi.spyOn(persistence, "addSubmission").mockImplementation(() => new Promise(() => undefined));
      void services.submit("house-prices", maeCsv(10, 20, 30));
      expect(await services.dispose({ drainTimeoutMs: 20 })).toMatchObject({
        status: "incomplete",
        reason: "DRAIN_TIMEOUT",
        pendingDurableOperations: 1,
      });
      expect(persistence.getCloseState()).toBe("open"); // not closed under a running write
    });
  });
});
