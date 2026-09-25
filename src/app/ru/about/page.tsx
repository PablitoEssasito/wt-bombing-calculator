import { AboutView, aboutMetadata } from "@/views/about";

export const metadata = aboutMetadata("ru");

export default function Page() {
  return <AboutView locale="ru" />;
}
