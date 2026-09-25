import { BombsView, bombsMetadata } from "@/views/bombs";

export const metadata = bombsMetadata("pl");

export default function Page() {
  return <BombsView locale="pl" />;
}
