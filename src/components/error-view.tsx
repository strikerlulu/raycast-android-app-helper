import { List, Icon } from "@raycast/api";

interface ErrorViewProps {
  error: string;
}

export function ErrorView({ error }: ErrorViewProps) {
  return <List.EmptyView icon={Icon.Warning} title="Error" description={error} />;
}
