import { CompareView, compareMetadata } from "@/views/compare";

export const metadata = compareMetadata("en");

export default function Page() {
  return <CompareView locale="en" />;
}
