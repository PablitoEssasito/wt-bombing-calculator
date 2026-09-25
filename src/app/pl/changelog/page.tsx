import { ChangelogView, changelogMetadata } from "@/views/changelog";

export const metadata = changelogMetadata("pl");

export default function Page() {
  return <ChangelogView locale="pl" />;
}
