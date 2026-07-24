import type { Metadata } from "next";
import { ReviewDashboard } from "@/components/review/review-dashboard";

export const metadata: Metadata = { title: "Review" };
export default function ReviewPage() { return <ReviewDashboard />; }
