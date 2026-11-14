"use client";

import { useFormStatus } from "react-dom";

type ConfirmSubmitButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  message: string;
};

export function ConfirmSubmitButton({ message, onClick, ...props }: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      disabled={props.disabled || pending}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >{pending ? "Procesando..." : props.children}</button>
  );
}
