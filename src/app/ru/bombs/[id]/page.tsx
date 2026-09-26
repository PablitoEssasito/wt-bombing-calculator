import { BombPageView, bombIds, bombMetadata } from "@/views/bomb";

export function generateStaticParams() {
  return bombIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/ru/bombs/[id]">) {
  const { id } = await params;
  return bombMetadata("ru", id);
}

export default async function Page({ params }: PageProps<"/ru/bombs/[id]">) {
  const { id } = await params;
  return <BombPageView locale="ru" id={id} />;
}
