import { Detail, ActionPanel, Action, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { getPackageDetails, getAppPermissions, getAppActivities, getAppServices } from "../utils/adb";
import { PackageInfo } from "../types";

interface PackageDetailsViewProps {
  packageName: string;
}

export function PackageDetailsView({ packageName }: PackageDetailsViewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [details, setDetails] = useState<Partial<PackageInfo>>({});
  const [permissions, setPermissions] = useState<string[]>([]);
  const [activities, setActivities] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDetails() {
      try {
        setIsLoading(true);

        // Fetch package details in parallel
        const [detailsResult, permissionsResult, activitiesResult, servicesResult] = await Promise.all([
          getPackageDetails(packageName),
          getAppPermissions(packageName),
          getAppActivities(packageName),
          getAppServices(packageName),
        ]);

        setDetails(detailsResult);
        setPermissions(permissionsResult);
        setActivities(activitiesResult);
        setServices(servicesResult);
      } catch (error) {
        setError((error as Error).message);
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to fetch package details",
          message: (error as Error).message,
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchDetails();
  }, [packageName]);

  // Format the markdown content
  const markdown = `
# ${packageName}

## Basic Information
- **Version Name**: ${details.versionName || "Unknown"}
- **Version Code**: ${details.versionCode || "Unknown"}
- **Target SDK**: ${details.targetSdk || "Unknown"}
- **First Install**: ${details.firstInstallTime || "Unknown"}
- **Last Update**: ${details.lastUpdateTime || "Unknown"}
- **APK Path**: ${details.apkPath || "Unknown"}
- **Data Path**: ${details.dataPath || "/data/data/" + packageName}

## Permissions (${permissions.length})
${permissions.length > 0 ? permissions.map((perm) => `- \`${perm}\``).join("\n") : "No permissions found"}

## Activities (${activities.length})
${activities.length > 0 ? activities.map((activity) => `- \`${activity}\``).join("\n") : "No activities found"}

## Services (${services.length})
${services.length > 0 ? services.map((service) => `- \`${service}\``).join("\n") : "No services found"}
`;

  return (
    <Detail
      isLoading={isLoading}
      markdown={error ? `# Error\n${error}` : markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Details" content={markdown} shortcut={{ modifiers: ["cmd"], key: "c" }} />
        </ActionPanel>
      }
    />
  );
}
