import { List, ActionPanel, Action, Icon, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { listAppFiles, getCommonDataFolders, pullFile } from "../utils/adb";
import { AppFile } from "../types";
import path from "path";

interface AppExplorerViewProps {
  packageName: string;
  initialPath?: string;
}

export function AppExplorerView({ packageName, initialPath }: AppExplorerViewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [files, setFiles] = useState<AppFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>(initialPath || `/data/data/${packageName}`);

  // Load files for the current path
  useEffect(() => {
    async function fetchFiles() {
      try {
        setIsLoading(true);
        const result = await listAppFiles(packageName, currentPath);
        setFiles(result);
      } catch (error) {
        setError((error as Error).message);
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to list files",
          message: (error as Error).message,
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchFiles();
  }, [packageName, currentPath]);

  // Get common folders for quick navigation
  const commonFolders = getCommonDataFolders(packageName);

  // Handle directory navigation
  const navigateToDirectory = (dir: AppFile) => {
    setCurrentPath(dir.path);
  };

  // Handle file download
  const handlePullFile = async (file: AppFile) => {
    try {
      setIsLoading(true);
      const outputPath = await pullFile(file.path);
      await showToast({
        style: Toast.Style.Success,
        title: "File Downloaded",
        message: path.basename(outputPath),
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to download file",
        message: (error as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Navigate up one directory
  const navigateUp = () => {
    const parentPath = path.dirname(currentPath);
    if (parentPath !== currentPath) {
      setCurrentPath(parentPath);
    }
  };

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search files and directories..."
      navigationTitle={`Files: ${path.basename(currentPath)}`}
    >
      <List.Section title="Current Location">
        <List.Item
          title={currentPath}
          icon={Icon.Folder}
          actions={
            <ActionPanel>
              <Action
                title="Navigate Up"
                icon={Icon.ArrowUp}
                shortcut={{ modifiers: ["cmd"], key: "u" }}
                onAction={navigateUp}
              />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title="Quick Navigation">
        {commonFolders.map((folder) => (
          <List.Item
            key={folder.path}
            title={folder.name}
            icon={Icon.Bookmark}
            actions={
              <ActionPanel>
                <Action title="Navigate to Directory" icon={Icon.Folder} onAction={() => setCurrentPath(folder.path)} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      <List.Section title="Files and Directories">
        {error ? (
          <List.Item title="Error Loading Files" subtitle={error} icon={Icon.Warning} />
        ) : files.length === 0 ? (
          <List.Item title="No Files Found" icon={Icon.ExclamationMark} />
        ) : (
          files.map((file) => (
            <List.Item
              key={file.path}
              title={file.name}
              subtitle={file.isDirectory ? "Directory" : `${file.size || ""}`}
              icon={file.isDirectory ? Icon.Folder : Icon.Document}
              accessories={[{ text: file.date || "" }]}
              actions={
                <ActionPanel>
                  {file.isDirectory ? (
                    <Action title="Open Directory" icon={Icon.Folder} onAction={() => navigateToDirectory(file)} />
                  ) : (
                    <Action title="Download File" icon={Icon.Download} onAction={() => handlePullFile(file)} />
                  )}
                </ActionPanel>
              }
            />
          ))
        )}
      </List.Section>
    </List>
  );
}
