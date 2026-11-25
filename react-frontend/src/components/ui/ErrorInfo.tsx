interface ErrorInfoProps {
  errorText: string;
  variant?: "text" | "block";
}

export const ErrorInfo = ({ errorText, variant = "text" }: ErrorInfoProps) => {
  const isBlock = variant === "block";

  return (
    <div
      role="alert"
      className={`
        flex items-center text-rose-600 text-xs motion-drop
        ${
          isBlock
            ? "gap-2 font-medium bg-rose-50 border border-rose-100 rounded-xl px-3 py-2"
            : "gap-1.5 font-bold mt-2"
        }
      `}
    >
      <svg
        className="h-4 w-4 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={isBlock ? "2" : "2.5"}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <span>{errorText}</span>
    </div>
  );
};
