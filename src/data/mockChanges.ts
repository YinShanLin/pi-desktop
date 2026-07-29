// Mock change list for the Changes tab in the right rail.
// TODO(P3): replace with a real diff tracker fed by edit/write tool calls.

export type MockChange = {
  id: string;
  filePath: string;
  added: number;
  removed: number;
  status: "modified" | "added" | "deleted";
  timestamp: number;
};

const m = (mins: number) => Date.now() - mins * 60_000;

export const mockChanges: MockChange[] = [
  {
    id: "c1",
    filePath: "src/components/Titlebar.tsx",
    added: 88,
    removed: 12,
    status: "added",
    timestamp: m(2),
  },
  {
    id: "c2",
    filePath: "src/components/SessionSidebar.tsx",
    added: 142,
    removed: 0,
    status: "added",
    timestamp: m(4),
  },
  {
    id: "c3",
    filePath: "src/components/RightRail.tsx",
    added: 96,
    removed: 0,
    status: "added",
    timestamp: m(5),
  },
  {
    id: "c4",
    filePath: "src/components/StatusBar.tsx",
    added: 41,
    removed: 0,
    status: "added",
    timestamp: m(7),
  },
  {
    id: "c5",
    filePath: "src/styles.css",
    added: 184,
    removed: 56,
    status: "modified",
    timestamp: m(9),
  },
  {
    id: "c6",
    filePath: "src/App.tsx",
    added: 23,
    removed: 412,
    status: "modified",
    timestamp: m(10),
  },
  {
    id: "c7",
    filePath: "src/hooks/useResizable.ts",
    added: 67,
    removed: 0,
    status: "added",
    timestamp: m(12),
  },
];

export const totalStats = (changes: MockChange[]) =>
  changes.reduce(
    (acc, c) => ({
      added: acc.added + c.added,
      removed: acc.removed + c.removed,
    }),
    { added: 0, removed: 0 },
  );
