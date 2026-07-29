import { FolderTree } from "lucide-react";
import { useEffect, useState } from "react";
import { readDir } from "@tauri-apps/plugin-fs";

type FileEntry = {
  name: string;
  path: string;
  kind: "file" | "dir";
  modified?: boolean;
};

type Props = {
  root: string;
};

export function SidebarFileTree({ root }: Props) {
  const [tree, setTree] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const entries = await readDir(root);
        if (!mounted) return;
        const mapped: FileEntry[] = entries.map((e) => ({
          name: e.name ?? "?",
          path: root + "/" + (e.name ?? ""),
          kind: e.isDirectory ? "dir" : "file",
        }));
        setTree(mapped);
      } catch (e: any) {
        if (mounted) setError(String(e?.message ?? e));
      }
    }
    load();
    return () => { mounted = false; };
  }, [root]);

  if (error) {
    return <div className="sidebar-empty">{error}</div>;
  }

  if (!tree) {
    return <div className="sidebar-empty">Loading…</div>;
  }

  return (
    <>
      <div className="sidebar-files-header">
        <span className="sidebar-files-path">{root}</span>
      </div>
      <div className="sidebar-scroll">
        {tree.map((entry) => (
          <FileTreeRow key={entry.path} entry={entry} depth={0} />
        ))}
      </div>
      <div className="sidebar-files-footer">
        <span>{tree.length} items</span>
      </div>
    </>
  );
}

function FileTreeRow({ entry, depth }: { entry: FileEntry; depth: number }) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<FileEntry[] | null>(null);
  const indent = { paddingLeft: 8 + depth * 12 };

  useEffect(() => {
    if (!open || entry.kind !== "dir" || children !== null) return;
    let mounted = true;
    readDir(entry.path).then((entries) => {
      if (!mounted) return;
      setChildren(
        entries.map((e) => ({
          name: e.name ?? "?",
          path: entry.path + "/" + (e.name ?? ""),
          kind: e.isDirectory ? "dir" : "file",
        })),
      );
    });
    return () => { mounted = false; };
  }, [open, entry, children]);

  if (entry.kind === "file") {
    return (
      <div className="file-row file" style={indent}>
        <span className="file-icon">·</span>
        <span className="file-name">{entry.name}</span>
      </div>
    );
  }

  return (
    <>
      <div className="file-row dir" style={indent} onClick={() => setOpen((v) => !v)}>
        <span className="file-caret">{open ? "▾" : "▸"}</span>
        <span className="file-icon"><FolderTree size={11} /></span>
        <span className="file-name">{entry.name}</span>
      </div>
      {open && children?.map((c) => (
        <FileTreeRow key={c.path} entry={c} depth={depth + 1} />
      ))}
    </>
  );
}
