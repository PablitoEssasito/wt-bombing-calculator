import { HomeView, homeMetadata } from "@/views/home";

export const metadata = homeMetadata("pl");

export default function Page() {
  return <HomeView locale="pl" />;
}
