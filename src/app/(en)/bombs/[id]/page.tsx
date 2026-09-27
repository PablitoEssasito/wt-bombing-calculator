import { MovedPage, movedBombIds, movedMetadata, movedTarget } from "@/views/moved";

export function generateStaticParams() {
  return movedBombIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/bombs/[id]">) {
  const { id } = await params;
  return movedMetadata("en", movedTarget(id));
}

export default async function Page({ params }: PageProps<"/bombs/[id]">) {
  const { id } = await params;
  return <MovedPage locale="en" to={movedTarget(id)} />;
}
