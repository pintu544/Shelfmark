"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";

import { api, ApiError, messageFromError } from "@/lib/api";
import type { FieldErrors } from "@/lib/types";
import { useServiceReadiness } from "@/lib/use-service-readiness";

interface AuthFormProps {
  mode: "login" | "signup";
  reason?: string;
}

function validateAuth(
  mode: AuthFormProps["mode"],
  values: { name: string; email: string; password: string },
) {
  const errors: FieldErrors = {};
  if (mode === "signup" && values.name.trim().length < 2) {
    errors.name = "Enter at least 2 characters.";
  }
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (values.password.length < 8 || values.password.length > 128) {
    errors.password = "Use between 8 and 128 characters.";
  }
  return errors;
}

function reasonMessage(reason?: string) {
  if (reason === "session-expired") {
    return "Your session expired. Sign in again to return to your library.";
  }
  if (reason === "authentication-required") {
    return "Sign in to open your private library.";
  }
  return "";
}

export function AuthForm({ mode, reason }: AuthFormProps) {
  const isSignup = mode === "signup";
  const router = useRouter();
  const service = useServiceReadiness();
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function focusFirstInvalidField() {
    window.requestAnimationFrame(() => {
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };
    const validationErrors = validateAuth(mode, values);
    setFieldErrors(validationErrors);
    setFormError("");
    if (Object.keys(validationErrors).length > 0) {
      focusFirstInvalidField();
      return;
    }

    setSubmitting(true);
    try {
      if (isSignup) {
        await api.signup({
          name: values.name.trim(),
          email: values.email.trim(),
          password: values.password,
        });
      } else {
        await api.login({
          email: values.email.trim(),
          password: values.password,
        });
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        setFieldErrors(error.fields);
        focusFirstInvalidField();
      }
      setFormError(
        messageFromError(
          error,
          isSignup
            ? "Your account could not be created."
            : "You could not be signed in.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const notice = reasonMessage(reason);
  const serviceBusy = service.state === "checking" || service.state === "waking";

  return (
    <main id="main-content" className="auth-layout">
      <section className="auth-story" aria-label="About Shelfmark">
        <Link className="brand brand--light" href="/">
          <span className="brand__mark" aria-hidden="true">
            S
          </span>
          <span>Shelfmark</span>
        </Link>
        <div className="auth-story__copy">
          <p className="eyebrow eyebrow--light">Your reading life, in one place</p>
          <h1>A quiet home for every book that stays with you.</h1>
          <p>
            Keep the books you want, the ones you are living in, and the stories
            you will carry forward.
          </p>
        </div>
        <p className="auth-story__folio" aria-hidden="true">
          Personal library · Vol. I
        </p>
      </section>

      <section className="auth-panel">
        <div className="auth-panel__inner">
          <div className={`service-state service-state--${service.state}`} role="status">
            <span className="service-state__dot" aria-hidden="true" />
            {service.state === "checking" && "Checking the library service…"}
            {service.state === "waking" && "Waking the library service…"}
            {service.state === "ready" && "Library service ready"}
            {service.state === "unavailable" && "Library service unavailable"}
          </div>

          <header className="auth-heading">
            <p className="eyebrow">{isSignup ? "Begin your collection" : "Welcome back"}</p>
            <h2>{isSignup ? "Create your library" : "Return to your shelves"}</h2>
            <p>
              {isSignup
                ? "A private space, ready for the books that matter to you."
                : "Sign in to continue where you left off."}
            </p>
          </header>

          {notice && <div className="notice notice--info">{notice}</div>}

          {service.state === "unavailable" && (
            <div className="notice notice--error" role="alert">
              <span>{service.error}</span>
              <button className="text-button" type="button" onClick={() => void service.retry()}>
                Try waking it again
              </button>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate ref={formRef}>
            {isSignup && (
              <label className="field">
                <span className="field__label">Name</span>
                <input
                  aria-describedby={fieldErrors.name ? "name-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.name)}
                  autoComplete="name"
                  maxLength={80}
                  name="name"
                  placeholder="How should we greet you?"
                  required
                  type="text"
                />
                {fieldErrors.name && (
                  <span className="field__error" id="name-error">
                    {fieldErrors.name}
                  </span>
                )}
              </label>
            )}

            <label className="field">
              <span className="field__label">Email address</span>
              <input
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                aria-invalid={Boolean(fieldErrors.email)}
                autoCapitalize="none"
                autoComplete="email"
                name="email"
                placeholder="reader@example.com"
                required
                spellCheck={false}
                type="email"
              />
              {fieldErrors.email && (
                <span className="field__error" id="email-error">
                  {fieldErrors.email}
                </span>
              )}
            </label>

            <label className="field">
              <span className="field__label">Password</span>
              <input
                aria-describedby={
                  fieldErrors.password
                    ? "password-error"
                    : isSignup
                      ? "password-hint"
                      : undefined
                }
                aria-invalid={Boolean(fieldErrors.password)}
                autoComplete={isSignup ? "new-password" : "current-password"}
                maxLength={128}
                minLength={8}
                name="password"
                required
                type="password"
              />
              {fieldErrors.password ? (
                <span className="field__error" id="password-error">
                  {fieldErrors.password}
                </span>
              ) : isSignup ? (
                <span className="field__hint" id="password-hint">
                  8–128 characters
                </span>
              ) : null}
            </label>

            {formError && (
              <div className="notice notice--error" role="alert">
                {formError}
              </div>
            )}

            <button
              className="button button--primary button--full"
              disabled={submitting || service.state !== "ready"}
              type="submit"
            >
              {submitting
                ? isSignup
                  ? "Creating your library…"
                  : "Opening your library…"
                : isSignup
                  ? "Create account"
                  : "Sign in"}
            </button>

            {serviceBusy && (
              <p className="auth-form__waiting" role="status">
                The form will be ready as soon as the service responds.
              </p>
            )}
          </form>

          <p className="auth-switch">
            {isSignup ? "Already have a library?" : "New to Shelfmark?"}{" "}
            <Link href={isSignup ? "/login" : "/signup"}>
              {isSignup ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
