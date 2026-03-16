import { createEffect, on, onCleanup } from "solid-js";

import { ProtocolV1 } from "stoat.js/lib/events/v1";

import { useClient, useClientLifecycle } from "@revolt/client";
import { State as LifecycleState } from "@revolt/client/Controller";

import { useState } from ".";

/**
 * Manage synchronisation of settings to-from API
 */
export function SyncWorker() {
  const state = useState();
  const client = useClient();

  /**
   * Handle incoming events
   * @param event Event
   */
  function handleEvent(event: ProtocolV1["server"]) {
    if (event.type === "UserSettingsUpdate") {
      state.sync.consumeEvent(event.update);
    }
  }

  // sync REMOTE->LOCAL settings
  createEffect(
    on(
      () => client(),
      (client) => {
        if (client) {
          state.sync.initialSync(client);

          client.events.addListener("event", handleEvent);
          onCleanup(() => client.events.removeListener("event", handleEvent));
        }
      },
    ),
  );

  // sync LOCAL->REMOTE settings
  createEffect(
    on(
      () => state.sync.shouldSync,
      (shouldSync) => shouldSync && state.sync.save(client()),
    ),
  );

  // auto-retry failed outbox messages on reconnect
  const lifecycle = useClientLifecycle();
  createEffect(
    on(
      () => lifecycle.lifecycle.state(),
      (connectionState) => {
        if (connectionState === LifecycleState.Connected) {
          const outbox = state.get("draft").outbox;
          const c = client();

          for (const channelId of Object.keys(outbox)) {
            const channel = c.channels.get(channelId);
            if (!channel) continue;

            for (const message of outbox[channelId]) {
              if (message.status === "failed" || message.status === "unsent") {
                state.draft.retrySend(c, channel, message.idempotencyKey);
              }
            }
          }
        }
      },
      { defer: true },
    ),
  );

  return null;
}
