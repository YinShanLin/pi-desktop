import { memo, useEffect, useRef } from "react";
import { MessageRow } from "./MessageRow";
import type { Message } from "../types";

type Props = { messages: Message[] };

export const MessageList = memo(function MessageList({ messages }: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // Follow the stream only while the user is near the bottom; scrolling up
  // to read history must not yank the view back down on the next frame.
  const stickToBottomRef = useRef(true);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Auto-scroll on new content, coalesced into the next animation frame so
  // rAF-batched delta flushes cost at most one forced layout per frame.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickToBottomRef.current) return;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="messages empty-state" ref={scrollerRef} onScroll={handleScroll}>
        <div className="empty-card">
          <h2>Start a conversation</h2>
          <p>
            pi is a coding agent. Ask it to read files, run shell commands,
            search the web, or edit code. Click <strong>Start</strong> in the
            top-right to begin.
          </p>
          <div className="empty-shortcuts">
            <div className="empty-shortcut">
              <kbd>⌘N</kbd> <span>new chat</span>
            </div>
            <div className="empty-shortcut">
              <kbd>⌘B</kbd> <span>files panel</span>
            </div>
            <div className="empty-shortcut">
              <kbd>⌘J</kbd> <span>terminal</span>
            </div>
            <div className="empty-shortcut">
              <kbd>⌘K</kbd> <span>command palette</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="messages" ref={scrollerRef} onScroll={handleScroll}>
      {messages.map((m) => (
        <MessageRow key={m.id} message={m} />
      ))}
    </div>
  );
});
