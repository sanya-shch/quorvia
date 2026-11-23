import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  // A hint under the field while there is no error ("Use at least 8 characters").
  hint?: string;
  // A control inside the field on the right (the show/hide button of a password).
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, trailing, type = "text", className = "", id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    const describedBy = error ? errorId : hint ? hintId : undefined;

    return (
      <div className="w-full space-y-2">
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-900">
          {label}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={type}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            className={`h-12 w-full rounded-xl border bg-slate-50/60 px-4 text-base text-slate-900 placeholder:text-slate-400 transition-all focus:bg-white focus:outline-hidden focus:ring-2 ${
              trailing ? "pr-12" : ""
            } ${
              error
                ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
            } ${className}`}
            {...props}
          />
          {trailing && (
            <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>
          )}
        </div>
        {error ? (
          <p id={errorId} role="alert" className="text-xs font-medium text-red-500">
            {error}
          </p>
        ) : (
          hint && (
            <p id={hintId} className="text-xs text-slate-500">
              {hint}
            </p>
          )
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
