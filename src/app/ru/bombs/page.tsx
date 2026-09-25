import { BombsView, bombsMetadata } from "@/views/bombs";

export const metadata = bombsMetadata("ru");

export default function Page() {
  return <BombsView locale="ru" />;
}
