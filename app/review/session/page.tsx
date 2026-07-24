import type { Metadata } from "next";
import { ReviewPlayer } from "@/components/review/review-player";

export const metadata: Metadata = { title: "Quick Review" };
export default function ReviewSessionPage() { return <ReviewPlayer />; }
