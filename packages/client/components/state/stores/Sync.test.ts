import { untrack } from "solid-js";
import { createStore } from "solid-js/store";
import { expect, test, vi } from "vitest";

import type { Client } from "stoat.js";

import { SYNCED_KEYS } from ".";
import type { State } from "..";
import { ReleaseNotes } from "./ReleaseNotes";
import { Sync } from "./Sync";

test("remote revisions are cleaned and persisted without echoing or syncing local voice/sounds", async () => {
  const [data, setData] = createStore({
    "release-notes": { lastSeenId: "local", lastSeenAt: "" },
    sync: { revision: { "release-notes": 10 } },
  });
  const state = {
    get: (key: keyof typeof data) => data[key],
    set: (...args: unknown[]) => {
      (setData as (...args: unknown[]) => void)(...args);
      sync.touchIfSyncable(args[0] as string);
    },
  };
  const sync = new Sync(state as unknown as State);
  const notes = new ReleaseNotes(state as unknown as State);
  Object.assign(state, { "release-notes": notes });

  expect([...SYNCED_KEYS].sort()).toEqual([
    "notifications",
    "ordering",
    "release-notes",
    "server-folders",
  ]);
  sync.merge(20, "release-notes", '{"lastSeenId":"remote","lastSeenAt":123}');
  expect(untrack(() => data["release-notes"])).toEqual({
    lastSeenId: "remote",
    lastSeenAt: "",
  });
  expect(untrack(() => data.sync.revision["release-notes"])).toBe(20);
  expect(sync.shouldSync).toBe(false);
  sync.merge(15, "release-notes", '{"lastSeenId":"remote"}');
  expect(sync.shouldSync).toBe(false);
  sync.touchIfSyncable("voice");
  sync.touchIfSyncable("sounds");
  expect(sync.shouldSync).toBe(false);
  sync.merge(15, "release-notes", '{"lastSeenId":"stale"}');
  expect(notes.lastSeenId).toBe("remote");
  expect(sync.shouldSync).toBe(true);
  const post = vi.fn().mockResolvedValue(undefined);
  await sync.save({ api: { post } } as unknown as Client);
  expect(post).toHaveBeenCalledWith("/sync/settings/set", {
    timestamp: expect.any(Number),
    "release-notes": untrack(() => JSON.stringify(data["release-notes"])),
  });
  expect(sync.shouldSync).toBe(false);
});
