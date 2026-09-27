import { MovedPage, movedBombIds, movedMetadata } from "@/views/moved";

export function generateStaticParams() {
  return movedBombIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/pl/bombs/[id]">) {
  const { id } = await params;
  return movedMetadata("pl", `/armament/${id}/`);
}

export default async function Page({ params }: PageProps<"/pl/bombs/[id]">) {
  const { id } = await params;
  return <MovedPage locale="pl" to={`/armament/${id}/`} />;
}
