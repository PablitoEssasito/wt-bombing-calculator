import { WeaponPageView, weaponIds, weaponMetadata } from "@/views/weapon";

export function generateStaticParams() {
  return weaponIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/armament/[id]">) {
  const { id } = await params;
  return weaponMetadata("en", id);
}

export default async function Page({ params }: PageProps<"/armament/[id]">) {
  const { id } = await params;
  return <WeaponPageView locale="en" id={id} />;
}
