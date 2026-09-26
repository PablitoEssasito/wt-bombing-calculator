import { BombPageView, bombIds, bombMetadata } from "@/views/bomb";

export function generateStaticParams() {
  return bombIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/pl/bombs/[id]">) {
  const { id } = await params;
  return bombMetadata("pl", id);
}

export default async function Page({ params }: PageProps<"/pl/bombs/[id]">) {
  const { id } = await params;
  return <BombPageView locale="pl" id={id} />;
}
