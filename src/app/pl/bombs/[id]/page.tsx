import { MovedPage, movedBombIds, movedMetadata, movedTarget } from "@/views/moved";

export function generateStaticParams() {
  return movedBombIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/pl/bombs/[id]">) {
  const { id } = await params;
  return movedMetadata("pl", movedTarget(id));
}

export default async function Page({ params }: PageProps<"/pl/bombs/[id]">) {
  const { id } = await params;
  return <MovedPage locale="pl" to={movedTarget(id)} />;
}
