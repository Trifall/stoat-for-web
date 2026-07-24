import { type JSX, createEffect, createSignal, on, splitProps } from "solid-js";

import "mdui/components/slider.js";

type Props = Omit<
  JSX.HTMLAttributes<HTMLInputElement>,
  "onChange" | "onInput"
> & {
  accessibleLabel?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  value: number;
  tickmarks?: boolean;
  labelFormatter?: (value: number) => string;
  onChange?: (event: { currentTarget: { value: number } }) => void;
  onInput?: (event: { currentTarget: { value: number } }) => void;
};

type SliderElement = HTMLElement & {
  labelFormatter?: (value: number) => string;
  updateComplete?: Promise<unknown>;
};

/**
 * Sliders let users make selections from a range of values
 *
 * @library MDUI
 * @specification https://m3.material.io/components/sliders
 */
export function Slider(props: Props) {
  const [ref, setRef] = createSignal<SliderElement>();

  const [local, rest] = splitProps(props, [
    "accessibleLabel",
    "labelFormatter",
  ]);

  createEffect(
    on(ref, (ref) => {
      if (ref && local.labelFormatter) {
        ref.labelFormatter = local.labelFormatter;
      }
    }),
  );

  createEffect(() => {
    const element = ref();
    const label = local.accessibleLabel;
    if (!element || !label) return;

    const applyLabel = () => {
      element.shadowRoot
        ?.querySelector('input[type="range"]')
        ?.setAttribute("aria-label", label);
    };

    if (element.updateComplete) {
      void element.updateComplete.then(applyLabel);
    } else {
      queueMicrotask(applyLabel);
    }
  });

  return (
    <mdui-slider ref={setRef} aria-label={local.accessibleLabel} {...rest} />
  );
}
