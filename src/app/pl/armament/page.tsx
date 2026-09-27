import { ArmamentView, armamentMetadata } from "@/views/armament";

export const metadata = armamentMetadata("pl");

export default function Page() {
  return <ArmamentView locale="pl" />;
}
