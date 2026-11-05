import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { authApi } from "../../api/auth";
import { registerSchema, type RegisterInput } from "../../api/authSchemas";
import { useAuthStore } from "../../store/useAuthStore";
import { Input } from "../../components/ui/Input";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
            {t("auth.register.title")}
          </h2>
          <p className="mt-2 text-center text-sm text-slate-600">
            {t("auth.register.haveAccountText")}{" "}
            <Link
              to="/login"
              className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
            >
              {t("auth.register.loginLink")}
            </Link>
          </p>
        </div>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          {errors.root && (
            <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600 border border-red-100">
              {errors.root.message}
            </div>
          )}

          <Input
            label={t("auth.register.emailLabel")}
            type="email"
            placeholder="you@example.com"
            error={errors.email?.message ? translateErrorCode(t, errors.email.message) : undefined}
            {...register("email")}
          />

          <Input
            label={t("auth.register.passwordLabel")}
            type="password"
            placeholder="••••••••"
            error={
              errors.password?.message ? translateErrorCode(t, errors.password.message) : undefined
            }
            {...register("password")}
          />

          <Input
            label={t("auth.register.confirmPasswordLabel")}
            type="password"
            placeholder="••••••••"
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
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-xs text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-50 cursor-pointer mt-6"
          >
            {registerMutation.isPending ? t("auth.register.submitting") : t("auth.register.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
