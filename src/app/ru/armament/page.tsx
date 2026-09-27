import { ArmamentView, armamentMetadata } from "@/views/armament";

export const metadata = armamentMetadata("ru");

export default function Page() {
  return <ArmamentView locale="ru" />;
}
