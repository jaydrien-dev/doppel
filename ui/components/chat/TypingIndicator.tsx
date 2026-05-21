interface TypingIndicatorProps {
  cloneInitial?: string;
  cloneColor?: string;
}

export function TypingIndicator({ cloneInitial = "A", cloneColor = "#1A73E8" }: TypingIndicatorProps) {
  return (
    <div className="msg msg--ai">
      <div className="msg__av" style={{ background: cloneColor }}>{cloneInitial}</div>
      <div className="typing">
        <span className="typing__dot" />
        <span className="typing__dot" />
        <span className="typing__dot" />
      </div>
    </div>
  );
}
