import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { authApi } from "../../api/auth";
import { loginSchema, type LoginInput } from "../../api/authSchemas";
import { useAuthStore } from "../../store/useAuthStore";
import { Input } from "../../components/ui/Input";
import { PasswordInput } from "../../components/ui/PasswordInput";
import AuthLayout from "../../components/auth/AuthLayout";
import { AxiosError } from "axios";
import { getApiErrorMessage, translateErrorCode } from "../../i18n/errorCodes";

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
      navigate("/dashboard");
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setError("root", { message: getApiErrorMessage(t, error) });
    },
  });

  const onSubmit = (data: LoginInput) => {
    loginMutation.mutate(data);
  };

  return (
    <AuthLayout
      eyebrow={t("auth.login.eyebrow")}
      title={t("auth.login.title")}
      subtitle={t("auth.login.subtitle")}
      footer={t("auth.login.footer")}
    >
      <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        {errors.root && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600 motion-fade-in">
            {errors.root.message}
          </div>
        )}

        <Input
          label={t("auth.login.emailLabel")}
          type="email"
          placeholder={t("auth.emailPlaceholder")}
          autoComplete="email"
          error={errors.email?.message ? translateErrorCode(t, errors.email.message) : undefined}
          {...register("email")}
        />

        <PasswordInput
          label={t("auth.login.passwordLabel")}
          placeholder={t("auth.login.passwordPlaceholder")}
          autoComplete="current-password"
          error={
            errors.password?.message ? translateErrorCode(t, errors.password.message) : undefined
          }
          {...register("password")}
        />

        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="w-full h-12 flex items-center justify-center rounded-xl bg-indigo-600 text-base font-semibold text-on-solid shadow-sm transition-colors hover:bg-indigo-700 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-50 cursor-pointer"
        >
          {loginMutation.isPending ? t("auth.login.submitting") : t("auth.login.submit")}
        </button>
      </form>

      <p className="mt-7 text-center text-base text-slate-500">
        {t("auth.login.newHere")}{" "}
        <Link
          to="/register"
          className="font-semibold text-indigo-600 transition-colors hover:text-indigo-500"
        >
          {t("auth.login.createAccountLink")}
        </Link>
      </p>
    </AuthLayout>
  );
}
