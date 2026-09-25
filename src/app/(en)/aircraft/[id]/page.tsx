import { AircraftPageView, aircraftIds, aircraftMetadata } from "@/views/aircraft";

export function generateStaticParams() {
  return aircraftIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/aircraft/[id]">) {
  const { id } = await params;
  return aircraftMetadata("en", id);
}

export default async function Page({ params }: PageProps<"/aircraft/[id]">) {
  const { id } = await params;
  return <AircraftPageView locale="en" id={id} />;
}
