import { ArmamentView, armamentMetadata } from "@/views/armament";

export const metadata = armamentMetadata("en");

export default function Page() {
  return <ArmamentView locale="en" />;
}
