import { ChangelogView, changelogMetadata } from "@/views/changelog";

export const metadata = changelogMetadata("en");

export default function Page() {
  return <ChangelogView locale="en" />;
}
