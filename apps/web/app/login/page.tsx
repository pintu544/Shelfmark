import type { Metadata } from "next";

import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign in" };

interface LoginPageProps {
  searchParams: Promise<{ reason?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { reason } = await searchParams;
  return <AuthForm mode="login" reason={reason} />;
}
