import { useDevice } from "@revolt/common";
import {
  type Accessor,
  type JSX,
  createEffect,
  createSignal,
  on,
  onCleanup,
} from "solid-js";

type Props = JSX.Directives["floating"] & object;

export type FloatingElement = {
  config: () => Props;
  element: HTMLElement;
  hide: () => void;
  show: Accessor<Props | undefined>;
};

const [floatingElements, setFloatingElements] = createSignal<FloatingElement[]>(
  [],
);

export { floatingElements };

/**
 * Register a new floating element
 * @param element element
 */
export function registerFloatingElement(element: FloatingElement) {
  setFloatingElements((elements) => [...elements, element]);
}

/**
 * Un register floating element
 * @param element DOM Element
 */
export function unregisterFloatingElement(element: HTMLElement) {
  setFloatingElements((elements) =>
    elements.filter((entry) => entry.element !== element),
  );
}

/**
 * Add floating elements
 * @param element Element
 * @param accessor Parameters
 */
export function floating(element: HTMLElement, accessor: Accessor<Props>) {
  const config = accessor();
  if (!config) return;

  const { isIOSTouch } = useDevice();

  const [show, setShow] = createSignal<Props | undefined>();
  // DEBUG: createEffect(() => console.info("show:", show()));

  registerFloatingElement({
    config: accessor,
    element,
    show,
    /**
     * Hide the element
     */
    hide() {
      setShow(undefined);
    },
  });

  /**
   * Trigger a floating element
   */
  function trigger(target: keyof Props, desiredState?: boolean) {
    const current = show();
    const config = accessor();

    if (target === "userCard" && config.userCard) {
      // Dismiss any other open user cards first
      for (const el of floatingElements()) {
        if (el.element !== element && el.show()?.userCard) {
          el.hide();
        }
      }

      if (current?.userCard) {
        setShow(undefined);
      } else if (!current) {
        setShow({ userCard: config.userCard });
      } else {
        setShow(undefined);
        setShow({ userCard: config.userCard });
      }
    }

    if (target === "tooltip" && config.tooltip) {
      if (current?.tooltip) {
        if (desiredState !== true) {
          setShow(undefined);
        }
      } else if (!current) {
        if (desiredState !== false) {
          setShow({ tooltip: config.tooltip });
        }
      }
    }

    if (target === "contextMenu" && config.contextMenu) {
      if (current?.contextMenu) {
        setShow(undefined);
      } else if (!current) {
        setShow({ contextMenu: config.contextMenu });
      } else {
        setShow(undefined);
        setShow({ contextMenu: config.contextMenu });
      }
    }
  }

  /**
   * Handle click events
   */
  function onClick() {
    // TODO: handle shift+click for mention
    trigger("userCard");
  }

  /**
   * Handle context menu click
   */
  function onContextMenu(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    trigger("contextMenu");
  }

  let isTouch = false,
    tTmr: NodeJS.Timeout | undefined;

  /**
   * Handle mouse entering
   */
  function onMouseEnter() {
    if (!isTouch) trigger("tooltip", true);
  }

  /**
   * Handle mouse leaving
   */
  function onMouseLeave() {
    trigger("tooltip", false);
  }

  /**
   * Hide tooltips before a click can move the trigger without firing mouseleave.
   */
  function onTooltipPress() {
    trigger("tooltip", false);
  }

  function onTouch() {
    isTouch = true;
    clearTimeout(tTmr);
    tTmr = setTimeout(() => {
      isTouch = false;
      tTmr = undefined;
    }, 100);
  }

  createEffect(
    on(
      () => accessor().userCard,
      (userCard) => {
        if (userCard) {
          element.style.cursor = "pointer";
          element.style.userSelect = "none";
          element.addEventListener("click", onClick);

          onCleanup(() => element.removeEventListener("click", onClick));
        }
      },
    ),
  );

  createEffect(
    on(
      () => accessor().tooltip,
      (tooltip) => {
        if (tooltip) {
          element.ariaLabel =
            typeof tooltip.content === "string"
              ? tooltip.content
              : tooltip!.aria!;

          element.addEventListener("mouseenter", onMouseEnter);
          element.addEventListener("mouseleave", onMouseLeave);
          element.addEventListener("mousedown", onTooltipPress);
          element.addEventListener("click", onTooltipPress);
          element.addEventListener("touchstart", onTouch);
          element.addEventListener("touchend", onTouch);

          onCleanup(() => {
            element.removeEventListener("mouseenter", onMouseEnter);
            element.removeEventListener("mouseleave", onMouseLeave);
            element.removeEventListener("mousedown", onTooltipPress);
            element.removeEventListener("click", onTooltipPress);
            element.removeEventListener("touchstart", onTouch);
            element.removeEventListener("touchend", onTouch);
          });
        }
      },
    ),
  );

  createEffect(
    on(
      () => accessor().contextMenu,
      (contextMenu) => {
        if (contextMenu) {
          if (
            (accessor().contextMenuHandler ?? "contextmenu") ===
              "contextmenu" &&
            isIOSTouch
          ) {
            element.addEventListener("long-press", onContextMenu);
          } else {
            element.addEventListener(
              accessor().contextMenuHandler ?? "contextmenu",
              onContextMenu,
            );
          }

          onCleanup(() => {
            if (isIOSTouch) {
              element.removeEventListener("long-press", onContextMenu);
            }
            element.removeEventListener(
              config.contextMenuHandler ?? "contextmenu",
              onContextMenu,
            );
          });
        }
      },
    ),
  );

  onCleanup(() => unregisterFloatingElement(element));
}
