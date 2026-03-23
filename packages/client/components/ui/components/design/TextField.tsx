import type { JSX } from "solid-js";

import "mdui/components/select.js";
import "mdui/components/text-field.js";
import { cva } from "styled-system/css";

type Props = JSX.HTMLAttributes<HTMLInputElement> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value?: any;
  autoFocus?: boolean;
  required?: boolean;
  name?: string;
  label?: string;
  autosize?: boolean;
  disabled?: boolean;
  rows?: number;
  "min-rows"?: number;
  "max-rows"?: number;
  placeholder?: string;
  type?: "text" | "password" | "email" | "file";
  variant?: "filled" | "outlined";
  enterkeyhint?:
    | "enter"
    | "done"
    | "go"
    | "next"
    | "previous"
    | "search"
    | "find";
};

const field = cva({
  base: { cursor: "text" },
});

/**
 * Text fields let users enter text into a UI
 *
 * @library MDUI
 * @specification https://m3.material.io/components/text-fields
 */
export function TextField(props: Props) {
  return (
    <mdui-text-field
      {...props}
      class={field()}
      // @codegen directives props=props include=autoComplete
    />
  );
}
