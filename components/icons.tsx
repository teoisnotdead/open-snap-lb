/**
 * Íconos como SVG inline, sin emoji ni fuentes de íconos: escalan, se
 * recolorean con `currentColor` y no agregan un request.
 * Todos sobre una grilla de 20 y trazo 1.5.
 */

type IconProps = { className?: string; size?: number };

function base({ size = 17, className }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none" as const,
    className,
    "aria-hidden": true,
  };
}

export function LogoMark({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" className={className} aria-hidden>
      <path d="M11 1.5 L20.5 11 L11 20.5 L1.5 11 Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M11 6.5 L15.5 11 L11 15.5 L6.5 11 Z" fill="currentColor" />
    </svg>
  );
}

export function TwitchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 2.5h13v9.5l-3.7 3.7h-3l-2.3 2.3v-2.3H4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9.2 6.2v4M13.2 6.2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function YouTubeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="1.8" y="4.5" width="16.4" height="11" rx="3.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.4 7.9 L12.8 10 L8.4 12.1 Z" fill="currentColor" />
    </svg>
  );
}

export function UntappedIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 1.9 L17.4 6.1 v7.8 L10 18.1 L2.6 13.9 V6.1 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6.9 11.8 v-2.4 M10 11.8 V7.7 M13.1 11.8 v-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <circle cx="7.2" cy="7.2" r="4.7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.8 10.8 L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ size = 12, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <path d="M2.5 6.2 L4.8 8.5 L9.5 3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckCircleIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className={className} aria-hidden>
      <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.4 9.2 L7.8 11.6 L12.6 6.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WarningIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path d="M8 2 L14.4 13.4 H1.6 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.6v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.6" r="0.75" fill="currentColor" />
    </svg>
  );
}

export function ClockIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" className={className} aria-hidden>
      <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 4.2 V7.2 L9 8.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyIcon({ size = 13, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" className={className} aria-hidden>
      <rect x="4.6" y="4.6" width="7.8" height="7.8" rx="1.8" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M9.6 4.6V3.4a1.8 1.8 0 0 0-1.8-1.8H3.4a1.8 1.8 0 0 0-1.8 1.8v4.4a1.8 1.8 0 0 0 1.8 1.8h1.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" className={className} aria-hidden>
      <path d="M8.6 3 L4.4 7 L8.6 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SpinnerIcon({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.6" opacity="0.25" />
      <path d="M8 1.8 A6.2 6.2 0 0 1 14.2 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
