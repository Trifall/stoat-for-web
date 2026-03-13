import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createSignal,
  on,
  onCleanup,
} from "solid-js";

import { cva } from "styled-system/css";
import { styled } from "styled-system/jsx";
import { decodeTime, ulid } from "ulid";

import { DraftMessages, Messages } from "@revolt/app";
import { useClient } from "@revolt/client";
import { Keybind, KeybindAction, createKeybind } from "@revolt/keybinds";
import { useNavigate, useSmartParams } from "@revolt/routing";
import { useVoice } from "@revolt/rtc";
import { useState } from "@revolt/state";
import { LAYOUT_SECTIONS } from "@revolt/state/stores/Layout";
import {
  Avatar,
  BelowFloatingHeader,
  Header,
  NewMessages,
  Text,
  TypingIndicator,
  main,
} from "@revolt/ui";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

import { ChannelHeader } from "../ChannelHeader";
import { ChannelPageProps } from "../ChannelPage";

import { Channel } from "stoat.js";
import { VoiceCallCardActiveRoom } from "@revolt/ui/components/features/voice/callCard/VoiceCallCardActiveRoom";
import { MessageComposition } from "./Composition";
import { MemberSidebar } from "./MemberSidebar";
import { TextSearchSidebar } from "./TextSearchSidebar";

/**
 * State of the channel sidebar
 */
export type SidebarState =
  | {
      state: "search";
      query: string;
    }
  | {
      state: "pins";
    }
  | {
      state: "default";
    };

export function canIHasSidebar(ch: Channel) {
  return !["SavedMessages", "DirectMessage"].includes(ch.type);
}

/**
 * Compact voice card showing participants in a DM/Group voice call (when not connected)
 */
function VoiceCallBanner(props: { channel: Channel }) {
  const voice = useVoice();
  const client = useClient();

  const participants = () => [...props.channel.voiceParticipants.keys()];

  const showBanner = () =>
    (props.channel.type === "DirectMessage" || props.channel.type === "Group") &&
    props.channel.voiceParticipants.size > 0 &&
    voice.channel()?.id !== props.channel.id;

  return (
    <Show when={showBanner()}>
      <VoiceCard>
        <VoiceCardLabel>
          <Symbol size={18}>call</Symbol>
          Ongoing voice call
        </VoiceCardLabel>
        <VoiceCardParticipants>
          <For each={participants()}>
            {(userId) => {
              const user = () => client().users.get(userId);
              return (
                <Show when={user()}>
                  <ParticipantTile>
                    <Avatar size={40} src={user()!.avatarURL} fallback={user()!.displayName ?? user()!.username} />
                    <ParticipantName>{user()!.displayName ?? user()!.username}</ParticipantName>
                  </ParticipantTile>
                </Show>
              );
            }}
          </For>
        </VoiceCardParticipants>
      </VoiceCard>
    </Show>
  );
}

/**
 * Collapsible voice card for voice channels — shows the full participant grid when expanded
 */
function VoiceChannelBanner(props: { channel: Channel }) {
  const voice = useVoice();
  const client = useClient();
  const [expanded, setExpanded] = createSignal(true);

  const participants = () => [...props.channel.voiceParticipants.keys()];

  const isInThisChannel = () => voice.channel()?.id === props.channel.id;

  const showBanner = () =>
    props.channel.voiceParticipants.size > 0 && isInThisChannel();

  const participantNames = () => {
    const names = participants().map((userId) => {
      const u = client().users.get(userId);
      return u?.displayName ?? u?.username ?? "Unknown";
    });
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  };

  return (
    <Show when={showBanner()}>
      <VoiceCard>
        <VoiceCardHeader onClick={() => setExpanded((v) => !v)}>
          <VoiceCardLabel>
            <Symbol size={18}>wifi_tethering</Symbol>
            {participants().length} Participant{participants().length !== 1 ? "s" : ""}:
            <Show when={!expanded()}>
              <VoiceCardNames>{participantNames()}</VoiceCardNames>
            </Show>
          </VoiceCardLabel>
          <Symbol size={18}>{expanded() ? "expand_less" : "expand_more"}</Symbol>
        </VoiceCardHeader>
        <VoiceCardCollapse expanded={expanded()}>
          <VoiceCardBody>
            <VoiceCallCardActiveRoom />
          </VoiceCardBody>
        </VoiceCardCollapse>
      </VoiceCard>
    </Show>
  );
}

export function TextChannel(props: ChannelPageProps) {
  const state = useState();
  const client = useClient();

  // Last unread message id
  const [lastId, setLastId] = createSignal<string>();

  // Read highlighted message id from parameters
  const params = useSmartParams();
  const navigate = useNavigate();

  /**
   * Message id to be highlighted
   * @returns Message Id
   */
  const highlightMessageId = () => params().messageId;

  const canConnect = () =>
    props.channel.isVoice && props.channel.havePermission("Connect");

  // Get a reference to the message box's load latest function
  let jumpToBottomRef: ((nearby?: string) => void) | undefined;

  // Get a reference to the message list's "end status"
  let atEndRef: (() => boolean) | undefined;

  // Store last unread message id
  createEffect(
    on(
      () => props.channel.id,
      (id) =>
        setLastId(
          props.channel.unread
            ? (client().channelUnreads.get(id)?.lastMessageId as string)
            : undefined,
        ),
    ),
  );

  // Mark channel as read whenever it is marked as unread
  createEffect(
    on(
      // must be at the end of the conversation
      () => props.channel.unread && (atEndRef ? atEndRef() : true),
      (unread) => {
        if (unread) {
          if (document.hasFocus()) {
            // acknowledge the message
            props.channel.ack();
          } else {
            // otherwise mark this location as the last read location
            if (!lastId()) {
              // (taking away one second from the seed)
              setLastId(ulid(decodeTime(props.channel.lastMessageId!) - 1));
            }
          }
        }
      },
    ),
  );

  // Mark as read on re-focus
  function onFocus() {
    if (props.channel.unread && (atEndRef ? atEndRef() : true)) {
      props.channel.ack();
    }
  }

  document.addEventListener("focus", onFocus);
  onCleanup(() => document.removeEventListener("focus", onFocus));

  // Register ack/jump latest
  createKeybind(KeybindAction.CHAT_JUMP_END, () => {
    // Mark channel as read if not already
    if (props.channel.unread) {
      props.channel.ack();
    }

    // Clear the last unread id
    if (lastId()) {
      setLastId(undefined);
    }

    // Scroll to the bottom
    jumpToBottomRef?.();
  });

  // Sidebar scroll target
  let sidebarScrollTargetElement!: HTMLDivElement;

  // Sidebar state
  const [sidebarState, setSidebarState] = createSignal<SidebarState>({
    state: "default",
  });

  // todo: in the future maybe persist per ID?
  createEffect(
    on(
      () => props.channel.id,
      () => setSidebarState({ state: "default" }),
    ),
  );

  return (
    <>
      <Header placement="primary">
        <ChannelHeader
          channel={props.channel}
          sidebarState={sidebarState}
          setSidebarState={setSidebarState}
        />
      </Header>
      <Content>
        <main class={main()}>
          <VoiceCallBanner channel={props.channel} />
          <Show
            when={canConnect()}
            fallback={
              <BelowFloatingHeader>
                <div>
                  <NewMessages
                    lastId={lastId}
                    jumpBack={() => navigate(lastId()!)}
                    dismiss={() => setLastId()}
                  />
                </div>
              </BelowFloatingHeader>
            }
          >
            <VoiceChannelBanner channel={props.channel} />
          </Show>

          <Messages
            channel={props.channel}
            lastReadId={lastId}
            pendingMessages={(pendingProps) => (
              <DraftMessages
                channel={props.channel}
                tail={pendingProps.tail}
                sentIds={pendingProps.ids}
              />
            )}
            typingIndicator={
              <TypingIndicator
                users={props.channel.typing}
                ownId={client().user!.id}
              />
            }
            highlightedMessageId={highlightMessageId}
            clearHighlightedMessage={() => navigate(".")}
            atEndRef={(ref) => (atEndRef = ref)}
            jumpToBottomRef={(ref) => (jumpToBottomRef = ref)}
          />

          <MessageComposition
            channel={props.channel}
            onMessageSend={() => jumpToBottomRef?.()}
          />
        </main>
        <Show
          when={
            (state.layout.getSectionState(
              LAYOUT_SECTIONS.MEMBER_SIDEBAR,
              true,
            ) &&
              canIHasSidebar(props.channel)) ||
            sidebarState().state !== "default"
          }
        >
          <div
            ref={sidebarScrollTargetElement}
            use:scrollable={{
              direction: "y",
              showOnHover: true,
              class: sidebar(),
            }}
            style={{
              width: sidebarState().state !== "default" ? "360px" : "",
            }}
          >
            <Switch
              fallback={
                <MemberSidebar
                  channel={props.channel}
                  scrollTargetElement={sidebarScrollTargetElement}
                />
              }
            >
              <Match when={sidebarState().state === "search"}>
                <WideSidebarContainer>
                  <SidebarTitle>
                    <Text class="label" size="large">
                      Search Results
                    </Text>
                  </SidebarTitle>
                  <TextSearchSidebar
                    channel={props.channel}
                    query={{
                      query: (sidebarState() as { query: string }).query,
                    }}
                  />
                </WideSidebarContainer>
              </Match>
              <Match when={sidebarState().state === "pins"}>
                <WideSidebarContainer>
                  <SidebarTitle>
                    <Text class="label" size="large">
                      Pinned Messages
                    </Text>
                  </SidebarTitle>
                  <TextSearchSidebar
                    channel={props.channel}
                    query={{ pinned: true, sort: "Latest" }}
                  />
                </WideSidebarContainer>
              </Match>
            </Switch>

            <Show when={sidebarState().state !== "default"}>
              <Keybind
                keybind={KeybindAction.CLOSE_SIDEBAR}
                onPressed={() => setSidebarState({ state: "default" })}
              />
            </Show>
          </div>
        </Show>
      </Content>
    </>
  );
}

/**
 * Main content row layout
 */
const Content = styled("div", {
  base: {
    display: "flex",
    flexDirection: "row",
    flexGrow: 1,
    minWidth: 0,
    minHeight: 0,
  },
});

/**
 * Base styles
 */
const sidebar = cva({
  base: {
    flexShrink: 0,
    width: "var(--layout-width-channel-sidebar)",
    // margin: "var(--gap-md)",
    borderRadius: "var(--borderRadius-lg)",
    // color: "var(--colours-sidebar-channels-foreground)",
    // background: "var(--colours-sidebar-channels-background)",
  },
});

/**
 * Container styles
 */
const WideSidebarContainer = styled("div", {
  base: {
    paddingRight: "var(--gap-md)",
    width: "360px",
  },
});

/**
 * Sidebar title
 */
const SidebarTitle = styled("div", {
  base: {
    padding: "var(--gap-md)",
    color: "var(--md-sys-color-on-surface)",
  },
});

const VoiceCard = styled("div", {
  base: {
    flexShrink: 0,
    padding: "var(--gap-md) var(--gap-lg)",
    marginInline: "calc(-1 * var(--gap-md))",
    background: "var(--md-sys-color-surface-container)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    userSelect: "none",
  },
});

const VoiceCardHeader = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

const VoiceCardLabel = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--md-sys-color-primary)",
    minWidth: 0,
    overflow: "hidden",
  },
});

const VoiceCardNames = styled("span", {
  base: {
    fontWeight: 400,
    color: "var(--md-sys-color-on-surface-variant)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
});

const VoiceCardCollapse = styled("div", {
  base: {
    display: "grid",
    transition: "grid-template-rows 0.3s ease, opacity 0.3s ease",
    gridTemplateRows: "0fr",
    opacity: 0,
    "& > *": {
      overflow: "hidden",
      minHeight: 0,
    },
  },
  variants: {
    expanded: {
      true: {
        gridTemplateRows: "1fr",
        opacity: 1,
        "& > *": {
          height: "min(40vh, 500px)",
          minHeight: "250px",
        },
      },
    },
  },
});

const VoiceCardBody = styled("div", {
  base: {
    borderRadius: "var(--borderRadius-lg)",
    background: "var(--md-sys-color-secondary-container)",
  },
});

const VoiceCardParticipants = styled("div", {
  base: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--gap-md)",
    padding: "var(--gap-sm) 0",
  },
});

const ParticipantTile = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
    width: "56px",
  },
});

const ParticipantName = styled("span", {
  base: {
    fontSize: "11px",
    color: "var(--md-sys-color-on-surface-variant)",
    textAlign: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    width: "100%",
  },
});
