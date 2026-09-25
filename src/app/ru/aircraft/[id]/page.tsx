import { AircraftPageView, aircraftIds, aircraftMetadata } from "@/views/aircraft";

export function generateStaticParams() {
  return aircraftIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/ru/aircraft/[id]">) {
  const { id } = await params;
  return aircraftMetadata("ru", id);
}

export default async function Page({ params }: PageProps<"/ru/aircraft/[id]">) {
  const { id } = await params;
  return <AircraftPageView locale="ru" id={id} />;
}
