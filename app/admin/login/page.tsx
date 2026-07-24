import { Suspense } from "react";
import { AdminLogin } from "@/components/admin/admin-login";

export default function AdminLoginPage() {
  return <Suspense fallback={<main className="min-h-screen bg-slate-950" />}><AdminLogin /></Suspense>;
}
