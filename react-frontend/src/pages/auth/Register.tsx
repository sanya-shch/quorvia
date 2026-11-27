import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { authApi } from "../../api/auth";
import { registerSchema, type RegisterInput } from "../../api/authSchemas";
import { useAuthStore } from "../../store/useAuthStore";
import { Input } from "../../components/ui/Input";
import { PasswordInput } from "../../components/ui/PasswordInput";
import AuthLayout from "../../components/auth/AuthLayout";
import { AxiosError } from "axios";
import { getApiErrorMessage, translateErrorCode } from "../../i18n/errorCodes";

export default function Register() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
      navigate("/dashboard");
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setError("root", { message: getApiErrorMessage(t, error) });
    },
  });

  const onSubmit = (data: RegisterInput) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { confirmPassword, ...submitData } = data;
    registerMutation.mutate(submitData);
  };

  return (
    <AuthLayout
      eyebrow={t("auth.register.eyebrow")}
      title={t("auth.register.title")}
      subtitle={t("auth.register.subtitle")}
      footer={t("auth.register.footer")}
    >
      <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        {errors.root && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700 motion-fade-in">
            {errors.root.message}
          </div>
        )}

        <Input
          label={t("auth.register.emailLabel")}
          type="email"
          placeholder={t("auth.emailPlaceholder")}
          autoComplete="email"
          error={errors.email?.message ? translateErrorCode(t, errors.email.message) : undefined}
          {...register("email")}
        />

        <PasswordInput
          label={t("auth.register.passwordLabel")}
          placeholder={t("auth.register.passwordPlaceholder")}
          hint={t("auth.register.passwordHint")}
          autoComplete="new-password"
          error={
            errors.password?.message ? translateErrorCode(t, errors.password.message) : undefined
          }
          {...register("password")}
        />

        <Input
          label={t("auth.register.confirmPasswordLabel")}
          type="password"
          placeholder={t("auth.register.confirmPasswordPlaceholder")}
          autoComplete="new-password"
          error={
            errors.confirmPassword?.message
              ? translateErrorCode(t, errors.confirmPassword.message)
              : undefined
          }
          {...register("confirmPassword")}
        />

        <button
          type="submit"
          disabled={registerMutation.isPending}
          className="w-full h-12 flex items-center justify-center rounded-xl bg-indigo-600 text-base font-semibold text-on-solid shadow-sm transition-colors hover:bg-indigo-700 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-50 cursor-pointer"
        >
          {registerMutation.isPending ? t("auth.register.submitting") : t("auth.register.submit")}
        </button>
      </form>

      <p className="mt-7 text-center text-base text-slate-500">
        {t("auth.register.haveAccountText")}{" "}
        <Link
          to="/login"
          className="font-semibold text-indigo-600 transition-colors hover:text-indigo-500"
        >
          {t("auth.register.loginLink")}
        </Link>
      </p>
    </AuthLayout>
  );
}
