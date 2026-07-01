/**
 * Animated aurora backdrop: a few large, blurred color blobs that drift slowly
 * behind the content. Purely decorative and pointer-transparent. Honors
 * prefers-reduced-motion via the CSS in index.css (animations are frozen).
 */
export default function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden grain">
      {/* Base radial vignette so edges fall off into the memorial bg. */}
      <div className="absolute inset-0 bg-memorial-bg" />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% -10%, rgba(201,168,106,0.10), transparent 60%)',
        }}
      />

      {/* Drifting glow blobs. */}
      <div className="absolute -left-32 -top-32 h-[42rem] w-[42rem] animate-drift-a rounded-full bg-aurora-gold/20 blur-[120px]" />
      <div className="absolute -right-40 top-1/4 h-[38rem] w-[38rem] animate-drift-b rounded-full bg-aurora-violet/25 blur-[130px]" />
      <div className="absolute bottom-[-12rem] left-1/3 h-[40rem] w-[40rem] animate-drift-c rounded-full bg-aurora-rose/20 blur-[140px]" />

      {/* Top + bottom fade to keep text readable. */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-memorial-bg to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-memorial-bg to-transparent" />
    </div>
  );
}
