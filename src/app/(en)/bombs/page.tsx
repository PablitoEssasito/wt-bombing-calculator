import { BombsView, bombsMetadata } from "@/views/bombs";

export const metadata = bombsMetadata("en");

export default function Page() {
  return <BombsView locale="en" />;
}
