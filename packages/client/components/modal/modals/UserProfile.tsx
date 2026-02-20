import { useQuery } from "@tanstack/solid-query";
import { styled } from "styled-system/jsx";

import { Dialog, DialogProps, Profile } from "@revolt/ui";

import { Modals } from "../types";

export function UserProfileModal(
  props: DialogProps & Modals & { type: "user_profile" },
) {
  const query = useQuery(() => ({
    queryKey: ["profile", props.user.id],
    queryFn: () => props.user.fetchProfile(),
  }));

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      minWidth={560}
      padding={8}
    >
      <ProfileContents>
        <Profile.Banner
          width={2}
          user={props.user}
          bannerUrl={query.data?.animatedBannerURL}
        />

        <Profile.Status user={props.user} />
        <BadgeAndActionsRow>
          <Profile.Badges user={props.user} />
          <Profile.Actions user={props.user} />
        </BadgeAndActionsRow>
        <Profile.Bio content={query.data?.content} />
        <Profile.Joined user={props.user} />
      </ProfileContents>
    </Dialog>
  );
}

const ProfileContents = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-md)",
    padding: "var(--gap-md)",
  },
});

const BadgeAndActionsRow = styled("div", {
  base: {
    display: "flex",
    gap: "var(--gap-sm)",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
