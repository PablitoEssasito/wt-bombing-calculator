import { CompareView, compareMetadata } from "@/views/compare";

export const metadata = compareMetadata("ru");

export default function Page() {
  return <CompareView locale="ru" />;
}
