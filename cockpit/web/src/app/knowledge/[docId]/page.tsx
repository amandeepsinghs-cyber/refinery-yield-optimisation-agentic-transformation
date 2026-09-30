import type { Metadata } from "next";
import { KnowledgeDocView } from "@/components/views/KnowledgeViews";

type Props = {
  params: Promise<{ docId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { docId } = await params;
  return { title: `${decodeURIComponent(docId)} · Knowledge` };
}

/** /knowledge/{docId}?section=x.y — full document at the cited section (F24, H4 "Open in Knowledge"). */
export default async function Page({ params, searchParams }: Props) {
  const { docId } = await params;
  const sp = await searchParams;
  const raw = sp.section ?? sp.sec;
  const section = (Array.isArray(raw) ? raw[0] : raw)?.trim() || null;
  return <KnowledgeDocView docId={decodeURIComponent(docId)} section={section} />;
}
