import { HomeView, homeMetadata } from "@/views/home";

export const metadata = homeMetadata("ru");

export default function Page() {
  return <HomeView locale="ru" />;
}
