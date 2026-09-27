import { WeaponPageView, weaponIds, weaponMetadata } from "@/views/weapon";

export function generateStaticParams() {
  return weaponIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/ru/armament/[id]">) {
  const { id } = await params;
  return weaponMetadata("ru", id);
}

export default async function Page({ params }: PageProps<"/ru/armament/[id]">) {
  const { id } = await params;
  return <WeaponPageView locale="ru" id={id} />;
}
