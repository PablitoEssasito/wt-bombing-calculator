import { WeaponPageView, weaponIds, weaponMetadata } from "@/views/weapon";

export function generateStaticParams() {
  return weaponIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/pl/armament/[id]">) {
  const { id } = await params;
  return weaponMetadata("pl", id);
}

export default async function Page({ params }: PageProps<"/pl/armament/[id]">) {
  const { id } = await params;
  return <WeaponPageView locale="pl" id={id} />;
}
