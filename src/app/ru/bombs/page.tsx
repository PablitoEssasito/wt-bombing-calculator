import { MovedPage, movedMetadata } from "@/views/moved";

export const metadata = movedMetadata("ru", "/armament/");

export default function Page() {
  return <MovedPage locale="ru" to="/armament/" />;
}
