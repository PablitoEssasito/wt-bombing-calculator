import { CompareView, compareMetadata } from "@/views/compare";

export const metadata = compareMetadata("pl");

export default function Page() {
  return <CompareView locale="pl" />;
}
