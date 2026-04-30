export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 rounded-full border border-white/20 border-t-white/60 animate-spin" />
    </div>
  );
}
