import { Show } from "solid-js";

import { useClient } from "@revolt/client";
import { useModals } from "@revolt/modal";

import { Avatar, Ripple, Text } from "../../design";

import { Trans } from "@lingui/solid/macro";
import { useQuery } from "@tanstack/solid-query";
import { Row } from "../../layout";
import { ProfileCard } from "./ProfileCard";

export function ProfileOwner(props: { bot: { owner: string } }) {
  const client = useClient();
  const { openModal } = useModals();

  const query = useQuery(() => ({
    queryKey: ["owner", props.bot.owner],
    queryFn: async () => {
      const clnt = client();

      return (
        clnt.users.get(props.bot.owner) ??
        (await clnt.users.fetch(props.bot.owner))
      );
    },
  }));

  function openOwnerProfile() {
    if (!query.data) return;

    openModal({
      type: "user_profile",
      user: query.data,
    });
  }

  return (
    <>
      <Show when={query.data} keyed>
        {(owner) => (
          <ProfileCard
            isLink
            role="button"
            tabIndex={0}
            onClick={openOwnerProfile}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openOwnerProfile();
              }
            }}
          >
            <Ripple />
            <Text class="title" size="large">
              <Trans>Owner</Trans>
            </Text>
            <Row>
              <Avatar
                src={owner.animatedAvatarURL}
                fallback={owner.displayName}
                size={20}
              />

              <Text>
                {owner.displayName ??
                  `${owner.username}#${owner.discriminator}`}
              </Text>
            </Row>
          </ProfileCard>
        )}
      </Show>
    </>
  );
}
