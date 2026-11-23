import { forwardRef, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "./Input";
import AppIcon from "./AppIcon";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type" | "trailing">;

// A password field with a show/hide button. The button is not part of the tab order of a form
// submit (type="button") and tells a screen reader its state through aria-pressed.
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>((props, ref) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <Input
      ref={ref}
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-pressed={visible}
          aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:text-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
        >
          <AppIcon name={visible ? "eyeOff" : "eye"} className="h-5 w-5" />
        </button>
      }
    />
  );
});

PasswordInput.displayName = "PasswordInput";
