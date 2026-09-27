import { MovedPage, movedMetadata } from "@/views/moved";

export const metadata = movedMetadata("en", "/armament/");

export default function Page() {
  return <MovedPage locale="en" to="/armament/" />;
}
