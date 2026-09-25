import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Request a password-reset code for your AIko account.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/forgot-password" },
};

export default function ForgotPasswordLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
