export function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="w-7 h-7 rounded-full glass-md flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-[10px] font-medium text-white/50">AI</span>
      </div>
      <div className="glass rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex items-center gap-1.5 h-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
