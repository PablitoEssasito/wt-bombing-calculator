import { MovedPage, movedMetadata } from "@/views/moved";

export const metadata = movedMetadata("pl", "/armament/");

export default function Page() {
  return <MovedPage locale="pl" to="/armament/" />;
}
