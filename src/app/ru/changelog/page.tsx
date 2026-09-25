import { ChangelogView, changelogMetadata } from "@/views/changelog";

export const metadata = changelogMetadata("ru");

export default function Page() {
  return <ChangelogView locale="ru" />;
}
