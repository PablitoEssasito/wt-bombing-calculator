import { MovedPage, movedBombIds, movedMetadata, movedTarget } from "@/views/moved";

export function generateStaticParams() {
  return movedBombIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/ru/bombs/[id]">) {
  const { id } = await params;
  return movedMetadata("ru", movedTarget(id));
}

export default async function Page({ params }: PageProps<"/ru/bombs/[id]">) {
  const { id } = await params;
  return <MovedPage locale="ru" to={movedTarget(id)} />;
}
