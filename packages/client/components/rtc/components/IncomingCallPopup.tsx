import { batch, createEffect, createSignal, on, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { styled } from "styled-system/jsx";

import { Avatar } from "@revolt/ui/components/design";
import { iconSize, typography } from "@revolt/ui";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

import MdClose from "@material-design-icons/svg/outlined/close.svg?component-solid";

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface IncomingCallPopupProps {
  callerName: string;
  callerAvatar?: string;
  onAnswer: () => void;
  onReject: () => void;
}

export function IncomingCallPopup(props: IncomingCallPopupProps) {
  const [corner, setCorner] = createSignal<Corner>("bottom-left");
  const [moving, setMoving] = createSignal(false);
  const [offset, setOffset] = createSignal({ x: 0, y: 0 });

  function position() {
    const c = corner();
    const left = c === "top-left" || c === "bottom-left";
    const top = c === "top-left" || c === "top-right";

    return {
      "--padding-x": "24px",
      "--padding-y": "24px",
      transform: `translate(${
        left
          ? "calc(var(--padding-x) + var(--offset-x))"
          : "calc(100vw - var(--padding-x) - 100% + var(--offset-x))"
      }, ${
        top
          ? "calc(var(--padding-y) + var(--offset-y))"
          : "calc(100vh - var(--padding-y) - 100% + var(--offset-y))"
      })`,
    };
  }

  createEffect(
    on(moving, (isMoving) => {
      if (!isMoving) return;

      const controller = new AbortController();

      document.addEventListener(
        "mousemove",
        (event) => {
          setOffset((pos) => ({
            x: pos.x + event.movementX,
            y: pos.y + event.movementY,
          }));
        },
        { signal: controller.signal },
      );

      document.addEventListener(
        "mouseup",
        (event) => {
          batch(() => {
            setMoving(false);

            const left = event.clientX < window.outerWidth / 2;
            const top = event.clientY < window.outerHeight / 2;

            setCorner(
              left
                ? top
                  ? "top-left"
                  : "bottom-left"
                : top
                  ? "top-right"
                  : "bottom-right",
            );
          });
        },
        { signal: controller.signal },
      );

      onCleanup(() => controller.abort());
    }),
  );

  return (
    <Portal mount={document.getElementById("floating")! as HTMLDivElement}>
      <div
        style={{
          position: "fixed",
          "z-index": 100,
          "transition-duration": moving() ? ".2s" : ".3s",
          "transition-property": "all",
          "transition-timing-function": moving()
            ? "cubic-bezier(0, 1.67, 0.85, 0.8)"
            : "cubic-bezier(1, 0, 0, 1)",
          ...position(),
          "pointer-events": "none",
          cursor: moving() ? "grabbing" : "grab",
          "--offset-x": `${moving() ? offset().x : 0}px`,
          "--offset-y": `${moving() ? offset().y : 0}px`,
        }}
        onMouseDown={(e: MouseEvent) => {
          // Don't start drag from buttons or dismiss
          if ((e.target as HTMLElement).closest("button, a")) return;
          e.preventDefault();
          batch(() => {
            setMoving(true);
            setOffset({ x: 0, y: 0 });
          });
        }}
      >
        <Card>
          <Dismiss onClick={props.onReject}>
            <MdClose {...iconSize("16px")} fill="currentColor" />
          </Dismiss>
          <CallerInfo>
            <Avatar
              size={48}
              src={props.callerAvatar}
              fallback={props.callerName}
            />
            <span class={typography({ class: "title", size: "small" })}>
              {props.callerName}
            </span>
            <span class={typography({ class: "label", size: "small" })}>
              is calling you!
            </span>
          </CallerInfo>
          <Actions>
            <CallButton action="reject" onClick={props.onReject}>
              <Symbol>call_end</Symbol>
            </CallButton>
            <CallButton action="answer" onClick={props.onAnswer}>
              <Symbol>call</Symbol>
            </CallButton>
          </Actions>
        </Card>
      </div>
    </Portal>
  );
}

const Card = styled("div", {
  base: {
    position: "relative",
    pointerEvents: "all",
    userSelect: "none",
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-lg)",
    padding: "var(--gap-lg)",
    minWidth: "280px",
    borderRadius: "var(--borderRadius-lg)",
    color: "var(--md-sys-color-on-surface)",
    background: "var(--md-sys-color-surface-container-high)",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
  },
});

const Dismiss = styled("a", {
  base: {
    position: "absolute",
    top: "var(--gap-sm)",
    right: "var(--gap-sm)",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    opacity: 0.6,
    _hover: {
      opacity: 1,
    },
  },
});

const CallerInfo = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: "var(--gap-sm)",
  },
});

const Actions = styled("div", {
  base: {
    display: "flex",
    justifyContent: "center",
    gap: "var(--gap-lg)",
  },
});

const CallButton = styled("button", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "var(--gap-sm) var(--gap-xl)",
    borderRadius: "var(--borderRadius-full)",
    border: "none",
    cursor: "pointer",
    transition: "opacity 0.15s",
    _hover: {
      opacity: 0.85,
    },
  },
  variants: {
    action: {
      reject: {
        background: "var(--md-sys-color-error)",
        color: "var(--md-sys-color-on-error)",
      },
      answer: {
        background: "#2e7d32",
        color: "white",
      },
    },
  },
});
