// Mock file tree for the Files tab in the right rail.
// TODO(P4): replace with real filesystem walk via tauri-plugin-fs.

export type MockFileNode = {
  name: string;
  path: string;
  kind: "file" | "dir";
  modified?: boolean; // M marker — set when a file was touched in the session
  children?: MockFileNode[];
};

export const mockFiles: MockFileNode[] = [
  {
    name: "pi-desktop",
    path: "~/AI/pi-desktop",
    kind: "dir",
    children: [
      {
        name: "src",
        path: "src",
        kind: "dir",
        children: [
          {
            name: "components",
            path: "src/components",
            kind: "dir",
            children: [
              { name: "App.tsx", path: "src/components/App.tsx", kind: "file" },
              { name: "Titlebar.tsx", path: "src/components/Titlebar.tsx", kind: "file", modified: true },
              { name: "SessionSidebar.tsx", path: "src/components/SessionSidebar.tsx", kind: "file", modified: true },
              { name: "RightRail.tsx", path: "src/components/RightRail.tsx", kind: "file", modified: true },
              { name: "StatusBar.tsx", path: "src/components/StatusBar.tsx", kind: "file", modified: true },
              { name: "Composer.tsx", path: "src/components/Composer.tsx", kind: "file" },
              { name: "ToolCard.tsx", path: "src/components/ToolCard.tsx", kind: "file" },
            ],
          },
          {
            name: "hooks",
            path: "src/hooks",
            kind: "dir",
            children: [
              { name: "useResizable.ts", path: "src/hooks/useResizable.ts", kind: "file", modified: true },
              { name: "useShortcuts.ts", path: "src/hooks/useShortcuts.ts", kind: "file", modified: true },
            ],
          },
          { name: "App.tsx", path: "src/App.tsx", kind: "file", modified: true },
          { name: "main.tsx", path: "src/main.tsx", kind: "file" },
          { name: "pi.ts", path: "src/pi.ts", kind: "file" },
          { name: "styles.css", path: "src/styles.css", kind: "file", modified: true },
        ],
      },
      {
        name: "src-tauri",
        path: "src-tauri",
        kind: "dir",
        children: [
          { name: "src", path: "src-tauri/src", kind: "dir", children: [] },
          { name: "Cargo.toml", path: "src-tauri/Cargo.toml", kind: "file" },
          { name: "tauri.conf.json", path: "src-tauri/tauri.conf.json", kind: "file" },
        ],
      },
      { name: "package.json", path: "package.json", kind: "file" },
      { name: "PROGRESS.md", path: "PROGRESS.md", kind: "file" },
      { name: "README.md", path: "README.md", kind: "file" },
    ],
  },
];
