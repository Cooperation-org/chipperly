// The owner's symmetric Chipperly star, same geometry as the app's
// apps/web/components/ui/ChipStar.tsx: the chip on the board and the check
// mark on a done task. `rays` lights that many of the 12 rays (a routine's
// steps build the chip up ray by ray); `muted` is the unearned grey chip.
const RAYS: ReadonlyArray<readonly [string, string]> = [
  ['#df5a20', 'M408.242 382.556 500 0l91.758 382.556z'],
  ['#f89c10', 'M479.258 352.412 750 66.988 638.186 444.169z'],
  ['#df5a20', 'M555.831 361.814 933.013 250 647.588 520.742z'],
  ['#b5d222', 'M617.444 408.242 1000 500l-382.556 91.758z'],
  ['#fddf1e', 'M647.588 479.258 933.013 750 555.831 638.186z'],
  ['#f89c10', 'M638.186 555.831 750 933.013 479.258 647.588z'],
  ['#df5a20', 'M591.758 617.444 500 1000l-91.758-382.556z'],
  ['#f89c10', 'M520.742 647.588 250 933.013l111.814-377.182z'],
  ['#fddf1e', 'M444.169 638.186 66.988 750l285.424-270.742z'],
  ['#b5d222', 'M382.556 591.758 0 500l382.556-91.758z'],
  ['#24a6e1', 'M352.412 520.742 66.988 250l377.181 111.814z'],
  ['#815e98', 'M361.814 444.169 250 66.988l270.742 285.424z'],
];

const GREY = '#8a8479';

export function ChipStar({ size = 28, muted = false, rays, className }: { size?: number | string; muted?: boolean; rays?: number; className?: string }) {
  const partial = rays !== undefined && rays < RAYS.length;
  return (
    <svg viewBox="0 0 1000 1000" width={size} height={size} className={className} aria-hidden="true" focusable="false" data-chipstar="">
      {RAYS.map(([fill, d], i) => {
        const lit = !muted && (rays === undefined || i < rays);
        return <path key={d} d={d} fill={lit ? fill : GREY} opacity={lit ? 1 : muted ? 0.4 : 0.28} style={{ transition: 'fill 0.2s, opacity 0.2s' }} />;
      })}
      <circle cx="500" cy="500" r="200" fill={muted ? '#ece6dc' : partial ? '#ece6dc' : '#13b6a5'} style={{ transition: 'fill 0.2s' }} />
    </svg>
  );
}
