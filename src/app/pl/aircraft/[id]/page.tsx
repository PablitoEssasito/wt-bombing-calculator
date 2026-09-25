import { AircraftPageView, aircraftIds, aircraftMetadata } from "@/views/aircraft";

export function generateStaticParams() {
  return aircraftIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/pl/aircraft/[id]">) {
  const { id } = await params;
  return aircraftMetadata("pl", id);
}

export default async function Page({ params }: PageProps<"/pl/aircraft/[id]">) {
  const { id } = await params;
  return <AircraftPageView locale="pl" id={id} />;
}
