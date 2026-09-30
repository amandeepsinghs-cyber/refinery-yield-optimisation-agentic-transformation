import type { Metadata } from "next";
import { KnowledgeLibraryView } from "@/components/views/KnowledgeViews";

export const metadata: Metadata = { title: "Knowledge" };

export default function Page() {
  return <KnowledgeLibraryView />;
}
