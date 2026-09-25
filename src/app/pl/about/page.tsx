import { AboutView, aboutMetadata } from "@/views/about";

export const metadata = aboutMetadata("pl");

export default function Page() {
  return <AboutView locale="pl" />;
}
