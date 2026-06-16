import { ActionPanel, List, showToast, Toast, Icon, Color } from "@raycast/api";
import { useEffect, useState } from "react";
import { getFridaApps } from "./utils/frida";
import { PackageInfo } from "./types";
import { PackageActions } from "./components/PackageActions";

export default function FridaAppsCommand() {
  const [isLoading, setIsLoading] = useState(true);
  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    async function loadPackages() {
      try {
        setIsLoading(true);
        // Get apps using Frida
        const apps = await getFridaApps();
        setPackages(apps.sort((a, b) => (a.appName || a.name).localeCompare(b.appName || b.name)));

        // Debug: Log app names
        apps.forEach((app) => {
          console.log(`Frida App: ${app.name}, AppName: ${app.appName || "N/A"}`);
        });
      } catch (error) {
        setError((error as Error).message);
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to fetch apps with Frida",
          message: (error as Error).message,
        });
      } finally {
        setIsLoading(false);
      }
    }

    loadPackages();
  }, []);

  // Add searchable fields
  const filteredPackages = packages.filter(
    (pkg) =>
      pkg.name.toLowerCase().includes(searchText.toLowerCase()) ||
      (pkg.appName && pkg.appName.toLowerCase().includes(searchText.toLowerCase())),
  );

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search Android apps..."
      throttle
    >
      {error ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Error"
          description={`${error}\n\nMake sure Frida is installed (pip install frida-tools) and that a device or emulator is connected. If using a device, ensure frida-server is running on the device or set the Frida Binaries Path preference.`}
        />
      ) : filteredPackages.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="No apps found"
          description={searchText ? "Try a different search term" : "No apps found or Frida cannot connect to device"}
        />
      ) : (
        filteredPackages.map((pkg) => (
          <List.Item
            key={pkg.name}
            // Show app name if available, otherwise package name
            title={pkg.appName || pkg.name}
            icon={pkg.isSystemApp ? Icon.Shield : Icon.Document}
            subtitle={pkg.name}
            accessories={[
              { tag: { value: "Android", color: Color.Purple }, tooltip: "Listed by Frida when available" },
              ...(!pkg.appName
                ? [{ tag: { value: "No App Name", color: Color.Orange }, tooltip: "App name not available" }]
                : []),
            ]}
            actions={
              <ActionPanel>
                <PackageActions
                  package={pkg}
                  onPackageRemoved={() => setPackages(packages.filter((p) => p.name !== pkg.name))}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
