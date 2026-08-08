import { Trans, useLingui } from "@lingui-solid/solid/macro";
import { Show } from "solid-js";
import { styled } from "styled-system/jsx";

import { useSound } from "@revolt/client";
import { useState } from "@revolt/state";
import {
  CategoryButton,
  Checkbox,
  Column,
  IconButton,
  Slider,
  Text,
  iconSize,
} from "@revolt/ui";

import MdVolumeUp from "@material-design-icons/svg/outlined/volume_up.svg?component-solid";

export default function Sounds() {
  const { sounds } = useState();
  const soundController = useSound();
  const { t } = useLingui();

  const playSoundString = t`Play sound`;

  return (
    <>
      <Column>
        <Text class="title">
          <Trans>Sounds</Trans>
        </Text>
        <CategoryButton.Group>
          <CategoryButton
            action={<Checkbox checked={sounds.enabled("message")} />}
            onClick={() => sounds.toggle("message")}
            icon="blank"
          >
            <Content>
              <Trans>Message Received</Trans>{" "}
              <IconButton
                onPress={() => soundController.playSound("message", true)}
                use:floating={{
                  tooltip: {
                    placement: "top",
                    content: playSoundString,
                  },
                }}
              >
                <MdVolumeUp {...iconSize(18)} />
              </IconButton>
            </Content>
          </CategoryButton>
          <CategoryButton
            action={<Checkbox checked={sounds.enabled("mute")} />}
            onClick={() => sounds.toggle("mute")}
            icon="blank"
          >
            <Content>
              <Trans>Mute</Trans>
              <IconButton
                onPress={() => soundController.playSound("mute", true)}
                use:floating={{
                  tooltip: {
                    placement: "top",
                    content: playSoundString,
                  },
                }}
              >
                <MdVolumeUp {...iconSize(18)} />
              </IconButton>
            </Content>
          </CategoryButton>
          <CategoryButton
            action={<Checkbox checked={sounds.enabled("unmute")} />}
            onClick={() => sounds.toggle("unmute")}
            icon="blank"
          >
            <Content>
              <Trans>Unmute</Trans>
              <IconButton
                onPress={() => soundController.playSound("unmute", true)}
                use:floating={{
                  tooltip: {
                    placement: "top",
                    content: playSoundString,
                  },
                }}
              >
                <MdVolumeUp {...iconSize(18)} />
              </IconButton>
            </Content>
          </CategoryButton>
          <CategoryButton
            action={<Checkbox checked={sounds.enabled("deafen")} />}
            onClick={() => sounds.toggle("deafen")}
            icon="blank"
          >
            <Content>
              <Trans>Deafen</Trans>
              <IconButton
                onPress={() => soundController.playSound("deafen", true)}
                use:floating={{
                  tooltip: {
                    placement: "top",
                    content: playSoundString,
                  },
                }}
              >
                <MdVolumeUp {...iconSize(18)} />
              </IconButton>
            </Content>
          </CategoryButton>
          <CategoryButton
            action={<Checkbox checked={sounds.enabled("undeafen")} />}
            onClick={() => sounds.toggle("undeafen")}
            icon="blank"
          >
            <Content>
              <Trans>Undeafen</Trans>
              <IconButton
                onPress={() => soundController.playSound("undeafen", true)}
                use:floating={{
                  tooltip: {
                    placement: "top",
                    content: playSoundString,
                  },
                }}
              >
                <MdVolumeUp {...iconSize(18)} />
              </IconButton>
            </Content>
          </CategoryButton>
          {/* I don't think we need this? */}
          <Show when={false}>
            <CategoryButton
              action={<Checkbox onChange={(value) => void value} />}
              onClick={() => void 0}
              icon="blank"
            >
              <Trans>Message Sent</Trans>
            </CategoryButton>
          </Show>
          <CategoryButton
            action={<Checkbox checked={sounds.enabled("userJoinVoice")} />}
            onClick={() => sounds.toggle("userJoinVoice")}
            icon="blank"
          >
            <Content>
              <Trans>User Joined Call</Trans>
              <IconButton
                onPress={() => soundController.playSound("userJoinVoice", true)}
                use:floating={{
                  tooltip: {
                    placement: "top",
                    content: playSoundString,
                  },
                }}
              >
                <MdVolumeUp {...iconSize(18)} />
              </IconButton>
            </Content>
          </CategoryButton>
          <CategoryButton
            action={<Checkbox checked={sounds.enabled("userLeaveVoice")} />}
            onClick={() => sounds.toggle("userLeaveVoice")}
            icon="blank"
          >
            <Content>
              <Trans>User Left Call</Trans>
              <IconButton
                onPress={() =>
                  soundController.playSound("userLeaveVoice", true)
                }
                use:floating={{
                  tooltip: {
                    placement: "top",
                    content: playSoundString,
                  },
                }}
              >
                <MdVolumeUp {...iconSize(18)} />
              </IconButton>
            </Content>
          </CategoryButton>
          <CategoryButton
            action={<Checkbox checked={sounds.enabled("streamStart")} />}
            onClick={() => sounds.toggle("streamStart")}
            icon="blank"
          >
            <Content>
              <Trans>Stream Start</Trans>
              <IconButton
                onPress={() => soundController.playSound("streamStart", true)}
                use:floating={{
                  tooltip: {
                    placement: "top",
                    content: playSoundString,
                  },
                }}
              >
                <MdVolumeUp {...iconSize(18)} />
              </IconButton>
            </Content>
          </CategoryButton>
          <CategoryButton
            action={<Checkbox checked={sounds.enabled("streamEnd")} />}
            onClick={() => sounds.toggle("streamEnd")}
            icon="blank"
          >
            <Content>
              <Trans>Stream End</Trans>
              <IconButton
                onPress={() => soundController.playSound("streamEnd", true)}
                use:floating={{
                  tooltip: {
                    placement: "top",
                    content: playSoundString,
                  },
                }}
              >
                <MdVolumeUp {...iconSize(18)} />
              </IconButton>
            </Content>
          </CategoryButton>
          <CategoryButton
            action={<Checkbox checked={sounds.enabled("selfJoinVoice")} />}
            onClick={() => sounds.toggle("selfJoinVoice")}
            icon="blank"
          >
            <Content>
              <Trans>Join Call (Self)</Trans>
              <IconButton
                onPress={() => soundController.playSound("selfJoinVoice", true)}
                use:floating={{
                  tooltip: {
                    placement: "top",
                    content: playSoundString,
                  },
                }}
              >
                <MdVolumeUp {...iconSize(18)} />
              </IconButton>
            </Content>
          </CategoryButton>
          <CategoryButton
            action={<Checkbox checked={sounds.enabled("selfLeaveVoice")} />}
            onClick={() => sounds.toggle("selfLeaveVoice")}
            icon="blank"
          >
            <Content>
              <Trans>Leave Call (Self)</Trans>
              <IconButton
                onPress={() =>
                  soundController.playSound("selfLeaveVoice", true)
                }
                use:floating={{
                  tooltip: {
                    placement: "top",
                    content: playSoundString,
                  },
                }}
              >
                <MdVolumeUp {...iconSize(18)} />
              </IconButton>
            </Content>
          </CategoryButton>
          <CategoryButton
            action={<Checkbox checked={sounds.enabled("disconnect")} />}
            onClick={() => sounds.toggle("disconnect")}
            icon="blank"
          >
            <Content>
              <Trans>Disconnected</Trans>
              <IconButton
                onPress={() => soundController.playSound("disconnect", true)}
                use:floating={{
                  tooltip: {
                    placement: "top",
                    content: playSoundString,
                  },
                }}
              >
                <MdVolumeUp {...iconSize(18)} />
              </IconButton>
            </Content>
          </CategoryButton>
        </CategoryButton.Group>

        <Text class="title">
          <Trans>Master Volume</Trans>
        </Text>
        <Slider
          min={0}
          max={100}
          step={1}
          value={sounds.getVolume() * 100}
          onInput={(event) => {
            const v = event.currentTarget.value / 100;
            sounds.setVolume(v);
            soundController.setVolume(v);
          }}
          labelFormatter={(value) => `${value}%`}
        />
      </Column>
    </>
  );
}

/**
 * Sound content wrapper
 */
const Content = styled("div", {
  base: {
    display: "flex",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
  },
});
