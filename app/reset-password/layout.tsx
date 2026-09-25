import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Verify your AIko password-reset code and choose a new password.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/reset-password" },
};

export default function ResetPasswordLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
