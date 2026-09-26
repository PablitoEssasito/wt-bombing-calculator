import { BombPageView, bombIds, bombMetadata } from "@/views/bomb";

export function generateStaticParams() {
  return bombIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/bombs/[id]">) {
  const { id } = await params;
  return bombMetadata("en", id);
}

export default async function Page({ params }: PageProps<"/bombs/[id]">) {
  const { id } = await params;
  return <BombPageView locale="en" id={id} />;
}
