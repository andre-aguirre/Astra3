import { runFolderForEntry, planDeletion, settleDeletion, describeProblems } from "./run-paths.js";
const { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } = React;

/* ============================================================
   ICONS: small, consistent stroke-based icon set (no external
   icon library dependency; kept minimal and purpose-built)
   ============================================================ */
const Icon = ({ name, size = 16, ...props }) => {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", ...props };
  const paths = {
    home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1v-9"/></>,
    analysis: <><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.5-4.5"/><path d="M8 11h6M11 8v6"/></>,
    reports: <><path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M15 3v5h5"/><path d="M8.5 13h7M8.5 16.5h7M8.5 9.5h3"/></>,
    citation: <><path d="M7 8c-1.5 0-2.5 1.2-2.5 3s1 3.5 2.5 3.5c.5 0 .8-.2.8-.2L7 17"/><path d="M14 8c-1.5 0-2.5 1.2-2.5 3s1 3.5 2.5 3.5c.5 0 .8-.2.8-.2L14 17"/><rect x="3" y="4" width="18" height="16" rx="2"/></>,
    viewer: <><path d="M12 3 3 7.5 12 12l9-4.5L12 3Z"/><path d="M3 16.5 12 21l9-4.5"/><path d="M3 12l9 4.5 9-4.5"/></>,
    batch: <><rect x="3.5" y="4" width="17" height="4.2" rx="1"/><rect x="3.5" y="10" width="17" height="4.2" rx="1"/><rect x="3.5" y="16" width="17" height="4.2" rx="1"/><path d="M17 6.1h1.5M17 12.1h1.5M17 18.1h1.5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></>,
    console: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/></>,
    overlay: <><rect x="4" y="4" width="12" height="12" rx="1.5"/><rect x="9" y="9" width="12" height="12" rx="1.5" fill="var(--bg-1)"/></>,
    termini: <><path d="M4 12h4"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><path d="M10 12c2-6 6-6 8 0"/><circle cx="20" cy="12" r="1.5" fill="currentColor"/></>,
    import: <><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 20h16"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    minus: <path d="M5 12h14"/>,
    x: <path d="M6 6l12 12M18 6 6 18"/>,
    check: <path d="M5 12l4.5 4.5L19 7"/>,
    wifi: <><path d="M2 8.5a16 16 0 0 1 20 0"/><path d="M5.5 12a11 11 0 0 1 13 0"/><path d="M9 15.5a6 6 0 0 1 6 0"/><path d="M12 19h.01"/></>,
    chevronRight: <path d="M9 6l6 6-6 6"/>,
    chevronDown: <path d="M6 9l6 6 6-6"/>,
    chevronUp: <path d="M6 15l6-6 6 6"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    folder: <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-11Z"/>,
    file: <><path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M15 3v5h5"/></>,
    play: <path d="M7 4.5v15l13-7.5-13-7.5Z"/>,
    upload: <><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V16"/></>,
    star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5Z"/>,
    starFilled: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5Z" fill="currentColor"/>,
    externalLink: <><path d="M14 4h6v6"/><path d="M10 14 20 4"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></>,
    trash: <><path d="M4 7h16"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M9.5 11v6M14.5 11v6"/><path d="M9 4h6l1 3H8l1-3Z"/></>,
    grip: <><circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none"/></>,
    bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M10 21a2 2 0 0 0 4 0"/></>,
    clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></>,
    alertTriangle: <><path d="M10.6 3.9 2.4 18.5A1.5 1.5 0 0 0 3.7 21h16.6a1.5 1.5 0 0 0 1.3-2.5L13.4 3.9a1.5 1.5 0 0 0-2.8 0Z"/><path d="M12 9.5v4.2"/><circle cx="12" cy="16.7" r="0.9" fill="currentColor" stroke="none"/></>,
    info: <><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none"/></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 3h9A1.5 1.5 0 0 1 15.5 4.5V5"/></>,
    dot: <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>,
    image: <><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17l5-5 3.5 3.5L17 11l3 3"/></>,
    pin: <path d="M12 21s7-7.4 7-12.5A7 7 0 0 0 5 8.5C5 13.6 12 21 12 21Zm0-9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>,
    keyboard: <><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M6.5 10h.01M9.5 10h.01M12.5 10h.01M15.5 10h.01M6.5 14h11"/></>,
    palette: <><path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.5 1.6-1.4 0-.4-.2-.8-.2-1.2 0-.9.7-1.4 1.6-1.4H17a4 4 0 0 0 4-4c0-5.5-4.5-10-9-10Z"/><circle cx="7.5" cy="11" r="1.1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="8" r="1.1" fill="currentColor" stroke="none"/></>,
    refresh: <><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></>,
    cube: <><path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z"/><path d="M4 7.5 12 12l8-4.5"/><path d="M12 12v9"/></>,
    related: <><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8.5 6h7M7.2 8.2l3.6 7.6M16.8 8.2l-3.6 7.6"/></>,
    layers: <><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="M3 12l9 5 9-5"/><path d="M3 16l9 5 9-5"/></>,
    eye: <><path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="2.7"/></>,
    eyeOff: <><path d="M3.5 3.5l17 17"/><path d="M10.6 5.2A9.7 9.7 0 0 1 12 5c6 0 9.5 7 9.5 7a13.8 13.8 0 0 1-3.1 3.9M6.3 6.7C4 8.3 2.5 12 2.5 12s3.5 7 9.5 7c1.4 0 2.6-.3 3.7-.8"/><path d="M9.9 9.9a2.7 2.7 0 0 0 3.8 3.8"/></>,
  };
  return <svg {...common}>{paths[name] || null}</svg>;
};

/* ============================================================
   LOGO: the real Astra3 mark (tools/ASTRA3_Logo_Icon.png), not a
   procedural placeholder. Size prop keeps every existing call site
   (nav rail, home hero, wordmark) unchanged.
   ============================================================ */
const AstraLogo = ({ size = 32, animated = false }) => (
  <img
    src="./assets/astra3-logo.png"
    alt="Astra3"
    width={size}
    height={size}
    className={animated ? "astra-logo-spin" : ""}
    style={{ display: "block", objectFit: "contain" }}
    draggable={false}
  />
);

const AstraWordmark = ({ size = "md" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <AstraLogo size={size === "lg" ? 40 : 30} />
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
      <span style={{ fontWeight: 700, fontSize: size === "lg" ? 22 : 17, letterSpacing: "0.01em" }}>Astra3</span>
      {size === "lg" && <span style={{ fontSize: 11, color: "var(--text-1)", letterSpacing: "0.04em" }}>STRUCTURAL ANALYSIS TOOLKIT</span>}
    </div>
  </div>
);

/* ============================================================
   SHARED PRIMITIVES
   ============================================================ */
const Button = ({ variant = "secondary", size = "md", icon, iconRight, children, className = "", style, ...props }) => {
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
    fontFamily: "var(--font-ui)", fontWeight: 600, cursor: "pointer",
    border: "1px solid transparent", borderRadius: "var(--radius-md)",
    transition: "all 120ms ease", whiteSpace: "nowrap",
  };
  const sizes = {
    sm: { padding: "5px 10px", fontSize: 12 },
    md: { padding: "8px 14px", fontSize: 13 },
    lg: { padding: "11px 18px", fontSize: 14 },
  };
  const variants = {
    primary: { background: "var(--accent)", color: "var(--text-on-accent)", borderColor: "var(--accent)" },
    secondary: { background: "var(--bg-3)", color: "var(--text-0)", borderColor: "var(--line-1)" },
    ghost: { background: "transparent", color: "var(--text-1)", borderColor: "transparent" },
    danger: { background: "transparent", color: "var(--coral)", borderColor: "var(--line-1)" },
    gold: { background: "var(--gold)", color: "#2B1D06", borderColor: "var(--gold)" },
    // Solid green/red for y/n answer buttons, where colour is the main cue.
    confirm: { background: "var(--sage)", color: "#0A1F14", borderColor: "var(--sage)" },
    decline: { background: "var(--coral)", color: "#2A0A08", borderColor: "var(--coral)" },
  };
  return (
    <button
      className={`astra-btn astra-btn-${variant} ${className}`}
      style={{ ...base, ...sizes[size], ...variants[variant], opacity: props.disabled ? 0.45 : 1, cursor: props.disabled ? "not-allowed" : "pointer", ...style }}
      {...props}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 13 : 15} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 13 : 15} />}
    </button>
  );
};

// className is merged rather than replaced: a caller passing one would
// otherwise drop "astra-iconbtn" and with it the shared hover styling.
const IconButton = ({ name, size = 16, title, active, className = "", ...props }) => (
  <button
    title={title}
    className={`astra-iconbtn ${className}`.trim()}
    style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 30, height: 30, borderRadius: "var(--radius-sm)", border: "1px solid transparent",
      background: active ? "var(--accent-wash)" : "transparent",
      color: active ? "var(--accent-bright)" : "var(--text-1)",
      cursor: "pointer", transition: "all 120ms ease",
    }}
    {...props}
  >
    <Icon name={name} size={size} />
  </button>
);

const Badge = ({ tone = "neutral", children, dot, style }) => {
  const tones = {
    neutral: { bg: "var(--bg-3)", fg: "var(--text-1)", bd: "var(--line-1)" },
    accent: { bg: "var(--accent-wash)", fg: "var(--accent-bright)", bd: "transparent" },
    success: { bg: "var(--sage-wash)", fg: "var(--sage)", bd: "transparent" },
    warning: { bg: "var(--amber-wash)", fg: "var(--amber)", bd: "transparent" },
    error: { bg: "var(--coral-wash)", fg: "var(--coral)", bd: "transparent" },
    violet: { bg: "rgba(110,142,232,0.14)", fg: "var(--violet)", bd: "transparent" },
    gold: { bg: "var(--gold-wash)", fg: "var(--gold-bright)", bd: "transparent" },
  };
  const t = tones[tone];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px",
      fontSize: 11, fontWeight: 600, borderRadius: 20, background: t.bg, color: t.fg,
      border: `1px solid ${t.bd}`, letterSpacing: "0.01em", lineHeight: 1.7,
      ...style,
    }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: t.fg }} />}
      {children}
    </span>
  );
};

const Card = ({ children, style = {}, onClick, hover = false, className = "" }) => (
  <div
    onClick={onClick}
    className={`astra-card ${hover ? "astra-card-hover" : ""} ${className}`}
    style={{
      background: "var(--bg-1)", border: "1px solid var(--line-0)", borderRadius: "var(--radius-lg)",
      cursor: onClick ? "pointer" : "default", ...style,
    }}
  >
    {children}
  </div>
);

// style is the <input>'s own; in a row, put the field in a
// <div style={{ flex: 1, minWidth: 0 }}> for it to take the row's width.
const TextInput = React.forwardRef(({ icon, mono, style = {}, ...props }, ref) => (
  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
    {icon && <span style={{ position: "absolute", left: 10, color: "var(--text-2)", display: "flex" }}><Icon name={icon} size={14} /></span>}
    <input
      ref={ref}
      {...props}
      style={{
        // --bg-1 on the --bg-0 page, like the Home cards; a --bg-0 field has no
        // contrast and its hairline alone is too faint in the dark theme.
        width: "100%", background: "var(--bg-1)", border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-md)", color: "var(--text-0)",
        padding: icon ? "9px 10px 9px 32px" : "9px 10px",
        fontSize: 13, fontFamily: mono ? "var(--font-mono)" : "var(--font-ui)",
        outline: "none", transition: "border-color 120ms ease", ...style,
      }}
      onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; props.onFocus && props.onFocus(e); }}
      onBlur={(e) => { e.target.style.borderColor = "var(--line-1)"; props.onBlur && props.onBlur(e); }}
    />
  </div>
));

// wrap: the options continue on a second row where they do not fit the width,
// rather than squeezing every label.
const SegmentedControl = ({ options, value, onChange, disabled = false, wrap = false }) => (
  <div style={{ display: "inline-flex", flexWrap: wrap ? "wrap" : "nowrap", background: "var(--bg-0)", borderRadius: "var(--radius-md)", padding: 3, border: "1px solid var(--line-0)", opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : "auto" }}>
    {options.map((opt) => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        disabled={disabled}
        style={{
          padding: "6px 13px", fontSize: 12.5, fontWeight: 600, borderRadius: "calc(var(--radius-md) - 2px)",
          border: "none", cursor: disabled ? "not-allowed" : "pointer", transition: "all 120ms ease",
          background: value === opt.value ? "var(--accent)" : "transparent",
          color: value === opt.value ? "var(--text-on-accent)" : "var(--text-1)",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}
      >
        {opt.icon && <Icon name={opt.icon} size={13} />}
        {opt.label}
      </button>
    ))}
  </div>
);

const Checkbox = ({ checked, onChange, label, description }) => (
  <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", padding: "8px 0" }}>
    <div
      onClick={(e) => { e.preventDefault(); onChange(!checked); }}
      style={{
        width: 18, height: 18, borderRadius: 5, marginTop: 1, flexShrink: 0,
        border: `1.5px solid ${checked ? "var(--accent)" : "var(--line-1)"}`,
        background: checked ? "var(--accent)" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 120ms ease",
      }}
    >
      {checked && <Icon name="check" size={12} stroke="var(--text-on-accent)" strokeWidth={2.6} />}
    </div>
    <div>
      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-0)" }}>{label}</div>
      {description && <div style={{ fontSize: 11.5, color: "var(--text-1)", marginTop: 1 }}>{description}</div>}
    </div>
  </label>
);

const Toggle = ({ checked, onChange }) => (
  <button
    onClick={() => onChange(!checked)}
    style={{
      width: 38, height: 22, borderRadius: 20, border: "none", cursor: "pointer",
      background: checked ? "var(--accent)" : "var(--bg-3)", position: "relative",
      transition: "background 150ms ease", flexShrink: 0,
    }}
  >
    <span style={{
      position: "absolute", top: 3, left: checked ? 19 : 3, width: 16, height: 16, borderRadius: "50%",
      background: checked ? "var(--text-on-accent)" : "var(--text-1)", transition: "left 150ms ease",
    }} />
  </button>
);

const Tooltip = ({ text, children, align = "center", placement = "top", block = false }) => {
  const [show, setShow] = useState(false);
  // placement="right" puts the tooltip beside its trigger, fixed to the
  // window at the trigger's right edge as the pointer arrived, so a
  // container that clips its overflow (the sidebar) cannot cut it off.
  const [beside, setBeside] = useState(null);
  // With no text the wrapper below is not rendered, so it cannot see the
  // pointer leave: a tooltip showing when its text went away came back with
  // the text and stayed on screen (closing the shortcuts panel left
  // "Keyboard shortcuts" up).
  useEffect(() => { if (!text) setShow(false); }, [text]);
  if (!text) return children; // no text means no tooltip
  const alignStyle = align === "right"
    ? { right: 0, left: "auto", transform: "none" }
    : align === "left"
      ? { left: 0, transform: "none" }
      : { left: "50%", transform: "translateX(-50%)" };
  // placement="bottom" for triggers at the top of the window, where a tooltip
  // above would be clipped.
  const placementStyle = placement === "right"
    ? { position: "fixed", left: beside ? beside.left : 0, top: beside ? beside.top : 0, transform: "translateY(-50%)" }
    : placement === "bottom"
      ? { top: "calc(100% + 6px)", bottom: "auto" }
      : { bottom: "calc(100% + 6px)", top: "auto" };
  const enter = (e) => {
    if (placement === "right") {
      const r = e.currentTarget.getBoundingClientRect();
      setBeside({ left: r.right + 8, top: r.top + r.height / 2 });
    }
    setShow(true);
  };
  // block: the wrapper fills its row, for a control that is itself full
  // width (the sidebar buttons; inline, the collapsed sidebar put its icons
  // two to a row).
  return (
    <div style={{ position: "relative", display: block ? "flex" : "inline-flex" }} onMouseEnter={enter} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div style={{
          position: "absolute", ...(placement === "right" ? placementStyle : { ...placementStyle, ...alignStyle }),
          background: "var(--bg-3)", color: "var(--text-0)", fontSize: 11.5, padding: "5px 9px",
          borderRadius: "var(--radius-sm)", whiteSpace: "nowrap", zIndex: 200, border: "1px solid var(--line-1)",
          boxShadow: "var(--shadow-sm)", pointerEvents: "none",
        }}>
          {text}
        </div>
      )}
    </div>
  );
};

// Strips SGR colour codes, the only escape sequences Astra3 prints. Console
// lines are stored raw for colouring, so content matching must strip first.
function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

// Progress for one run (SINGLE, OVERLAY, TERMINI, or one BATCH item).
//
// Astra3 prints no percentage: its fixed sequence of stage lines places the run
// coarsely, and its per-image lines carry it through rendering. Patterns match
// stripped text and real print statements in astra3.py,
// astra3_structure.py and astra3_render_report.py.

const RENDER_FLOOR = 38;
const RENDER_CEILING = 95;
const FINISHING_PCT = 97;

// render_views renders a fixed six views per whole-structure render, so one
// "Taking pictures of:" line promises exactly six images.
const VIEWS_PER_RENDER = 6;

// Two angles per terminus, and most comparisons have both an N- and a
// C-terminus. A starting figure only: each comparison prints its own exact
// count when it finishes, and whatever comparisons remain are re-estimated
// from that real number.
const CLOSEUPS_PER_COMPARISON = 4;

// Keeps the bar moving through the first images, before a rate can be
// measured. Never shown as a time estimate.
const ASSUMED_IMAGE_MS = 20000;

// Report/session/export work that follows the last image.
const TAIL_MS = 4000;

// `pct`: where the bar starts in the stage. `seconds`: roughly how long the
// stage lasts, used only for how fast the bar creeps toward the next floor.
const ANALYSIS_STAGES = [
  { pct: 5, seconds: 15, label: "Loading structures", test: /^(Fetching |Processing: |Starting alignment of )/ },
  { pct: 12, seconds: 12, label: "Reading chains", test: /^(Chain \S+ named |Ligand named |Ion named |N-Terminus: |C-Terminus: )/ },
  { pct: 18, seconds: 10, label: "Structures loaded", test: /^Finished processing:/ },
  { pct: 24, seconds: 12, label: "Aligning", test: /^(Aligned \S+ to |Reference structure:)/ },
  { pct: 30, seconds: 5, label: "Writing report", test: /^(Report saved:|Overlay report saved:)/ },
  { pct: 34, seconds: 6, label: "Saving session", test: /^Session saved:/ },
  {
    pct: RENDER_FLOOR, seconds: 0, label: "Rendering views",
    test: /^(Taking pictures of:|Saving images to:|Rendering close-up terminus views for|Rendering whole-structure views for)/,
  },
];

const RUN_LINE_IMAGE_SAVED = /^Saved (view_|closeup_)/;
const RUN_LINE_VIEW_GROUP = /^Taking pictures of:/;
const RUN_LINE_CLOSEUP_GROUP = /^Rendering close-up terminus views for/;
const RUN_LINE_COMPARISON_DONE = /^(\d+) image\(s\) rendered for /;
const RUN_LINE_FINISHED = /^(HTML report saved:|Output folder:|Process complete!)/;

function newRunScan() {
  return {
    stageIndex: -1,
    stageAt: 0,
    imagesSaved: 0,
    imageTimes: [],
    viewImages: 0,
    closeupGroups: 0,
    comparisonsDone: 0,
    lastComparisonImages: 0,
    finished: false,
  };
}

// Applies one console line to a scan, in place; incremental so a long BATCH
// is not rescanned on every line.
function applyRunLine(scan, entry) {
  const raw = typeof entry === "string" ? entry : (entry && entry.text) || "";
  const text = stripAnsi(raw).trim();
  if (!text) return;
  const at = entry && typeof entry.at === "number" ? entry.at : 0;

  // The FURTHEST stage reached, not the last one matched: a late mention of
  // an early stage (a second structure being processed, OVERLAY printing its
  // report line after rendering) would otherwise drag the bar backwards.
  for (let i = ANALYSIS_STAGES.length - 1; i > scan.stageIndex; i -= 1) {
    if (ANALYSIS_STAGES[i].test.test(text)) {
      scan.stageIndex = i;
      scan.stageAt = at || scan.stageAt;
      break;
    }
  }

  if (RUN_LINE_IMAGE_SAVED.test(text)) {
    scan.imagesSaved += 1;
    if (at) {
      scan.imageTimes.push(at);
      // Only the recent ones are ever read, and a TERMINI run saves a lot.
      if (scan.imageTimes.length > 8) scan.imageTimes.shift();
    }
    return;
  }
  if (RUN_LINE_VIEW_GROUP.test(text)) {
    // A trimmed render names its view count ("... (2 views)"); a full one
    // does not, and holds all six.
    const trimmed = /\((\d+) views?\)\s*$/.exec(text);
    scan.viewImages += trimmed ? Number(trimmed[1]) : VIEWS_PER_RENDER;
    return;
  }
  if (RUN_LINE_CLOSEUP_GROUP.test(text)) { scan.closeupGroups += 1; return; }
  const summary = RUN_LINE_COMPARISON_DONE.exec(text);
  if (summary) {
    scan.comparisonsDone += 1;
    scan.lastComparisonImages = Number(summary[1]) || 0;
    return;
  }
  if (RUN_LINE_FINISHED.test(text)) scan.finished = true;
}

// Total images expected. SINGLE and OVERLAY render six views; TERMINI's
// close-up count is only known as evidence arrives, so it can only grow.
function expectedImageCount(scan, plan) {
  const announced = scan.viewImages + scan.closeupGroups * CLOSEUPS_PER_COMPARISON;
  let expected = Math.max((plan && plan.images) || 0, announced, scan.imagesSaved);
  const comparisons = (plan && plan.comparisons) || 0;
  if (scan.comparisonsDone > 0 && comparisons > scan.comparisonsDone) {
    // One comparison has finished and stated exactly how many images it
    // produced. The comparisons still to come cost about the same.
    const left = comparisons - scan.comparisonsDone;
    expected = Math.max(expected, scan.imagesSaved + scan.lastComparisonImages * left);
  }
  return expected;
}

// Median interval between saved images, in ms, or null if too few have been
// seen to measure one. Median rather than mean because the gap that spans a
// report/session pause between two render groups is several times a normal
// one and would drag an average badly.
function measuredImageMs(scan) {
  const times = scan.imageTimes;
  if (!times || times.length < 3) return null;
  const gaps = [];
  for (let i = 1; i < times.length; i += 1) gaps.push(times[i] - times[i - 1]);
  gaps.sort((a, b) => a - b);
  const mid = gaps[Math.floor(gaps.length / 2)];
  return mid > 0 ? mid : null;
}

function projectRunProgress(scan, plan, now) {
  const expected = expectedImageCount(scan, plan);
  const measured = measuredImageMs(scan);
  const atRenderStage = scan.stageIndex === ANALYSIS_STAGES.length - 1;
  const rendering = scan.imagesSaved > 0 || (expected > 0 && atRenderStage);
  let pct;
  let label;

  if (rendering) {
    // Linear in images: each one costs about the same as the last, so each is
    // worth the same share of the bar.
    const total = Math.max(expected, scan.imagesSaved, 1);
    const done = Math.min(scan.imagesSaved, total);
    const slice = (RENDER_CEILING - RENDER_FLOOR) / total;
    pct = RENDER_FLOOR + slice * done;
    if (done < total) {
      // Partial credit for the image currently being ray-traced, so the bar
      // keeps moving through a render that prints nothing for a minute.
      const lastAt = scan.imageTimes.length ? scan.imageTimes[scan.imageTimes.length - 1] : scan.stageAt;
      const since = now && lastAt ? Math.max(0, now - lastAt) : 0;
      pct += slice * Math.min(0.9, since / (measured || ASSUMED_IMAGE_MS));
    }
    label = `Rendering images (${done} of ${total})`;
  } else {
    const stage = ANALYSIS_STAGES[scan.stageIndex];
    if (!stage) {
      pct = 0;
      label = "Starting";
    } else {
      // With images skipped there is no render stage, so the previous stage creeps
      // toward the finish instead.
      const skippingImages = !!plan && plan.images === 0;
      const lastReachable = ANALYSIS_STAGES.length - (skippingImages ? 2 : 1);
      const next = scan.stageIndex < lastReachable ? ANALYSIS_STAGES[scan.stageIndex + 1] : null;
      const ceiling = next ? next.pct : (skippingImages ? RENDER_CEILING : RENDER_FLOOR);
      const gap = Math.max(0, ceiling - stage.pct);
      const elapsed = now && scan.stageAt ? Math.max(0, now - scan.stageAt) : 0;
      pct = stage.pct + (stage.seconds > 0 ? gap * 0.85 * (1 - Math.exp(-elapsed / (stage.seconds * 1000))) : 0);
      label = stage.label;
    }
  }

  if (scan.finished) {
    pct = Math.max(pct, FINISHING_PCT);
    label = "Finishing";
  }

  // Only from measured image times, and only after three images; no estimate
  // before that.
  let remainingMs = null;
  if (measured && !scan.finished) {
    const left = Math.max(0, expected - scan.imagesSaved);
    if (left > 0) {
      const lastAt = scan.imageTimes[scan.imageTimes.length - 1] || 0;
      const inFlight = now && lastAt ? Math.max(0, now - lastAt) : 0;
      remainingMs = Math.max(0, left * measured - inFlight) + TAIL_MS;
    }
  }

  return {
    pct: Math.max(0, Math.min(pct, FINISHING_PCT)),
    label,
    imagesSaved: scan.imagesSaved,
    imagesExpected: expected,
    finished: scan.finished,
    remainingMs,
  };
}

// A BATCH bar from the queue's statuses and the current item's progress
// (0-1). Only finished structures count; cancelled ones do not.
function batchProgressFrom(queue, itemFraction) {
  const list = queue || [];
  const total = list.length || 1;
  const complete = list.filter((j) => j.status === "complete").length;
  const failed = list.filter((j) => j.status === "failed").length;
  const cancelled = list.filter((j) => j.status === "cancelled").length;
  const done = complete + failed;
  const fraction = Math.max(0, Math.min(0.99, itemFraction || 0));
  // Nothing finished: red, and says so. Otherwise the bar stops where it got.
  const value = cancelled
    ? (complete === 0 ? 100 : (complete / total) * 100)
    : Math.min(100, ((done + fraction) / total) * 100);
  return {
    value,
    complete,
    failed,
    cancelled,
    done,
    // Amber when any failed; red when stopped.
    tone: cancelled ? "coral" : failed ? "amber" : (done === list.length && list.length > 0) ? "sage" : "accent",
    label: cancelled
      ? (complete === 0 ? "Cancelled" : `Cancelled at ${complete} of ${list.length}`)
      : `${done} of ${list.length} processed`,
    showValue: !cancelled,
  };
}

function formatRemaining(ms) {
  if (ms === null || ms === undefined || !isFinite(ms)) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 15) return "a few seconds left";
  if (seconds < 60) return `~${Math.round(seconds / 10) * 10}s left`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `~${minutes} min left`;
  return `~${Math.round(minutes / 60)} hr left`;
}

const ProgressBar = ({ value, tone = "accent", label, animated = false, showValue = true, hint = null }) => {
  const colors = { accent: "var(--accent)", amber: "var(--amber)", sage: "var(--sage)", coral: "var(--coral)" };
  const width = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5, color: "var(--text-1)", marginBottom: 6 }}>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {hint && <span style={{ color: "var(--text-2)" }}>{hint}</span>}
            {showValue && <span className="mono">{Math.round(width)}%</span>}
          </span>
        </div>
      )}
      <div style={{ height: 6, background: "var(--bg-0)", borderRadius: 4, overflow: "hidden", border: "1px solid var(--line-0)" }}>
        <div className={animated ? "astra-progress-stripe" : ""} style={{
          width: `${width}%`, height: "100%", background: colors[tone],
          transition: "width 300ms ease", borderRadius: 4,
        }} />
      </div>
    </div>
  );
};

// A clock that ticks while `active`, so the bar keeps moving during
// ray-tracing, when Astra3 prints nothing.
function useNow(active, intervalMs = 500) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

// Keeps a running scan of a live console feed, applying only the lines it has
// not already seen. Pages only ever append to `lines` (and clear it outright
// when a new run starts), so a shorter array than last render means a new run
// and a full reset.
function useRunScan(lines) {
  const held = useRef({ count: 0, scan: newRunScan() });
  const feed = lines || [];
  if (feed.length < held.current.count) held.current = { count: 0, scan: newRunScan() };
  if (feed.length > held.current.count) {
    for (let i = held.current.count; i < feed.length; i += 1) applyRunLine(held.current.scan, feed[i]);
    held.current.count = feed.length;
  }
  return held.current.scan;
}

// Progress bar for SINGLE, OVERLAY and TERMINI. It ticks itself so the
// console beside it does not re-render. `outcome` is null while running, then
// "complete", "cancelled" or "failed"; only completion fills the bar.
function RunProgressBar({ lines, plan, outcome, prefix }) {
  const active = !outcome;
  const now = useNow(active);
  const scan = useRunScan(lines);
  const reachedRef = useRef(0);
  if (!lines || lines.length === 0) reachedRef.current = 0;
  const state = projectRunProgress(scan, plan || {}, now);
  if (state.pct > reachedRef.current) reachedRef.current = state.pct;
  const reached = reachedRef.current;

  const tone = outcome === "complete" ? "sage"
    : outcome === "cancelled" ? "coral"
      : outcome === "failed" ? "amber" : "accent";
  const label = outcome === "complete" ? "Complete"
    : outcome === "cancelled" ? `Cancelled at ${Math.round(reached)}%`
      : outcome === "failed" ? `Failed at ${Math.round(reached)}%`
        : prefix ? `${prefix} · ${state.label}` : state.label;

  return (
    <ProgressBar
      // A run that did not finish shows how far it got.
      value={outcome === "complete" ? 100 : reached}
      tone={tone}
      label={label}
      animated={active}
      showValue={!outcome || outcome === "complete"}
      hint={active ? formatRemaining(state.remainingMs) : null}
    />
  );
}

// Progress bar for a BATCH queue: finished structures plus the running one's
// progress. Cancelled items count for nothing.
function BatchProgressBar({ queue, itemLines, itemPlan, running, startedAt }) {
  const now = useNow(running);
  const scan = useRunScan(itemLines);
  // Reset synchronously when a new queue run starts, rather than in an effect
  // that would not have run yet on the first render of that run.
  const reachedRef = useRef({ startedAt: 0, pct: 0 });
  if (reachedRef.current.startedAt !== startedAt) reachedRef.current = { startedAt, pct: 0 };

  const itemFraction = running ? projectRunProgress(scan, itemPlan || {}, now).pct / 100 : 0;
  const state = batchProgressFrom(queue, itemFraction);

  // Never backwards: an item's own fraction resets to zero the moment it
  // finishes, a beat before the queue count that replaces it goes up.
  if (state.value > reachedRef.current.pct) reachedRef.current.pct = state.value;

  // Estimated from finished structures only, once at least one has completed.
  let hint = null;
  if (running && startedAt && state.done >= 1) {
    const perItem = (now - startedAt) / (state.done + itemFraction);
    const left = Math.max(0, (queue.length || 1) - state.done - itemFraction);
    if (perItem > 0 && left > 0) hint = formatRemaining(perItem * left);
  }

  return (
    <ProgressBar
      value={state.cancelled ? state.value : Math.min(100, reachedRef.current.pct)}
      tone={state.tone}
      label={state.label}
      showValue={state.showValue}
      hint={hint}
      animated={running}
    />
  );
}

const Spinner = ({ size = 14 }) => (
  <svg className="astra-spin" width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9.5" stroke="var(--line-1)" strokeWidth="2.5" />
    <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const EmptyState = ({ icon, title, description, action }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", textAlign: "center" }}>
    <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)", marginBottom: 16 }}>
      <Icon name={icon} size={24} />
    </div>
    <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--text-0)", marginBottom: 5 }}>{title}</div>
    {description && <div style={{ fontSize: 12.5, color: "var(--text-1)", maxWidth: 340, marginBottom: action ? 18 : 0, wordBreak: "break-word" }}>{description}</div>}
    {action}
  </div>
);

/* ============================================================
   TOASTS
   ============================================================ */
const ToastContext = createContext(null);
const useToast = () => useContext(ToastContext);

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((toast) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, tone: "neutral", duration: 4200, ...toast }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), toast.duration || 4200);
  }, []);
  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  const toneIcon = { success: "check", error: "alertTriangle", warning: "alertTriangle", neutral: "info" };
  const toneColor = { success: "var(--sage)", error: "var(--coral)", warning: "var(--amber)", neutral: "var(--accent)" };

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div style={{ position: "fixed", bottom: 20, right: 20, display: "flex", flexDirection: "column", gap: 8, zIndex: 1000, width: 340 }}>
        {toasts.map((t) => (
          <div key={t.id} className="astra-toast-in" style={{
            background: "var(--bg-2)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-md)",
            padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start", boxShadow: "var(--shadow-lg)",
          }}>
            <span style={{ color: toneColor[t.tone], flexShrink: 0, marginTop: 1 }}><Icon name={toneIcon[t.tone]} size={16} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {t.title && <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{t.title}</div>}
              {t.message && <div style={{ fontSize: 12, color: "var(--text-1)" }}>{t.message}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", padding: 2 }}>
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

/* ============================================================
   BACKEND BRIDGE
   ============================================================
   Astra3's engine (astra3.py and its modules) is an interactive script that
   runs inside a PyMOL session, reading commands from stdin in a loop and
   printing coloured status lines. The desktop app drives it as follows:
     1. The main process spawns PyMOL (the executable set in Settings) with
        astra3.py as its startup script.
     2. Analyze, Overlay, Termini, Batch and the rest send the same commands a
        person would type at "Enter a PDB ID:", e.g. "9BOX -low -csv" or
        "OVERLAY 6DK3 9BOX -mmCIF", to its stdin. One command grammar serves
        both the console and the buttons, so console history includes runs
        started from the interface.
     3. stdout is parsed line by line. Astra3's phrasing ("Ligand named...",
        "Report saved:", "Selector-Error:", the homomer and sequence-identity
        prompts) drives progress, shows y/n prompts as dialogs, and fills the
        live console.
     4. When a run prints its output folder, the interface reads the HTML
        report, images and .pse it wrote there. This file is the client side
        of that.

   Outside the desktop app (a plain browser) there is no PyMOL, so
   AstraBridgeUnavailable below refuses every command with an explanation.
   Astra3 never shows results it did not compute.
   ============================================================ */
class AstraBridgeUnavailable {
  on() { return () => {}; }
  off() {}
  async runCommand() { throw new Error("Analyses run only in the Astra3 desktop app."); }
  async runImportCommand() { throw new Error("Analyses run only in the Astra3 desktop app."); }
  async cancel() { return { ok: false, error: "Cancel is available only in the desktop app." }; }
}

/* ============================================================
   REAL BRIDGE: talks to the Electron main process via the narrow
   `window.astra3Native` surface exposed by electron/preload.js. Same
   runCommand({onLog, onProgress, onPrompt}) shape as
   AstraBridgeUnavailable above. Only constructed when window.astra3Native
   exists, i.e. inside the desktop app.
   ============================================================ */
class AstraBridgeElectron {
  constructor() {
    this._listeners = {};
    this._promptResolvers = [];
    // Sequence number of the last log line received (see pymol-bridge.js
    // _logSeq), and waiters for later ones.
    this._lastSeq = 0;
    this._seqWaiters = [];
    window.astra3Native.onPymolLog(({ text, tone, seq }) => {
      this.emit("log-line", { text, tone });
      if (typeof seq === "number" && seq > this._lastSeq) this._lastSeq = seq;
      this._seqWaiters = this._seqWaiters.filter((w) => (this._lastSeq >= w.seq ? (w.resolve(), false) : true));
    });
    window.astra3Native.onPymolState((state) => this.emit("state", state));
  }
  on(event, cb) { (this._listeners[event] ||= []).push(cb); return () => this.off(event, cb); }
  off(event, cb) { this._listeners[event] = (this._listeners[event] || []).filter((f) => f !== cb); }
  emit(event, payload) { (this._listeners[event] || []).forEach((cb) => cb(payload)); }

  // Resolves once log line `seq` has arrived, or after 3 s. Results and log
  // lines use separate IPC channels, so a result can arrive before the last
  // lines of its run.
  _receivedThrough(seq) {
    if (typeof seq !== "number" || this._lastSeq >= seq) return Promise.resolve();
    return new Promise((resolve) => {
      const waiter = { seq, resolve };
      this._seqWaiters.push(waiter);
      setTimeout(() => { this._seqWaiters = this._seqWaiters.filter((w) => w !== waiter); resolve(); }, 3000);
    });
  }

  // Runs one command, forwarding its output and prompts to the callbacks
  // until its last log line has arrived.
  async _run(invoke, failure, { onLog, onProgress, onPrompt, onPromptClosed } = {}) {
    const offLog = this.on("log-line", ({ text, tone }) => onLog && onLog(text, tone));
    const offState = this.on("state", async (state) => {
      if (typeof state.progress === "number") onProgress && onProgress(state.progress);
      if (state.prompt) {
        const answer = await onPrompt(state.prompt);
        window.astra3Native.pymolAnswerPrompt(answer);
      }
      // A null prompt closes any open prompt dialog; the bridge sends it when the
      // engine exits mid-prompt.
      if (state.prompt === null && onPromptClosed) onPromptClosed();
    });
    try {
      const result = await invoke();
      if (!result.ok) throw new Error(result.error || failure);
      await this._receivedThrough(result.lastLogSeq);
      return result;
    } finally {
      offLog(); offState();
    }
  }

  runCommand(commandString, handlers) {
    return this._run(() => window.astra3Native.pymolRunCommand(commandString), "Command failed", handlers);
  }

  // IMPORT asks for the file path interactively; pymol-bridge.js answers it.
  runImportCommand(filePath, handlers) {
    return this._run(() => window.astra3Native.pymolRunImportCommand(filePath), "Import failed", handlers);
  }

  async cancel() {
    return window.astra3Native.pymolCancel();
  }
}


/* ============================================================
   APP STATE STORE
   ============================================================ */
const AppContext = createContext(null);
const useApp = () => useContext(AppContext);

// Path helpers that accept both separators; the renderer has no Node path module.
function dirnameOf(p) {
  if (!p) return "";
  const cut = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return cut > 0 ? p.slice(0, cut) : "";
}

// Joins with the separator the base already uses, so displayed Windows paths
// stay all-backslash.
function joinPath(base, ...parts) {
  if (!base) return parts.join("/");
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return [base.replace(/[/\\]+$/, ""), ...parts].join(sep);
}

// An imported structure's temporary ID.
const AST_ID_RE = /^AST-\d+$/i;
// A wwPDB extended ID with no 4-character form. Such entries are issued in mmCIF only.
const EXTENDED_ONLY_ID_RE = /^PDB_(?!0000)[A-Z0-9]{8}$/i;

const ENGINE_NAMES = { pymol: "PyMOL", chimerax: "ChimeraX", astra3: "Astra3 Engine" };
// The engine key for the name Astra3 prints ("Engine: Astra3 Engine v2.0.3").
const engineKey = (name) => Object.keys(ENGINE_NAMES).find((k) => ENGINE_NAMES[k] === name) || "pymol";

// Whether a location holds the program it was entered for (PyMOL or ChimeraX).
// Resolves to { error }, or for ChimeraX to { version }.
async function checkEnginePath(engine, candidate) {
  const p = String(candidate || "").trim();
  if (!p) return { error: `Enter where ${ENGINE_NAMES[engine]} is installed.` };
  const file = p.split(/[\\/]/).filter(Boolean).pop() || "";
  if (engine === "pymol") {
    if (/chimerax/i.test(file)) return { error: "This is ChimeraX, not PyMOL. Enter it as the ChimeraX location instead." };
    if (!(await window.astra3Native.verifyPymolPath(p))) return { error: "This file does not appear to be a valid PyMOL executable." };
    if (!(await window.astra3Native.verifyIsRealPymol(p))) {
      return { error: (await window.astra3Native.pymolVerifyProblem()) || "This file does not appear to be a valid PyMOL executable." };
    }
    return {};
  }
  if (/pymol/i.test(file)) return { error: "This is PyMOL, not ChimeraX. Enter it as the PyMOL location instead." };
  const version = await window.astra3Native.chimeraxVersion(p);
  return version ? { version } : { error: "This program does not appear to be ChimeraX." };
}
// How a structure's source is labelled in lists and history: an imported
// file is read as it is, so it has no fetch format.
const structureSourceLabel = (id, format) => (AST_ID_RE.test(String(id || "").trim()) ? "Import" : format === "cif" ? "mmCIF" : "PDB");

// Lines that print a path inside the run's folder. The folder is read from
// them because OVERLAY and TERMINI folder names cannot be rebuilt from the IDs.
const RUN_OUTPUT_PATH_LINE = /^(?:Session saved|Report saved|Overlay report saved|HTML report saved|JSON export saved|CSV export saved|Saving images to|Structure also exported as PDB for the viewer|Structure saved as PDB fallback|Output folder):\s*(\S.*?)\s*$/;

function runFolderFromLines(lines) {
  const feed = lines || [];
  for (let i = feed.length - 1; i >= 0; i -= 1) {
    const entry = feed[i];
    const text = stripAnsi(typeof entry === "string" ? entry : (entry && entry.text) || "").trim();
    const match = RUN_OUTPUT_PATH_LINE.exec(text);
    if (!match) continue;
    const raw = match[1];
    const sep = raw.includes("\\") && !raw.includes("/") ? "\\" : "/";
    const parts = raw.split(/[/\\]/);
    for (let j = parts.length - 1; j >= 0; j -= 1) {
      if (/_Output(?: \(\d+\))?$/i.test(parts[j])) {
        return { parent: parts.slice(0, j).join(sep), name: parts[j] };
      }
    }
  }
  return null;
}

// Whether a run wrote anything. An ID that cannot be fetched returns to the
// prompt like a finished run but prints no path, so any announced path or
// saved image counts as output. Error text is written for people and is not
// parsed.
function runProducedOutput(lines) {
  return (lines || []).some((entry) => {
    const text = stripAnsi(typeof entry === "string" ? entry : (entry && entry.text) || "").trim();
    return RUN_OUTPUT_PATH_LINE.test(text) || /^Saved (view_|closeup_)/.test(text);
  });
}

// Removes what a cancelled run left on disk, since a partial report or session
// looks like a finished result. `fallbackId` names a single-structure folder
// for a cancel that came before Astra3 printed any path.
async function discardRunOutput(lines, fallbackId, outputDir, startedAt) {
  let target = runFolderFromLines(lines);
  if (!target && fallbackId && outputDir) {
    target = { parent: outputDir, name: `${String(fallbackId).toUpperCase()}_Output` };
  }
  if (!target || !target.parent || !target.name) return false;
  try {
    // Scoped to this run: a folder shared with an earlier run of the same
    // structure keeps whatever that run wrote and this one never reached.
    const removed = await window.astra3Native?.deleteRunFolders?.(target.parent, [target.name], startedAt || 0);
    return !!(removed && removed.deleted);
  } catch {
    // A folder that cannot be removed is not worth failing a cancellation
    // over. Nothing was recorded for the run either way.
    return false;
  }
}

// Human-readable byte size. Uses 1024-based units to match what Windows
// Explorer and macOS Finder report, so the number here agrees with what the
// person sees in their own file browser.
function formatBytes(bytes) {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

// Example PyMOL location shown as a placeholder and used as the last-resort
// default when detection finds nothing. This is where the standard PyMOL
// installer places the application on macOS.
const MAC_PYMOL_EXAMPLE = "/Applications/PyMOL.app/Contents/MacOS/PyMOL";

const DEFAULT_SETTINGS = {
  defaultQuality: "medium",
  defaultFormat: "cif",
  outputDir: "~/Documents/Astra3/Protein_outputs",
  pymolPath: "",
  // Off by default: on Windows, opening an .html for the first time raises a
  // "How do you want to open this file?" chooser.
  autoOpenReport: false,
  autoOpenSession: false,
  completionSound: true,
  theme: "dark",
  confirmBeforeBatch: true,
  contentFont: "IBM Plex Mono",
};

// Content fonts. Bundled ones work offline; system ones render when installed
// and otherwise fall back to the bundled default.
const CONTENT_FONT_GROUPS = [
  {
    label: "Bundled with Astra3",
    options: [
      { label: "IBM Plex Mono", family: "'IBM Plex Mono', ui-monospace, monospace" },
      { label: "Inter", family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif" },
      { label: "Nunito", family: "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif" },
    ],
  },
  {
    label: "System sans-serif",
    options: [
      { label: "Helvetica Neue", family: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
      { label: "Arial", family: "Arial, 'Helvetica Neue', Helvetica, sans-serif" },
      { label: "Verdana", family: "Verdana, Geneva, sans-serif" },
      { label: "Tahoma", family: "Tahoma, Geneva, sans-serif" },
      { label: "Trebuchet MS", family: "'Trebuchet MS', sans-serif" },
      { label: "Segoe UI", family: "'Segoe UI', Tahoma, sans-serif" },
      { label: "Calibri", family: "Calibri, Candara, sans-serif" },
      { label: "Century Gothic", family: "'Century Gothic', sans-serif" },
      { label: "Futura", family: "Futura, 'Century Gothic', sans-serif" },
      { label: "Optima", family: "Optima, 'Segoe UI', sans-serif" },
      { label: "Gill Sans", family: "'Gill Sans', 'Gill Sans MT', sans-serif" },
      { label: "Avenir", family: "Avenir, 'Avenir Next', sans-serif" },
    ],
  },
  {
    label: "System serif",
    options: [
      { label: "Times New Roman", family: "'Times New Roman', Times, serif" },
      { label: "Georgia", family: "Georgia, 'Times New Roman', serif" },
      { label: "Palatino", family: "Palatino, 'Palatino Linotype', serif" },
      { label: "Baskerville", family: "Baskerville, 'Times New Roman', serif" },
      { label: "Garamond", family: "Garamond, Baskerville, serif" },
      { label: "Cambria", family: "Cambria, Georgia, serif" },
      { label: "Didot", family: "Didot, Georgia, serif" },
      { label: "Bookman Old Style", family: "'Bookman Old Style', 'URW Bookman', serif" },
    ],
  },
  {
    label: "System monospace",
    options: [
      { label: "Menlo", family: "Menlo, Monaco, 'Courier New', monospace" },
      { label: "Monaco", family: "Monaco, Menlo, monospace" },
      { label: "Consolas", family: "Consolas, 'Andale Mono', monospace" },
      { label: "Courier New", family: "'Courier New', Courier, monospace" },
      { label: "Andale Mono", family: "'Andale Mono', monospace" },
    ],
  },
  {
    label: "System display / decorative",
    options: [
      { label: "Comic Sans MS", family: "'Comic Sans MS', 'Comic Sans', cursive" },
      { label: "Papyrus", family: "Papyrus, fantasy" },
      { label: "Impact", family: "Impact, 'Arial Black', sans-serif" },
      { label: "Copperplate", family: "Copperplate, 'Copperplate Gothic Light', serif" },
      { label: "Brush Script MT", family: "'Brush Script MT', cursive" },
      { label: "Chalkboard", family: "Chalkboard, 'Comic Sans MS', cursive" },
      { label: "Marker Felt", family: "'Marker Felt', cursive" },
      { label: "American Typewriter", family: "'American Typewriter', 'Courier New', serif" },
    ],
  },
];
const CONTENT_FONT_LOOKUP = Object.fromEntries(
  CONTENT_FONT_GROUPS.flatMap((g) => g.options).map((o) => [o.label, o.family])
);

// Quick View entries kept in the 3D Viewer's list, the most recent first.
const QUICK_VIEW_LIMIT = 30;

function AppProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("astra3_settings") || "{}") }; }
    catch { return DEFAULT_SETTINGS; }
  });
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("astra3_history")) || []; }
    catch { return []; }
  });
  // Structures opened with Quick View on the 3D Viewer page, newest first.
  // Kept apart from the history, which every other page reads as runs with
  // reports and output folders.
  const [quickViews, setQuickViews] = useState(() => {
    try { return JSON.parse(localStorage.getItem("astra3_quickviews")) || []; }
    catch { return []; }
  });
  // Launch time, to tell entries from this session (missing files are
  // unexpected) from older ones (files may have been moved since).
  const sessionStartTime = useRef(Date.now()).current;
  const [consoleLog, setConsoleLog] = useState([
    { text: "Astra3: Structural Analysis Toolkit", tone: "info" },
  ]);
  const [activeJobs, setActiveJobs] = useState([]);
  // One command at a time, as the engine process runs one at a time.
  const [isBusy, setIsBusy] = useState(false);
  const isBusyRef = useRef(false); // synchronous mirror of isBusy, so two near-simultaneous runAstraCommand calls can't both slip past the check before state updates land
  // Not a boolean: an incrementing "generation" so a NEW holdLock sequence
  // starting right as an old one finishes can never be confused with the old
  // one still being active.
  const holdLockGenerationRef = useRef(0);
  // One-shot handoff from Import's "Overlay/Termini selected" to those pages,
  // which read and clear it on mount.
  const [pendingStructureSeed, setPendingStructureSeed] = useState(null);
  // { pageId, prompt } while a prompt waits, so the nav rail and top bar can
  // point to it without a blocking modal.
  const [pendingPromptPage, setPendingPromptPage] = useState(null);
  // A new random value per successful run, so back-to-back completions each
  // trigger CompletionPulse.
  const [completionPulse, setCompletionPulse] = useState(0);
  // The History entry the Reports page should show.
  const [selectedReportId, setSelectedReportId] = useState(null);
  // Separate from selectedReportId: each page consumes and clears its request,
  // so a shared value could be consumed by the wrong page.
  const [selectedViewerId, setSelectedViewerId] = useState(null);
  // The pending engine prompt, answered from one dialog on any page:
  // { text, options, allowFreeText, resolve }, or null.
  const [prompt, setPrompt] = useState(null);
  // Setup check after mount: { pymolOk, scriptOk, isFirstLaunch, ... }, or null
  // before it runs. scriptOk false means the installation is missing astra3.py.
  const [setupStatus, setSetupStatus] = useState(null);
  // "darwin", "win32" or "linux" from getPaths(); null until it resolves.
  const [platform, setPlatform] = useState(null);
  // Home folder, for a Windows PyMOL path example; null until getPaths().
  const [homeDir, setHomeDir] = useState(null);
  // Startup notice about the output folder, shown once by OutputLocationNotice.
  const [outputNotice, setOutputNotice] = useState(null);
  const bridge = useMemo(() => (typeof window !== "undefined" && window.astra3Native ? new AstraBridgeElectron() : new AstraBridgeUnavailable()), []);

  // The engine shown in the top bar: which runs analyses, its last reported
  // version (kept per engine), whether it is running, and which are installed.
  const [engineInfo, setEngineInfo] = useState(() => {
    const blank = { engine: "pymol", name: "PyMOL", version: null, running: false, error: null,
      versions: {}, available: null, none: false };
    try {
      const saved = JSON.parse(localStorage.getItem("astra3_engine") || "{}");
      const engine = ENGINE_NAMES[saved.engine] ? saved.engine : "pymol";
      const versions = saved.versions && typeof saved.versions === "object" ? saved.versions : {};
      return { ...blank, engine, name: ENGINE_NAMES[engine], version: versions[engine] || null, versions };
    } catch {
      return blank;
    }
  });
  // Asks the main process which engines are installed and which one the next
  // analysis runs with (the one already running, if any). Resolves to that
  // status, or null outside the desktop app.
  const refreshEngineStatus = useCallback(async () => {
    if (!window.astra3Native?.engineStatus) return null;
    const status = await window.astra3Native.engineStatus();
    setEngineInfo((e) => {
      const engine = status.running || status.engine || status.preferred || "pymol";
      return {
        ...e, engine, name: ENGINE_NAMES[engine], version: e.versions[engine] || null,
        available: status.available, configured: status.configured, none: !status.engine && !status.running,
        running: status.running === engine, error: engine === e.engine ? e.error : null,
      };
    });
    return status;
  }, []);
  // A version learned without starting the engine (ChimeraX reports its own
  // to --version), kept for the indicator.
  const rememberEngineVersion = useCallback((engine, version) => {
    if (!version) return;
    setEngineInfo((e) => ({ ...e, versions: { ...e.versions, [engine]: version }, version: e.engine === engine ? version : e.version }));
  }, []);
  // Switches the engine analyses run with. Takes effect at once: an idle
  // engine is closed and the next analysis starts the chosen one. Refused by
  // the main process while a run is in progress.
  const switchEngine = useCallback(async (engine) => {
    const result = await window.astra3Native.setEngine(engine);
    await refreshEngineStatus();
    return result;
  }, [refreshEngineStatus]);
  useEffect(() => {
    refreshEngineStatus().catch(() => {});
    return bridge.on("state", (state) => {
      setEngineInfo((e) => {
        const next = { ...e };
        if (state.engine) {
          const engine = engineKey(state.engine);
          if (engine !== e.engine) {
            next.engine = engine; next.name = state.engine; next.version = e.versions[engine] || null; next.error = null;
          }
          next.none = false;
        }
        if (state.engineVersion) {
          next.version = state.engineVersion;
          next.versions = { ...e.versions, [next.engine]: state.engineVersion };
        }
        if (typeof state.running === "boolean") { next.running = state.running; if (state.running) next.error = null; }
        if (state.launchError) next.error = state.launchError;
        return next;
      });
    });
  }, [bridge, refreshEngineStatus]);
  useEffect(() => {
    try {
      localStorage.setItem("astra3_engine", JSON.stringify({ engine: engineInfo.engine, versions: engineInfo.versions }));
    } catch {
      // Storage unavailable: the indicator still works for this session.
    }
  }, [engineInfo.engine, engineInfo.versions]);
  const isElectron = typeof window !== "undefined" && !!window.astra3Native;

  useEffect(() => { localStorage.setItem("astra3_settings", JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem("astra3_history", JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem("astra3_quickviews", JSON.stringify(quickViews)); }, [quickViews]);
  useEffect(() => {
    const light = settings.theme === "light";
    document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
    if (window.astra3Native?.setTheme) window.astra3Native.setTheme(light ? "light" : "dark");
    // No window-control retinting on macOS: the traffic lights are drawn by
    // the system and follow the OS appearance, so there is nothing here to
    // recolour. (Windows draws a tintable overlay and does need this.)
  }, [settings.theme]);

  // The content font sets --font-body-rounded only; --font-ui (tabs, inputs)
  // is fixed. A saved name no longer listed is used as a raw font-family.
  useEffect(() => {
    const family = CONTENT_FONT_LOOKUP[settings.contentFont] || settings.contentFont || CONTENT_FONT_LOOKUP[DEFAULT_SETTINGS.contentFont];
    document.documentElement.style.setProperty("--font-body-rounded", family);
  }, [settings.contentFont]);
  // A detected PyMOL is right for this machine where no fixed default can be
  // (see autodetectPymolPath in main.js).
  useEffect(() => {
    if (!isElectron) return;
    Promise.all([
      window.astra3Native.getPaths(),
      window.astra3Native.getPymolPath ? window.astra3Native.getPymolPath() : Promise.resolve(null),
    ]).then(([paths, pymolPath]) => {
      if (!paths) return;
      setPlatform(paths.platform);
      setHomeDir(paths.home || null);
      const patch = {};
      // The PyMOL Astra3 uses (saved, or found where PyMOL is usually
      // installed), or blank when this computer has none.
      if ((pymolPath || "") !== settings.pymolPath) patch.pymolPath = pymolPath || "";
      if (Object.keys(patch).length > 0) updateSettings(patch);
    });
  }, [isElectron]);

  // The main process owns the output folder. The stored value is only offered
  // as a fallback for when the main process has nothing saved.
  useEffect(() => {
    if (!isElectron || !window.astra3Native.getOutputLocation) return;
    const remembered = settings.outputDir && settings.outputDir !== DEFAULT_SETTINGS.outputDir ? settings.outputDir : null;
    window.astra3Native.getOutputLocation(remembered).then((location) => {
      if (!location || !location.dir) return;
      if (location.dir !== settings.outputDir) updateSettings({ outputDir: location.dir });
      if (location.notice) setOutputNotice(location.notice);
    }).catch(() => {
      // The engine still gets the main process's folder; only the display lags.
    });
  }, [isElectron]);

  // Checks the saved engine at every launch. The setup dialog opens with a
  // welcome when nothing is set up, or a short recovery message when a saved
  // engine no longer works.
  useEffect(() => {
    if (!isElectron) { setSetupStatus({ pymolOk: true, scriptOk: true, isFirstLaunch: false }); return; }
    let cancelled = false;
    // pymolOk means an engine was found, PyMOL or ChimeraX: the setup dialog
    // asks for either one only when neither is on this computer.
    Promise.all([refreshEngineStatus(), window.astra3Native.getAstraScriptPath()]).then(([status, scriptPath]) => {
      if (cancelled) return;
      const found = !!(status && status.engine);
      // The welcome dialog opens when neither program is installed and no
      // engine has been chosen yet; the Astra3 Engine runs otherwise.
      const needsSetup = !status || (!status.programs && !status.chosen) || !found;
      setSetupStatus({
        pymolOk: !needsSetup, scriptOk: !!scriptPath, isFirstLaunch: needsSetup,
        available: status ? status.available : null, engine: status ? status.engine : null,
        fallbackFrom: found && status.engine !== status.preferred ? status.preferred : null,
      });
    }).catch(() => {
      // The check itself failed: nothing is known to be missing, so no setup
      // dialog. A run that cannot start says why.
      if (!cancelled) setSetupStatus({ pymolOk: true, scriptOk: true, isFirstLaunch: false });
    });
    return () => { cancelled = true; };
  }, [isElectron]);

  const updateSettings = (patch) => setSettings((s) => ({ ...s, ...patch }));

  // Every line gets a sequence number, so the Advanced Console can use it as
  // a stable key and can say exactly how many early lines were dropped if a
  // very long session ever exceeds SESSION_LOG_MAX_LINES.
  const logSeqRef = useRef(0);
  const appendLog = useCallback((text, tone = "muted") => {
    const n = logSeqRef.current++;
    setConsoleLog((l) => {
      const next = l.length >= SESSION_LOG_MAX_LINES ? l.slice(l.length - SESSION_LOG_MAX_LINES + 1) : l.slice();
      next.push({ text, tone, n });
      return next;
    });
  }, []);

  // Returns the new entry's id; Batch records these (batchEntryIds) to know
  // exactly which runs it produced. Each entry records the engine used.
  const engineRef = useRef(engineInfo.engine);
  useEffect(() => { engineRef.current = engineInfo.engine; }, [engineInfo.engine]);
  const addHistoryEntry = useCallback((entry) => {
    const id = Math.random().toString(36).slice(2);
    setHistory((h) => [{ id, timestamp: Date.now(), favorite: false, engine: engineRef.current, ...entry }, ...h]);
    return id;
  }, []);

  const toggleFavorite = (id) => setHistory((h) => h.map((e) => (e.id === id ? { ...e, favorite: !e.favorite } : e)));
  const deleteHistoryEntry = (id) => setHistory((h) => h.filter((e) => e.id !== id));
  // Clears the list only; deleting files is a separate, confirmed action.
  const clearHistory = useCallback(() => setHistory([]), []);
  // Opening the same structure again moves its entry to the top instead of
  // adding a second one. Returns the entry.
  const addQuickView = useCallback((entry) => {
    const added = { id: Math.random().toString(36).slice(2), timestamp: Date.now(), kind: "quickview", status: "complete", ...entry };
    const same = (e) => e.structureId === added.structureId && (e.path || null) === (added.path || null);
    setQuickViews((list) => [added, ...list.filter((e) => !same(e))].slice(0, QUICK_VIEW_LIMIT));
    return added;
  }, []);
  const removeQuickView = useCallback((id) => setQuickViews((list) => list.filter((e) => e.id !== id)), []);

  const runAstraCommand = useCallback(async (commandString, { silent = false, originPage = null, onLog: callerOnLog, holdLock = false, lockToken = null, bridgeCall = null } = {}) => {
    // Re-checks the engine before every command, since it may have been moved
    // or removed since launch. On failure the setup dialog reopens and nothing
    // is started.
    if (isElectron) {
      // If the engine in use has gone, another installed one is used; the setup
      // dialog opens only when none is found.
      const status = await refreshEngineStatus();
      if (status && !status.engine && !status.running) {
        setSetupStatus((s) => ({ pymolOk: false, scriptOk: s?.scriptOk ?? true, isFirstLaunch: false }));
        const err = new Error("Neither PyMOL nor ChimeraX could be found. Select either installation to continue.");
        appendLog(err.message, "error");
        throw err;
      }
    }
    // Batch holds the lock across its queue (holdLock) and proves it with
    // lockToken, so its next item is not refused as a competing caller.
    const holdsLockAlready = lockToken !== null && lockToken === holdLockGenerationRef.current;
    if (isBusyRef.current && !holdsLockAlready) {
      const err = new Error("Astra3 is already running a command. Wait for it to finish, or cancel it from the Advanced Console.");
      appendLog(err.message, "error");
      throw err;
    }
    isBusyRef.current = true;
    setIsBusy(true);
    // A ref, not page state: an in-flight call cannot see state set after it
    // started. Kept here so a cancel from anywhere counts.
    cancelRequestedRef.current = false;
    // Every run is logged to the session console, silent ones (Batch items)
    // included; the page console shows only its own run.
    appendLog(commandString, "command");
    const jobId = Math.random().toString(36).slice(2);
    setActiveJobs((j) => [...j, { id: jobId, command: commandString, progress: 0, status: "running" }]);
    // This call's output only, for the calling page's console.
    const runLines = [];
    // The command is shown once, above. The bridge repeats it when it reaches
    // PyMOL; that copy is kept with the run's lines but not printed twice.
    let bridgeEchoSeen = false;
    const recordLine = (text, tone) => {
      // Arrival times, for estimating how long images take.
      const entry = { text, tone, at: Date.now() };
      runLines.push(entry);
      if (tone === "command" && !bridgeEchoSeen && text === commandString) {
        bridgeEchoSeen = true;
        callerOnLog && callerOnLog(entry, runLines);
        return;
      }
      appendLog(text, tone); // the shared log is the session log, silent or not
      callerOnLog && callerOnLog(entry, runLines); // streamed as it arrives
    };
    try {
      // bridgeCall replaces the bridge method (IMPORT uses runImportCommand)
      // while keeping the lock, logging and prompt handling.
      const callFn = bridgeCall || ((cmd, opts) => bridge.runCommand(cmd, opts));
      const result = await callFn(commandString, {
        onLog: recordLine,
        onProgress: (value) => setActiveJobs((j) => j.map((job) => (job.id === jobId ? { ...job, progress: value } : job))),
        // Prompts go to the single global dialog, whichever page is visible.
        onPrompt: (rawPrompt) => new Promise((resolve) => {
          setPrompt({ ...rawPrompt, resolve });
          if (originPage) setPendingPromptPage(originPage);
        }),
        onPromptClosed: () => {
          // The engine exited while the prompt was open.
          setPrompt((p) => { p?.resolve(null); return null; });
          setPendingPromptPage((current) => (originPage && current === originPage ? null : current));
        },
      });
      // A cancelled run resolves like a finished one; record it as cancelled.
      const wasCancelled = result?.cancelled === true;
      // An analysis that produced nothing failed. Console commands such as
      // -help produce no output folder and are not judged this way.
      const producedOutput = runProducedOutput(runLines);
      const isAnalysis = originPage === "single" || originPage === "overlay"
        || originPage === "termini" || originPage === "batch";
      setActiveJobs((j) => j.map((job) => (job.id === jobId
        ? { ...job, status: wasCancelled ? "cancelled"
          : (isAnalysis && !producedOutput) ? "failed" : "complete", progress: 100 }
        : job)));
      setTimeout(() => setActiveJobs((j) => j.filter((job) => job.id !== jobId)), 2500);
      // The completion pulse is for an analysis that finished on its own page
      // and produced output: not console commands, Batch items (the queue has
      // its own), cancelled runs or empty runs.
      if (!wasCancelled && producedOutput && !silent
        && (originPage === "single" || originPage === "overlay" || originPage === "termini")) {
        setCompletionPulse(Math.random());
      }
      return { ...result, produced: producedOutput, lines: runLines };
    } catch (e) {
      // A cancel that had to stop the engine also ends up here.
      setActiveJobs((j) => j.map((job) => (job.id === jobId ? { ...job, status: cancelRequestedRef.current ? "cancelled" : "failed" } : job)));
      // A failed/cancelled run has the same "clear itself after a moment"
      // behavior as a completed one.
      setTimeout(() => setActiveJobs((j) => j.filter((job) => job.id !== jobId)), 2500);
      // A refused command has no output of its own; log the reason.
      if (e && e.message && !runLines.some((l) => l.text === e.message)) appendLog(e.message, "error");
      e.lines = runLines;
      throw e;
    } finally {
      // With holdLock the caller releases the lock after its whole sequence.
      if (!holdLock) {
        isBusyRef.current = false;
        setIsBusy(false);
      }
    }
  }, [bridge, appendLog, refreshEngineStatus]);

  // Output between commands (the launch banner, late lines) still goes to the
  // session log.
  useEffect(() => {
    if (!bridge || typeof bridge.on !== "function") return undefined;
    return bridge.on("log-line", ({ text, tone }) => {
      if (!isBusyRef.current) appendLog(text, tone);
    });
  }, [bridge, appendLog]);

  const acquireLock = useCallback(() => {
    if (isBusyRef.current) return null;
    isBusyRef.current = true;
    setIsBusy(true);
    // A queue holding the lock starts without a previous cancellation.
    cancelRequestedRef.current = false;
    // A new token per acquisition, so an old holder cannot pass the guard.
    holdLockGenerationRef.current += 1;
    return holdLockGenerationRef.current;
  }, []);
  const releaseLock = useCallback(() => {
    isBusyRef.current = false;
    setIsBusy(false);
    // Invalidate the token so late calls from a finished sequence are refused.
    holdLockGenerationRef.current += 1;
  }, []);

  // Set by cancelRun() and read by multi-run sequences (the Batch queue), so
  // any cancel stops the whole queue. A ref so a loop mid-await sees it at once.
  const sequenceCancelRef = useRef(false);
  // A cancel requested during the command in flight. sequenceCancelRef
  // instead stops a whole queue and persists between its items.
  const cancelRequestedRef = useRef(false);
  // True while a multi-run sequence loops, so cancelRun can stop the queue even
  // between commands.
  const sequenceActiveRef = useRef(false);

  const cancelRun = useCallback(async () => {
    sequenceCancelRef.current = true;
    cancelRequestedRef.current = true;
    // A prompt blocks Astra3 in input(), out of reach of its cancellation
    // checkpoints. Answering "n" declines the optional step and lets it reach
    // the next checkpoint.
    setPrompt((p) => {
      if (p) p.resolve("n");
      return null;
    });
    // Clear the "Needs input" badge too; a force-cancel can kill the process
    // before the bridge reports the prompt closed.
    setPendingPromptPage(null);
    // SIGINT via the bridge. The lock is released when the run itself ends.
    const result = bridge.cancel ? await bridge.cancel() : { ok: false };
    // Between queue items no command is in flight, but the queue was told to
    // stop, so the cancel succeeded.
    if (!result.ok && sequenceActiveRef.current) {
      return { ok: true, note: "The queue will stop after the current step." };
    }
    return result;
  }, [bridge]);

  // Answers the pending prompt, from the dialog or typed in the Advanced
  // Console.
  const answerPrompt = useCallback((answer) => {
    setPrompt((p) => { p?.resolve(answer); return null; });
    // Cleared here unconditionally on every real answer, not just the
    // exit-while-pending case.
    setPendingPromptPage(null);
  }, []);

  // The "Needs input" badge must never stay lit with no prompt waiting.
  useEffect(() => {
    if (!prompt && pendingPromptPage && !isBusy) setPendingPromptPage(null);
  }, [prompt, pendingPromptPage, isBusy]);

  const value = {
    settings, updateSettings,
    history, addHistoryEntry, toggleFavorite, deleteHistoryEntry, clearHistory,
    quickViews, addQuickView, removeQuickView,
    consoleLog, appendLog,
    activeJobs, runAstraCommand, isBusy, acquireLock, releaseLock, cancelRun, cancelRequestedRef, sequenceCancelRef, sequenceActiveRef,
    bridge, isElectron,
    pendingStructureSeed, setPendingStructureSeed,
    pendingPromptPage, setPendingPromptPage,
    completionPulse, setCompletionPulse,
    selectedReportId, setSelectedReportId,
    selectedViewerId, setSelectedViewerId,
    sessionStartTime,
    engineInfo, refreshEngineStatus, switchEngine, rememberEngineVersion,
    prompt, answerPrompt,
    setupStatus,
    platform,
    homeDir,
    outputNotice, setOutputNotice,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/* ============================================================
   APP SHELL: navigation rail + top bar + page routing
   ============================================================ */
const NAV_ITEMS = [
  { id: "home", label: "Home", icon: "home" },
  { id: "single", label: "Single Structure", icon: "analysis" },
  { id: "overlay", label: "Overlay", icon: "overlay" },
  { id: "termini", label: "Termini", icon: "termini" },
  { id: "batch", label: "Batch", icon: "batch" },
  { id: "import", label: "Import Local", icon: "import" },
  { id: "reports", label: "Reports", icon: "reports" },
  { id: "viewer", label: "3D Viewer", icon: "viewer" },
  { id: "summary", label: "Summary", icon: "cube" },
  { id: "related", label: "Related Structures", icon: "related" },
  { id: "history", label: "History", icon: "history" },
];
const NAV_BOTTOM = [
  { id: "settings", label: "Settings", icon: "settings" },
  { id: "console", label: "Advanced Console", icon: "console" },
  { id: "palette", label: "Color Palette", icon: "palette" },
  { id: "citation", label: "Citation & Docs", icon: "citation" },
];

// Network reachability, graded. navigator.onLine misses captive portals and
// dead VPNs, so this times a small request to the RCSB host downloads use.
const CONNECTION_PROBE_HOST = "files.rcsb.org";
const CONNECTION_PROBE_URL = `https://${CONNECTION_PROBE_HOST}/`;
const CONNECTION_POLL_MS = 30000;
// Chosen against the size of a typical structure download: below a second is
// comfortable, a few seconds still works but a large entry will drag, and
// past that fetches start timing out.
const CONNECTION_GOOD_MS = 1200;
const CONNECTION_FAIR_MS = 4000;
const CONNECTION_TIMEOUT_MS = 9000;

const CONNECTION_STATES = {
  strong: { color: "var(--sage)", label: "Strong connection", detail: "Structure downloads should be quick." },
  medium: { color: "var(--amber)", label: "Moderate connection", detail: "Structure downloads may be slow." },
  weak: { color: "var(--coral)", label: "Weak connection", detail: "Structure downloads may time out." },
  offline: { color: "var(--text-2)", label: "No connection", detail: "Structures cannot be downloaded. Check that you are connected to a network." },
  unknown: { color: "var(--text-2)", label: "Checking connection", detail: "" },
};

function useConnectionQuality() {
  const [state, setState] = useState("unknown");
  const [latency, setLatency] = useState(null);
  // Exposed so the panel's "Check again" runs the same probe rather than a
  // second implementation that could drift from this one.
  const probeRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!cancelled) { setState("offline"); setLatency(null); }
        return;
      }
      const started = Date.now();
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = setTimeout(() => controller?.abort(), CONNECTION_TIMEOUT_MS);
      try {
        // no-cors keeps this from needing CORS headers on the far end; the
        // response is opaque, but a resolved promise still means the round
        // trip completed, which is the only thing being measured.
        await fetch(CONNECTION_PROBE_URL, { method: "HEAD", mode: "no-cors", cache: "no-store", signal: controller?.signal });
        const elapsed = Date.now() - started;
        if (cancelled) return;
        setLatency(elapsed);
        setState(elapsed <= CONNECTION_GOOD_MS ? "strong" : elapsed <= CONNECTION_FAIR_MS ? "medium" : "weak");
      } catch {
        if (!cancelled) { setState("offline"); setLatency(null); }
      } finally {
        clearTimeout(timer);
      }
    };

    probeRef.current = probe;
    probe();
    const interval = setInterval(probe, CONNECTION_POLL_MS);
    const onChange = () => probe();
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    };
  }, []);

  return { state, latency, refresh: probeRef.current || (() => {}) };
}

// Icon-only in the top bar; a click opens the detail (long text would clip as
// a hover tooltip). Same convention as ZoomControl.
// A banner while a download runs on a slow connection: downloads can stall
// with no output, and a console line would linger after it succeeds.
function SlowNetworkNotice({ active }) {
  const { state, latency } = useConnectionQuality();
  const slow = state === "medium" || state === "weak" || state === "offline";
  if (!active || !slow) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 9, marginBottom: 12,
      padding: "9px 12px", borderRadius: "var(--radius-md)",
      background: "var(--amber-wash, rgba(217,164,65,0.12))",
      border: "1px solid var(--amber)", color: "var(--text-1)", fontSize: 11.5,
    }}>
      <Spinner size={13} />
      <span>
        {state === "offline"
          ? "No connection detected. Structure downloads will fail until it returns."
          : `Connection is slow${latency ? ` (${latency} ms)` : ""} . Downloading a structure may take a while. This will clear on its own.`}
      </span>
    </div>
  );
}

// An engine's status dot: green when it is set up and works, amber when a
// location is set but the program there does not answer as that engine or
// could not start, red when no location is set. Grey until the first check.
function engineDotColor(engineInfo, engine) {
  if (!engineInfo.available) return "var(--text-2)";
  const works = !!engineInfo.available[engine];
  const failed = engine === engineInfo.engine && !!engineInfo.error;
  const located = engineInfo.configured ? !!engineInfo.configured[engine] : works;
  if (works && !failed) return "var(--sage)";
  if (located || failed) return "var(--amber)";
  return "var(--coral)";
}

function EngineDot({ engine }) {
  const { engineInfo } = useApp();
  return <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: engineDotColor(engineInfo, engine), marginRight: 7, verticalAlign: "middle", flexShrink: 0 }} />;
}

// The engine Astra3 analyzes with, and its version: a status dot (see
// engineDotColor) and "PyMOL v3.1.6.1" or "ChimeraX v1.8". Clicking it
// lists both engines and switches between them when both are installed and
// nothing is running.
function EngineIndicator({ onOpenSettings }) {
  const { engineInfo, switchEngine, isBusy } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const labelOf = (engine) => {
    const v = engineInfo.versions?.[engine];
    return `${ENGINE_NAMES[engine]}${v ? ` v${v}` : ""}`;
  };
  const label = engineInfo.none ? "No engine" : labelOf(engineInfo.engine);
  const color = engineInfo.none ? "var(--coral)" : engineDotColor(engineInfo, engineInfo.engine);
  const state = engineInfo.none ? "neither PyMOL nor ChimeraX was found"
    : engineInfo.error ? "could not start" : engineInfo.running ? "running" : "starts with the first analysis";

  const choose = async (engine) => {
    setSwitching(true);
    try {
      // Imports carry over: the new engine re-imports them under the same IDs.
      await switchEngine(engine);
      setOpen(false);
    } catch (e) {
      toast.push({ tone: "error", title: "Engine not switched", message: e.message });
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Analysis engine: ${label}, ${state}`}
        aria-expanded={open}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 8px 4px 10px",
          background: "var(--bg-1)", border: "1px solid var(--line-0)", borderRadius: 999,
          fontSize: 11.5, fontWeight: 600, color: "var(--text-1)", cursor: "pointer",
          fontFamily: "var(--font-ui)", whiteSpace: "nowrap",
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
        {label}
        <Icon name="chevronDown" size={11} />
      </button>
      {open && (
        <div className="astra-modal-in" style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, width: 250,
          background: "var(--bg-2)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-md)",
          padding: 12, boxShadow: "var(--shadow-lg)", zIndex: 300,
        }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Analysis engine</div>
          {["pymol", "chimerax", "astra3"].map((engine) => {
            const installed = engineInfo.available ? !!engineInfo.available[engine] : engine === engineInfo.engine;
            const inUse = !engineInfo.none && engine === engineInfo.engine;
            const canSwitch = installed && !inUse && !isBusy && !switching;
            return (
              <button
                key={engine}
                onClick={() => { if (canSwitch) choose(engine); }}
                disabled={!canSwitch}
                style={{
                  display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "7px 8px", marginBottom: 3,
                  border: `1px solid ${inUse ? "var(--accent)" : "var(--line-0)"}`, borderRadius: "var(--radius-sm)",
                  background: inUse ? "var(--bg-1)" : "transparent", color: "var(--text-0)",
                  cursor: canSwitch ? "pointer" : "default", textAlign: "left", fontFamily: "var(--font-ui)",
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: engineDotColor(engineInfo, engine) }} />
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{labelOf(engine)}</span>
                <span style={{ fontSize: 11, color: inUse ? "var(--accent)" : "var(--text-2)" }}>
                  {inUse ? "In use" : !installed ? "Not set up" : switching ? "" : isBusy ? "" : "Switch"}
                </span>
              </button>
            );
          })}
          {isBusy && (
            <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>Finish or cancel the current run to switch.</div>
          )}
          <button
            onClick={() => { setOpen(false); if (onOpenSettings) onOpenSettings(); }}
            style={{ marginTop: 8, background: "none", border: "none", padding: 0, color: "var(--accent)", fontSize: 11.5, cursor: "pointer", fontFamily: "var(--font-ui)" }}
          >
            Engine settings
          </button>
        </div>
      )}
    </div>
  );
}

function ConnectionIndicator() {
  const { state, latency, refresh } = useConnectionQuality();
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef(null);
  const meta = CONNECTION_STATES[state] || CONNECTION_STATES.unknown;
  const offline = state === "offline";

  useEffect(() => {
    if (!expanded) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setExpanded(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded]);

  const dot = (
    <span style={{ position: "relative", display: "inline-flex", width: 15, height: 15, alignItems: "center", justifyContent: "center" }}>
      <Icon name="wifi" size={15} />
      {offline && (
        // A slash as well as the muted colour, so "no connection" reads
        // without depending on colour alone.
        <span style={{
          position: "absolute", left: 1, top: 7, width: 14, height: 1.5,
          background: "var(--text-2)", transform: "rotate(-45deg)", borderRadius: 1,
        }} />
      )}
    </span>
  );

  return (
    <div ref={containerRef} style={{ display: "flex", alignItems: "center", position: "relative" }}>
      <button
        onClick={() => { if (!expanded) refresh(); setExpanded((v) => !v); }}
        title="Network connection"
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex",
          alignItems: "center", color: offline ? "var(--text-2)" : meta.color,
          opacity: state === "unknown" ? 0.5 : 1,
        }}
      >
        {dot}
      </button>
      {expanded && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60, width: 250,
          background: "var(--bg-1)", border: "1px solid var(--line-1)",
          borderRadius: "var(--radius-md)", padding: 12, boxShadow: "var(--shadow-md, 0 8px 24px rgba(0,0,0,0.28))",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ color: offline ? "var(--text-2)" : meta.color, display: "flex" }}>{dot}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-0)" }}>{meta.label}</span>
          </div>
          {latency !== null && (
            <div className="mono" style={{ fontSize: 11, color: "var(--text-1)", marginBottom: 6 }}>
              {latency} ms to {CONNECTION_PROBE_HOST}
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.5 }}>{meta.detail}</div>
          <button
            onClick={refresh}
            style={{
              marginTop: 10, width: "100%", padding: "5px 0", fontSize: 11, cursor: "pointer",
              background: "none", border: "1px solid var(--line-1)", borderRadius: "var(--radius-sm)",
              color: "var(--text-1)",
            }}
          >
            Check again
          </button>
        </div>
      )}
    </div>
  );
}

function NavRail({ page, setPage, collapsed, setCollapsed }) {
  const { activeJobs, isBusy, pendingPromptPage } = useApp();

  // Which page most likely started the running job, for the sidebar's dot only.
  const runningPageId = useMemo(() => {
    const job = activeJobs.find((j) => j.status === "running");
    if (!job) return null;
    const cmd = job.command.toUpperCase();
    if (cmd.startsWith("OVERLAY")) return "overlay";
    if (cmd.startsWith("TERMINI")) return "termini";
    if (cmd.startsWith("AST-")) return "import";
    return null; // a bare ID could be Home, Single or Batch
  }, [activeJobs]);

  return (
    <div style={{
      width: collapsed ? 60 : 210, flexShrink: 0, background: "var(--bg-1)", borderRight: "1px solid var(--line-0)",
      display: "flex", flexDirection: "column", transition: "width 160ms ease", overflow: "hidden",
    }}>
      {/* The window controls are inlaid over the top of this sidebar; this keeps
          the wordmark and navigation clear of them. Only the top section is offset.
          Also the window drag region, since the title bar is hidden. */}
      <div style={{ height: 22, flexShrink: 0, WebkitAppRegion: "drag" }} />
      <div style={{ padding: collapsed ? "18px 0" : "18px 16px", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", WebkitAppRegion: "drag" }}>
        <div onClick={() => setPage("home")} style={{ cursor: "pointer", WebkitAppRegion: "no-drag" }}>
          {collapsed ? <AstraLogo size={30} /> : <AstraWordmark />}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
        {NAV_ITEMS.map((item) => (
          <NavButton key={item.id} item={item} active={page === item.id} onClick={() => setPage(item.id)} collapsed={collapsed}
            running={isBusy && (runningPageId === item.id || (item.id === "console" && !runningPageId))}
            pendingPrompt={pendingPromptPage === item.id} />
        ))}
      </div>

      <div style={{ padding: "8px", borderTop: "1px solid var(--line-0)" }}>
        {NAV_BOTTOM.map((item) => (
          <NavButton key={item.id} item={item} active={page === item.id} onClick={() => setPage(item.id)} collapsed={collapsed}
            running={isBusy && (runningPageId === item.id || (item.id === "console" && !runningPageId))}
            pendingPrompt={pendingPromptPage === item.id} />
        ))}
        <NavButton
          item={{ id: "collapse", label: collapsed ? "Expand" : "Collapse", icon: "chevronRight" }}
          active={false} onClick={() => setCollapsed(!collapsed)} collapsed={collapsed}
          iconStyle={{ transform: collapsed ? "none" : "rotate(180deg)" }}
        />
      </div>
    </div>
  );
}

function NavButton({ item, active, onClick, collapsed, badge, iconStyle, running, pendingPrompt }) {
  return (
    <Tooltip block placement="right" text={collapsed ? item.label : (pendingPrompt ? "Needs your input" : "")}>
      <button
        onClick={onClick}
        className={`astra-nav-btn ${pendingPrompt ? "astra-nav-btn-alert" : ""}`}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 11,
          padding: collapsed ? "9px 0" : "9px 11px", marginBottom: 2, justifyContent: collapsed ? "center" : "flex-start",
          background: pendingPrompt ? "var(--coral-wash)" : (active ? "var(--accent-wash)" : "transparent"),
          color: pendingPrompt ? "var(--coral)" : (active ? "var(--accent-bright)" : "var(--text-1)"),
          border: pendingPrompt ? "1px solid var(--coral)" : "1px solid transparent",
          borderRadius: "var(--radius-md)", cursor: "pointer", fontSize: 13, fontWeight: 500,
          transition: "all 120ms ease", position: "relative",
        }}
      >
        <span style={{ display: "flex", flexShrink: 0, ...iconStyle }}><Icon name={pendingPrompt ? "alertTriangle" : item.icon} size={16} /></span>
        {!collapsed && <span style={{ flex: 1, minWidth: 0, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>}
        {/* A dot, as in the collapsed sidebar: a "Needs input" badge did not
            fit beside the longer labels. The tooltip says it in words. */}
        {!collapsed && pendingPrompt && <span className="astra-nav-alert-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--coral)", flexShrink: 0 }} />}
        {!collapsed && !pendingPrompt && running && <Spinner size={12} />}
        {!collapsed && !pendingPrompt && badge && <Badge tone="amber">{badge}</Badge>}
        {collapsed && pendingPrompt && <span className="astra-nav-alert-dot" style={{ position: "absolute", top: 6, right: 12, width: 7, height: 7, borderRadius: "50%", background: "var(--coral)", boxShadow: "0 0 0 2px var(--bg-1)" }} />}
        {collapsed && !pendingPrompt && (running || badge) && <span style={{ position: "absolute", top: 4, right: 10, width: 7, height: 7, borderRadius: "50%", background: running ? "var(--accent)" : "var(--amber)" }} className={running ? "astra-cursor-blink" : ""} />}
      </button>
    </Tooltip>
  );
}

const KEYBOARD_SHORTCUTS = [
  { keys: "\u2318 1–9", desc: "Jump to a sidebar page" },
  { keys: "\u2318 Enter", desc: "Run the current form / console command" },
  { keys: "\u2191 / \u2193", desc: "Advanced Console: cycle command history" },
  { keys: "\u2318 F", desc: "Find in the Advanced Console, Related Structures or README" },
  { keys: "Esc", desc: "Dismiss a prompt or popover" },
  { keys: "\u2318 =", desc: "Zoom in" },
  { keys: "\u2318 \u2212", desc: "Zoom out" },
  { keys: "\u2318 0", desc: "Reset zoom to 100%" },
];

function KeyboardShortcutsPanel({ onClose }) {
  return (
    <div className="astra-modal-in" style={{
      position: "absolute", top: "calc(100% + 8px)", right: 0, width: 280,
      background: "var(--bg-2)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-md)",
      padding: 14, boxShadow: "var(--shadow-lg)", zIndex: 300,
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Keyboard shortcuts</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {KEYBOARD_SHORTCUTS.map((s) => (
          <div key={s.keys} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11.5, color: "var(--text-1)" }}>{s.desc}</span>
            <span className="mono" style={{ fontSize: 11, background: "var(--bg-0)", border: "1px solid var(--line-1)", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>{s.keys}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotificationsPanel({ onClose }) {
  const { history } = useApp();
  const recent = history.slice(0, 6);
  return (
    <div className="astra-modal-in" style={{
      position: "absolute", top: "calc(100% + 8px)", right: 0, width: 300,
      background: "var(--bg-2)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-md)",
      padding: 14, boxShadow: "var(--shadow-lg)", zIndex: 300,
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Recent activity</div>
      {recent.length === 0 ? (
        <div style={{ fontSize: 11.5, color: "var(--text-1)" }}>Nothing yet. Completed and failed runs will show up here.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recent.map((h) => (
            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: h.status === "complete" ? "var(--sage)" : h.status === "failed" ? "var(--coral)" : "var(--amber)", flexShrink: 0 }} />
              <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, flex: 1 }}>{h.label}</span>
              <span style={{ fontSize: 10.5, color: "var(--text-2)" }}>{timeAgo(h.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A magnifier button that expands into the zoom controls. The keyboard
// shortcuts work either way.
function ZoomControl({ zoomFactor, zoomIn, zoomOut, zoomReset }) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef(null);

  // Collapse on an outside click.
  useEffect(() => {
    if (!expanded) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setExpanded(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded]);

  return (
    <div ref={containerRef} style={{ display: "flex", alignItems: "center" }}>
      {expanded ? (
        <div style={{ display: "flex", alignItems: "center", gap: 2, border: "1px solid var(--line-1)", borderRadius: "var(--radius-md)", padding: 2 }}>
          <Tooltip text="Zoom out (Ctrl/Cmd -)" align="right" placement="bottom">
            <IconButton name="minus" onClick={zoomOut} />
          </Tooltip>
          <Tooltip text="Reset zoom (Ctrl/Cmd 0)" align="right" placement="bottom">
            <button onClick={zoomReset} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text-1)", padding: "0 4px", fontFamily: "var(--font-mono)", minWidth: 34 }}>
              {Math.round((zoomFactor || 1) * 100)}%
            </button>
          </Tooltip>
          <Tooltip text="Zoom in (Ctrl/Cmd =)" align="right" placement="bottom">
            <IconButton name="plus" onClick={zoomIn} />
          </Tooltip>
          <Tooltip text="Collapse zoom controls" align="right" placement="bottom">
            <IconButton name="search" active onClick={() => setExpanded(false)} />
          </Tooltip>
        </div>
      ) : (
        <Tooltip text="Zoom controls" align="right" placement="bottom">
          <IconButton name="search" onClick={() => setExpanded(true)} />
        </Tooltip>
      )}
    </div>
  );
}

function TopBar({ page, setPage, zoomFactor, zoomIn, zoomOut, zoomReset }) {
  const { activeJobs, isBusy, cancelRun } = useApp();
  const toast = useToast();
  // In fullscreen the bar slides away and returns when the pointer reaches the
  // top edge.
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [edgeHover, setEdgeHover] = useState(false);
  useEffect(() => {
    if (!window.astra3Native?.onFullScreenChange) return;
    window.astra3Native.isFullScreen?.().then(setIsFullScreen).catch(() => {});
    return window.astra3Native.onFullScreenChange(setIsFullScreen);
  }, []);
  useEffect(() => {
    if (!isFullScreen) { setEdgeHover(false); return; }
    // A pointer listener rather than :hover on a hit strip, which would lose the
    // hover as soon as the bar slid under the cursor.
    const onMove = (e) => setEdgeHover(e.clientY <= (edgeHoverRef.current ? 56 : 4));
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [isFullScreen]);
  const edgeHoverRef = useRef(false);
  edgeHoverRef.current = edgeHover;
  const hidden = isFullScreen && !edgeHover;
  const pageTitle = [...NAV_ITEMS, ...NAV_BOTTOM].find((n) => n.id === page)?.label || "Astra3";
  const [openPanel, setOpenPanel] = useState(null); // null | "keys" | "notifications"
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!openPanel) return;
    const onKey = (e) => { if (e.key === "Escape") setOpenPanel(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPanel]);

  // isBusy clears when the run ends however it ends, which resets cancelling.
  useEffect(() => {
    if (!isBusy) setCancelling(false);
  }, [isBusy]);

  const handleCancel = async () => {
    setCancelling(true);
    const result = await cancelRun();
    // Report the cancel outcome so the button visibly does something.
    if (result?.ok) {
      toast.push({ tone: "neutral", title: "Cancelling", message: result.note || "Stopping the current analysis." });
    } else if (result?.error) {
      toast.push({ tone: "error", title: "Could not cancel", message: result.error });
      setCancelling(false);
    }
  };

  return (
    <div style={{
      height: 52, flexShrink: 0, borderBottom: "1px solid var(--line-0)", background: "var(--bg-0)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      // Extra right padding leaves room for the native minimise/maximise/
      // close buttons, which now sit over the app's own top bar. Without it
      // the zoom and notification controls would end up underneath them.
      padding: "0 20px",
      position: isFullScreen ? "absolute" : "relative",
      top: 0, left: 0, right: 0, zIndex: 40,
      transform: hidden ? "translateY(-100%)" : "translateY(0)",
      transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
      // The bar doubles as the window's drag handle now that the system
      // titlebar is hidden. Interactive children opt back out below.
      WebkitAppRegion: "drag",
    }}>
      <div style={{ fontSize: 14.5, fontWeight: 600 }}>{pageTitle}</div>
      {/* Anything clickable has to opt OUT of the drag region, or the window
          swallows the click and moves instead. */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, WebkitAppRegion: "no-drag" }}>
        {activeJobs.length > 0 && (() => {
          const runningCount = activeJobs.filter((j) => j.status === "running").length;
          if (runningCount > 0) {
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-1)" }}>
                <Spinner size={13} />
                {runningCount} job{runningCount > 1 ? "s" : ""} running
              </div>
            );
          }
          // All remaining jobs have finished and are about to clear; shown briefly as
          // confirmation.
          const anyCancelled = activeJobs.some((j) => j.status === "cancelled");
          const anyFailed = activeJobs.some((j) => j.status === "failed");
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: anyCancelled ? "var(--amber)" : anyFailed ? "var(--coral)" : "var(--sage)" }}>
              <Icon name={anyCancelled || anyFailed ? "alertTriangle" : "check"} size={13} />
              {anyCancelled ? "Job cancelled" : anyFailed ? "Job failed"
                : (activeJobs.length > 1 ? "All jobs complete" : "Job complete")}
            </div>
          );
        })()}
        {isBusy && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            title="Cancel the currently running Astra3 command"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 12px", fontSize: 12.5, fontWeight: 700,
              fontFamily: "var(--font-ui)", border: "1px solid var(--coral)",
              borderRadius: "var(--radius-md)", background: "var(--coral)",
              color: "#fff", cursor: cancelling ? "not-allowed" : "pointer",
              opacity: cancelling ? 0.6 : 1,
            }}
          >
            {cancelling ? <Spinner size={12} /> : <Icon name="x" size={13} />}
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        )}
        <EngineIndicator onOpenSettings={() => setPage && setPage("settings")} />
        {/* Network state is relevant whether or not zoom controls are
            available, so it is not gated on them. */}
        <ConnectionIndicator />
        {zoomIn && (
          <ZoomControl zoomFactor={zoomFactor} zoomIn={zoomIn} zoomOut={zoomOut} zoomReset={zoomReset} />
        )}
        <div style={{ position: "relative" }}>
          <Tooltip text={openPanel ? "" : "Keyboard shortcuts"} align="right" placement="bottom">
            <IconButton name="keyboard" active={openPanel === "keys"} onClick={() => setOpenPanel(openPanel === "keys" ? null : "keys")} />
          </Tooltip>
          {openPanel === "keys" && <KeyboardShortcutsPanel />}
        </div>
        <div style={{ position: "relative" }}>
          <Tooltip text={openPanel ? "" : "Notifications"} align="right" placement="bottom">
            <IconButton name="bell" active={openPanel === "notifications"} onClick={() => setOpenPanel(openPanel === "notifications" ? null : "notifications")} />
          </Tooltip>
          {openPanel === "notifications" && <NotificationsPanel />}
        </div>
        {openPanel && <div onClick={() => setOpenPanel(null)} style={{ position: "fixed", inset: 0, zIndex: 250 }} />}
      </div>
    </div>
  );
}

/* ============================================================
   DROP ZONE (shared: Home + Import Local page)
   ============================================================ */
function DropZone({ onFiles, accept = ".pdb,.ent,.cif,.mmcif,.pse,.gz", compact = false }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  // Resolves each File to { name, size, ext, path }. The path comes from the
  // preload (webUtils) and is null outside the desktop app.
  const resolveFiles = (rawFiles) => {
    const hasPathResolver = typeof window !== "undefined" && window.astra3Native?.getPathForFile;
    return rawFiles.map((f) => ({
      // A compressed coordinate file (1abc.cif.gz) is described by the
      // format inside it.
      name: f.name, size: f.size, ext: f.name.toLowerCase().replace(/\.gz$/, "").split(".").pop(),
      path: hasPathResolver ? window.astra3Native.getPathForFile(f) : null,
      file: f, // raw File object kept too, for any consumer (e.g. Batch's .txt reader) that still wants to read its contents directly rather than go through a filesystem path
    }));
  };
  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) onFiles(resolveFiles(files));
  };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `1.5px dashed ${dragOver ? "var(--accent)" : "var(--line-1)"}`,
        borderRadius: "var(--radius-lg)", padding: compact ? "22px 16px" : "38px 20px",
        background: dragOver ? "var(--accent-wash)" : "var(--bg-1)", textAlign: "center", cursor: "pointer",
        transition: "all 150ms ease",
      }}
    >
      <input ref={inputRef} type="file" multiple accept={accept} style={{ display: "none" }}
        onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) onFiles(resolveFiles(f)); }} />
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center", color: dragOver ? "var(--accent)" : "var(--text-1)" }}>
          <Icon name="upload" size={20} />
        </div>
      </div>
      <div style={{ fontSize: compact ? 12.5 : 13.5, fontWeight: 600, marginBottom: 3 }}>
        {dragOver ? "Drop to import" : "Drag and drop structures here"}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-1)" }}>{accept.includes(".pse") ? ".pdb, .cif / .mmcif or .pse (also .gz) · or click to browse" : `${accept.split(",").join(", ")} · or click to browse`}</div>
    </div>
  );
}

/* ============================================================
   HOME PAGE
   ============================================================ */
function HomePage({ setPage, openQuickAnalyze }) {
  const { history, toggleFavorite } = useApp();
  const toast = useToast();
  const recent = history.slice(0, 5);

  const handleFiles = (files) => {
    // Home's drop zone only opens the Import page; the files have to be dropped
    // there, and the toast says so.
    toast.push({ tone: "neutral", title: "Opening Import page", message: `Drop ${files.length} file(s) there to import ${files.length === 1 ? "it" : "them"}.` });
    setPage("import");
  };

  return (
    <PageScroll>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "48px 32px 60px" }}>
        {/* Hero */}
        <div style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 40 }}>
          <AstraLogo size={64} animated />
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>Astra3</div>
            <div style={{ fontSize: 13.5, color: "var(--text-1)", marginTop: 2 }}>Structural Analysis Toolkit for PDB Rendering Automation</div>
          </div>
        </div>

        {/* Quick actions grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
          <QuickAction icon="analysis" title="Fetch by ID" desc="Analyze a PDB or mmCIF entry" onClick={() => setPage("single")} />
          <QuickAction icon="overlay" title="Overlay" desc="Align & compare structures" onClick={() => setPage("overlay")} />
          <QuickAction icon="termini" title="Termini" desc="Compare N-/C-termini" onClick={() => setPage("termini")} />
          <QuickAction icon="batch" title="Batch" desc="Process a queue of IDs" onClick={() => setPage("batch")} />
        </div>

        <div>
          <SectionLabel>Import a local structure</SectionLabel>
          <DropZone onFiles={handleFiles} />
        </div>

        <div style={{ marginTop: 32 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <SectionLabel style={{ marginBottom: 0 }}>Recent analyses</SectionLabel>
            <Button variant="ghost" size="sm" onClick={() => setPage("history")}>View all<Icon name="chevronRight" size={13} /></Button>
          </div>
          {recent.length === 0 ? (
            <EmptyState icon="clock" title="No analyses yet" description="Structures you analyze will show up here for quick access." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recent.map((h) => <HistoryRow key={h.id} entry={h} onToggleFavorite={() => toggleFavorite(h.id)} setPage={setPage} compact />)}
            </div>
          )}
        </div>
      </div>
      <div style={{ maxWidth: 900, margin: "36px auto 0", padding: "0 32px" }}>
        <CitationBlock />
      </div>
    </PageScroll>
  );
}

// Same wording as the citation in every HTML report (astra3_render_report.py).
function CitationBlock() {
  const [copied, setCopied] = useState(false);
  const citationText = 'Aguirre, A. (2026). Astra3: Structural Analysis Toolkit for PDB Rendering Automation [Computer software]. Version 2.0.3. https://github.com/andre-aguirre/Astra3, https://doi.org/10.5281/zenodo.22928159';
  const copyCitation = () => {
    const write = window.astra3Native?.copyText
      ? window.astra3Native.copyText(citationText)
      : navigator.clipboard?.writeText(citationText).then(() => true);
    Promise.resolve(write).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-1)", border: "1px solid var(--line-0)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
      <Icon name="citation" size={16} style={{ color: "var(--text-2)", flexShrink: 0 }} />
      <span className="mono" style={{ flex: 1, fontSize: 11.5, color: "var(--text-1)", wordBreak: "break-word" }}>
        Aguirre, A. (2026). Astra3: Structural Analysis Toolkit for PDB Rendering Automation [Computer software]. Version 2.0.3.{" "}
        <a href="https://github.com/andre-aguirre/Astra3" target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>github.com/andre-aguirre/Astra3</a>,{" "}
        <a href="https://doi.org/10.5281/zenodo.22928159" target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>doi.org/10.5281/zenodo.22928159</a>
      </span>
      {/* Light theme keeps the stock secondary look, which was already fine.
          The dark override lives in index.html under .astra-citation-btn. */}
      <Button variant="secondary" size="sm" icon={copied ? "check" : "copy"} onClick={copyCitation}
              className="astra-citation-btn" style={{ flexShrink: 0 }}>
        {copied ? "Copied" : "Copy citation"}
      </Button>
    </div>
  );
}

// Markdown renderer for the README viewer, covering only what README.md uses:
// headings, bold, inline and fenced code, tables, rules, paragraphs, lists.
function renderMarkdownLite(md) {
  const lines = md.split("\n");
  const blocks = [];
  let i = 0;
  const renderInline = (text) => {
    // Bold, inline code and links, in any order within a line.
    const parts = [];
    let rest = text;
    const re = /(\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\))/;
    let key = 0;
    while (rest.length) {
      const m = re.exec(rest);
      if (!m) { parts.push(rest); break; }
      if (m.index > 0) parts.push(rest.slice(0, m.index));
      if (m[2] !== undefined) parts.push(<strong key={key++}>{m[2]}</strong>);
      else if (m[3] !== undefined) parts.push(<code key={key++} className="mono" style={{ background: "var(--bg-2)", padding: "1px 5px", borderRadius: 4, fontSize: "0.92em" }}>{m[3]}</code>);
      else if (m[4] !== undefined) parts.push(<a key={key++} href={m[5]} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{m[4]}</a>);
      rest = rest.slice(m.index + m[0].length);
    }
    return parts;
  };
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      i++;
      blocks.push(<pre key={blocks.length} className="mono" style={{ background: "var(--bg-2)", padding: 12, borderRadius: "var(--radius-md)", overflowX: "auto", fontSize: 12, lineHeight: 1.6 }}>{codeLines.join("\n")}</pre>);
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      const text = line.replace(/^#+\s*/, "");
      const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      blocks.push(<Tag key={blocks.length} style={{ marginTop: level === 1 ? 4 : 22, marginBottom: 8, fontWeight: 700, fontSize: level === 1 ? 20 : level === 2 ? 16 : 14 }}>{renderInline(text)}</Tag>);
      i++; continue;
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={blocks.length} style={{ border: "none", borderTop: "1px solid var(--line-0)", margin: "18px 0" }} />);
      i++; continue;
    }
    if (/^\s*[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
        let item = lines[i].replace(/^\s*[-*]\s/, "");
        i++;
        // Joining every immediately-following non-bullet, non-blank line into
        // the CURRENT item (with a space, matching how a wrapped sentence
        // reads) before it's ever passed to renderInline fixes this
        // generally, not just for this one bullet.
        while (i < lines.length && lines[i].trim() && !/^\s*[-*]\s/.test(lines[i]) && !/^#{1,3}\s/.test(lines[i]) && !/^---+$/.test(lines[i].trim()) && !lines[i].startsWith("```") && !/^\|.*\|\s*$/.test(lines[i])) {
          item += " " + lines[i].trim();
          i++;
        }
        items.push(item);
      }
      blocks.push(<ul key={blocks.length} style={{ margin: "6px 0", paddingLeft: 20 }}>{items.map((it, idx) => <li key={idx} style={{ marginBottom: 3, fontSize: 13, lineHeight: 1.6 }}>{renderInline(it)}</li>)}</ul>);
      continue;
    }
    // Numbered list: "1. ...", wrapped lines joined into their item.
    if (/^\s*\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        let item = lines[i].replace(/^\s*\d+\.\s/, "");
        i++;
        while (i < lines.length && lines[i].trim() && !/^\s*(\d+\.|[-*])\s/.test(lines[i]) && !/^#{1,3}\s/.test(lines[i]) && !lines[i].startsWith("```")) {
          item += " " + lines[i].trim();
          i++;
        }
        items.push(item);
      }
      blocks.push(<ol key={blocks.length} style={{ margin: "6px 0", paddingLeft: 22 }}>{items.map((it, idx) => <li key={idx} style={{ marginBottom: 3, fontSize: 13, lineHeight: 1.6 }}>{renderInline(it)}</li>)}</ol>);
      continue;
    }
    // Block quote: "> ..." lines; a bare ">" starts a new paragraph inside it.
    if (/^>/.test(line)) {
      const paras = [[]];
      while (i < lines.length && /^>/.test(lines[i])) {
        const text = lines[i].replace(/^>\s?/, "");
        if (text.trim()) paras[paras.length - 1].push(text.trim());
        else paras.push([]);
        i++;
      }
      blocks.push(<blockquote key={blocks.length} style={{ margin: "8px 0", padding: "2px 0 2px 14px", borderLeft: "3px solid var(--line-1)" }}>
        {paras.filter((pl) => pl.length).map((pl, idx) => <p key={idx} style={{ margin: "4px 0", fontSize: 13, lineHeight: 1.6, color: "var(--text-1)" }}>{renderInline(pl.join(" "))}</p>)}
      </blockquote>);
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      // Header row, the |---| separator (skipped), then rows until a non-table line.
      const splitRow = (row) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      const headerCells = splitRow(line);
      i += 2; // header + separator
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      blocks.push(
        <div key={blocks.length} style={{ overflowX: "auto", margin: "10px 0" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
            <thead>
              <tr>{headerCells.map((c, ci) => (
                <th key={ci} style={{ textAlign: "left", padding: "6px 10px", borderBottom: "1.5px solid var(--line-1)", color: "var(--text-0)", fontWeight: 700 }}>{renderInline(c)}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>{r.map((c, ci) => (
                  <td key={ci} style={{ padding: "6px 10px", borderBottom: "1px solid var(--line-0)", color: "var(--text-1)", verticalAlign: "top" }}>{renderInline(c)}</td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    if (line.trim() === "") { i++; continue; }
    // Paragraph: contiguous non-blank, non-special lines.
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^#{1,3}\s/.test(lines[i]) && !lines[i].startsWith("```") && !/^\s*([-*]|\d+\.)\s/.test(lines[i]) && !/^>/.test(lines[i]) && !/^---+$/.test(lines[i].trim())) {
      paraLines.push(lines[i]); i++;
    }
    blocks.push(<p key={blocks.length} style={{ margin: "6px 0", fontSize: 13, lineHeight: 1.7, color: "var(--text-1)" }}>{renderInline(paraLines.join(" "))}</p>);
  }
  return blocks;
}

/* ============================================================
   CITATION & DOCS PAGE
   ============================================================
   The citation block (also on Home), README.md rendered, and the license
   files, read through app:getDocPath and fs:readFile (main.js's
   resolveDocPath handles development and packaged paths).
   ============================================================ */
// Find-in-page for the README, built on the DOM: matches are wrapped in <mark>
// so they can be counted, scrolled to and marked in the gutter. window.find()
// also matches the search box itself. Electron has no find bar.
const FIND_HIT_CLASS = "astra-find-hit";
const FIND_CURRENT_CLASS = "astra-find-hit-current";

// Unwraps every mark and rejoins the text nodes it split. normalize() is what
// makes a second search see whole words again: without it "term" searched
// after "ter" leaves the text fragmented and the longer word never matches.
function clearFindHighlights(root) {
  if (!root) return;
  for (const mark of Array.from(root.querySelectorAll("mark." + FIND_HIT_CLASS))) {
    const parent = mark.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  }
  const overlay = root.querySelector(".astra-find-arrows");
  if (overlay) overlay.remove();
}

function highlightFindMatches(root, text) {
  clearFindHighlights(root);
  const needle = (text || "").toLowerCase();
  if (!root || !needle.trim()) return [];

  // Collected before any splitting: mutating the tree while a TreeWalker is
  // still walking it is how a find loses matches or revisits its own output.
  const textNodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeValue && node.nodeValue.toLowerCase().includes(needle)) textNodes.push(node);
    node = walker.nextNode();
  }

  const hits = [];
  for (const textNode of textNodes) {
    let cursor = textNode;
    for (;;) {
      const value = cursor.nodeValue || "";
      const idx = value.toLowerCase().indexOf(needle);
      if (idx === -1) break;
      const matched = cursor.splitText(idx);
      const rest = matched.splitText(needle.length);
      const mark = document.createElement("mark");
      mark.className = FIND_HIT_CLASS;
      mark.textContent = matched.nodeValue;
      if (matched.parentNode) matched.parentNode.replaceChild(mark, matched);
      hits.push(mark);
      cursor = rest;
    }
  }
  return hits;
}

// One arrow per match, in the gutter beside the line it sits on. Colour comes
// from --text-0, which the light and dark themes already define as near-black
// and near-white respectively, so the arrows follow the theme without knowing
// which one is active. The current match gets the accent instead.
function drawFindArrows(root, hits, currentIndex) {
  if (!root) return;
  const existing = root.querySelector(".astra-find-arrows");
  if (existing) existing.remove();
  if (!hits.length) return;
  const overlay = document.createElement("div");
  overlay.className = "astra-find-arrows";
  root.appendChild(overlay);

  // One arrow per line, not per match, so several matches on a line do not
  // stack arrows; the highlight shows which match is current.
  const lines = new Map();
  hits.forEach((hit, i) => {
    const key = Math.round(hit.offsetTop);
    const line = lines.get(key);
    if (line) {
      if (i === currentIndex) line.current = true;
    } else {
      lines.set(key, { top: hit.offsetTop, height: hit.offsetHeight, current: i === currentIndex });
    }
  });

  for (const line of lines.values()) {
    const arrow = document.createElement("span");
    arrow.className = "astra-find-arrow" + (line.current ? " is-current" : "");
    arrow.textContent = "\u25B6";
    arrow.style.top = `${line.top}px`;
    // Sized to the line it marks and centred within it, so an arrow beside a
    // heading and one beside body text both sit on their own text's midline.
    arrow.style.height = `${line.height}px`;
    overlay.appendChild(arrow);
  }
}

// Also the Advanced Console's find bar: opens on Cmd/Ctrl+F, closes on Esc
// (onClose), has no gutter arrows, and re-finds as output arrives
// (contentVersion). Every page stays mounted, so shortcuts check `active`.
const PageActiveContext = createContext(true);

// Cmd+F (Ctrl+F on Windows) on the page on screen.
function useFindShortcut(onFind) {
  const active = useContext(PageActiveContext);
  const activeRef = useRef(active);
  activeRef.current = active;
  const onFindRef = useRef(onFind);
  onFindRef.current = onFind;
  useEffect(() => {
    const onKey = (e) => {
      if (!activeRef.current || !(e.metaKey || e.ctrlKey) || String(e.key).toLowerCase() !== "f") return;
      e.preventDefault();
      onFindRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function ReadmeFindBar({ query, setQuery, status, setStatus, contentRef, placeholder = "Find in README…", arrows = true,
                         onClose, contentVersion, autoFocus = false, style }) {
  const [currentIndex, setCurrentIndex] = useState(-1); // -1 = nothing active yet
  const currentIndexRef = useRef(-1);
  const [totalMatches, setTotalMatches] = useState(0);
  const hitsRef = useRef([]);
  const searchedRef = useRef("");
  const boxRef = useRef(null);

  const focusInput = () => {
    const input = boxRef.current && boxRef.current.querySelector("input");
    if (input) { input.focus(); input.select(); }
  };

  // Cmd/Ctrl+F; Electron has no find bar of its own.
  useFindShortcut(focusInput);
  useEffect(() => {
    if (autoFocus) focusInput();
  }, []);

  // Highlights are DOM nodes inside content this component does not own, so
  // they have to be taken back out when it goes away.
  useEffect(() => () => clearFindHighlights(contentRef.current), [contentRef]);

  // New content (console output): the same term is found again, keeping the
  // current match, without scrolling away from it.
  useEffect(() => {
    if (contentVersion === undefined || !searchedRef.current) return;
    const hits = highlightFindMatches(contentRef.current, searchedRef.current);
    hitsRef.current = hits;
    const kept = hits.length ? Math.min(Math.max(currentIndexRef.current, 0), hits.length - 1) : -1;
    hits.forEach((hit, i) => hit.classList.toggle(FIND_CURRENT_CLASS, i === kept));
    currentIndexRef.current = kept;
    setCurrentIndex(kept);
    setTotalMatches(hits.length);
    setStatus(hits.length ? "found" : "not-found");
  }, [contentVersion]);

  const goTo = (index, hits) => {
    const list = hits || hitsRef.current;
    if (!list.length) return;
    const wrapped = ((index % list.length) + list.length) % list.length;
    list.forEach((hit, i) => hit.classList.toggle(FIND_CURRENT_CLASS, i === wrapped));
    if (arrows) drawFindArrows(contentRef.current, list, wrapped);
    // What makes Enter behave like a real find bar: the page moves to the
    // match instead of leaving it somewhere off screen.
    list[wrapped].scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    currentIndexRef.current = wrapped;
    setCurrentIndex(wrapped);
  };

  const runFind = (text, backwards) => {
    const trimmed = (text || "").trim();
    if (!trimmed) {
      clearFindHighlights(contentRef.current);
      hitsRef.current = [];
      searchedRef.current = "";
      setStatus(null); setCurrentIndex(-1); setTotalMatches(0);
      currentIndexRef.current = -1;
      return;
    }
    // Re-highlight only when the term changed; otherwise Enter steps through
    // the matches already on screen.
    if (searchedRef.current !== trimmed) {
      const hits = highlightFindMatches(contentRef.current, trimmed);
      hitsRef.current = hits;
      searchedRef.current = trimmed;
      setTotalMatches(hits.length);
      setStatus(hits.length ? "found" : "not-found");
      if (!hits.length) { setCurrentIndex(-1); return; }
      goTo(0, hits);
      return;
    }
    if (!hitsRef.current.length) return;
    goTo(currentIndex + (backwards ? -1 : 1));
  };

  return (
    <div ref={boxRef} className={onClose ? "astra-modal-in" : undefined} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, ...style }}>
      <TextInput
        icon="search"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setStatus(null);
          setCurrentIndex(-1);
          setTotalMatches(0);
          searchedRef.current = "";
          if (!e.target.value.trim()) clearFindHighlights(contentRef.current);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); runFind(query, e.shiftKey); }
          if (e.key === "Escape") {
            e.preventDefault();
            setQuery("");
            runFind("", false);
            if (onClose) onClose();
          }
        }}
        style={{ maxWidth: 260 }}
      />
      <Tooltip text="Previous match" align="top">
        <IconButton name="chevronUp" onClick={() => runFind(query, true)} disabled={!query.trim()} />
      </Tooltip>
      <Tooltip text="Next match" align="top">
        <IconButton name="chevronDown" onClick={() => runFind(query, false)} disabled={!query.trim()} />
      </Tooltip>
      {status === "found" && query.trim() && totalMatches > 0 && (
        <span style={{ fontSize: 11.5, color: "var(--text-2)" }}>{currentIndex + 1} of {totalMatches}</span>
      )}
      {status === "not-found" && query.trim() && (
        <span style={{ fontSize: 11.5, color: "var(--coral)" }}>No matches</span>
      )}
      {onClose && (
        <Tooltip text="Close (Esc)" align="right">
          <IconButton name="x" onClick={() => { clearFindHighlights(contentRef.current); onClose(); }} />
        </Tooltip>
      )}
    </div>
  );
}

function CitationPage() {
  const { isElectron } = useApp();
  const [readmeText, setReadmeText] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [licenseModal, setLicenseModal] = useState(null); // { filename, text } for LICENSE, THIRD_PARTY_NOTICES.txt, CITATION.cff or PRIVACY.md
  const [findQuery, setFindQuery] = useState("");
  const [findStatus, setFindStatus] = useState(null); // null | "found" | "not-found"
  const readmeRef = useRef(null);
  // Memoised so React is handed the SAME element on every re-render and
  // skips reconciling this subtree. The find bar wraps matches in <mark>
  // nodes inside it; a re-render that rebuilt the markdown would discard
  // them mid-search.
  const renderedReadme = useMemo(() => (readmeText === null ? null : renderMarkdownLite(readmeText)), [readmeText]);

  useEffect(() => {
    if (!isElectron) { setLoadError("Available in the desktop app."); return; }
    let cancelled = false;
    window.astra3Native.getDocPath("README.md").then((path) => {
      if (!path) { if (!cancelled) setLoadError("Could not locate README.md."); return; }
      return window.astra3Native.readFile(path).then((text) => { if (!cancelled) setReadmeText(text); });
    }).catch((e) => { if (!cancelled) setLoadError(e?.message || "Could not read README.md."); });
    return () => { cancelled = true; };
  }, [isElectron]);

  const openDoc = async (filename) => {
    if (!isElectron) return;
    const path = await window.astra3Native.getDocPath(filename);
    if (!path) return;
    const text = await window.astra3Native.readFile(path);
    setLicenseModal({ filename, text });
  };

  return (
    <PageScroll>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 32px 60px" }}>
        <SectionLabel>Citation</SectionLabel>
        <div style={{ marginBottom: 24 }}>
          <CitationBlock />
        </div>

        <SectionLabel>License &amp; third-party notices</SectionLabel>
        <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
          <Button variant="secondary" size="sm" icon="citation" onClick={() => openDoc("LICENSE")}>Astra3 License (GNU GPL v3)</Button>
          <Button variant="ghost" size="sm" onClick={() => openDoc("THIRD_PARTY_NOTICES.txt")}>Third-party notices</Button>
          <Button variant="ghost" size="sm" onClick={() => openDoc("CITATION.cff")}>CITATION.cff</Button>
          <Button variant="ghost" size="sm" onClick={() => openDoc("PRIVACY.md")}>Privacy Policy</Button>
        </div>

        <SectionLabel>Documentation (README)</SectionLabel>
        {readmeText !== null && !loadError && (
          <ReadmeFindBar
            query={findQuery}
            setQuery={setFindQuery}
            status={findStatus}
            setStatus={setFindStatus}
            contentRef={readmeRef}
          />
        )}
        <Card style={{ padding: 24 }}>
          {loadError ? (
            <EmptyState icon="alertTriangle" title="Could not load README" description={loadError} />
          ) : readmeText === null ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-1)", fontSize: 13, padding: 20 }}>
              <Spinner size={16} /> Loading README…
            </div>
          ) : (
            /* position:relative anchors the gutter arrows, which are
               absolutely positioned against this container. */
            <div ref={readmeRef} style={{ position: "relative" }}>{renderedReadme}</div>
          )}
        </Card>
      </div>

      {licenseModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }} onClick={() => setLicenseModal(null)}>
          <div className="astra-modal-in" style={{ width: "min(720px, 90vw)", maxHeight: "80vh", display: "flex", flexDirection: "column", background: "var(--bg-1)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-0)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{licenseModal.filename === "PRIVACY.md" ? "Privacy Policy" : licenseModal.filename}</span>
              <IconButton name="x" title="Close" onClick={() => setLicenseModal(null)} />
            </div>
            {licenseModal.filename.endsWith(".md") ? (
              <div style={{ padding: 18, overflow: "auto", fontSize: 12.5, lineHeight: 1.6 }}>{renderMarkdownLite(licenseModal.text)}</div>
            ) : (
              <pre className="mono" style={{ margin: 0, padding: 18, overflow: "auto", fontSize: 11.5, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{licenseModal.text}</pre>
            )}
          </div>
        </div>
      )}
    </PageScroll>
  );
}

function QuickAction({ icon, title, desc, onClick }) {
  return (
    <Card hover onClick={onClick} style={{ padding: 16 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--accent-wash)", color: "var(--accent-bright)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
        <Icon name={icon} size={17} />
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-1)" }}>{desc}</div>
    </Card>
  );
}

// A sidebar section whose contents can be folded away. Open by default,
// because the panel's job is to show what a structure contains; collapsing is
// for getting a long list out of the way once you have seen it.
function CollapsibleSection({ title, count, defaultOpen = true, children, style }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={style}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6, width: "100%",
          background: "none", border: "none", padding: 0, cursor: "pointer",
          marginBottom: open ? 12 : 6,
          fontSize: 11.5, fontWeight: 700, color: "var(--text-1)",
          textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "left",
        }}
      >
        <span style={{ display: "inline-flex", transition: "transform 160ms ease", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
          <Icon name="chevronRight" size={11} />
        </span>
        {title}{count != null && count !== "" ? ` (${count})` : ""}
      </button>
      {open && children}
    </div>
  );
}

function SectionLabel({ children, style }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-1)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, ...style }}>{children}</div>;
}

function PageScroll({ children, style }) {
  return <div style={{ flex: 1, overflowY: "auto", ...style }}>{children}</div>;
}

// Greys out a page's controls while another page's command runs (one command
// at a time). A page's own run is not blocked by this.
function BusyLock({ active, children }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ opacity: active ? 0.45 : 1, pointerEvents: active ? "none" : "auto", transition: "opacity 150ms ease", filter: active ? "grayscale(0.3)" : "none" }}>
        {children}
      </div>
      {active && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.02)", zIndex: 5,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-2)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-md)", padding: "8px 14px", boxShadow: "var(--shadow-md)" }}>
            <Spinner size={13} />
            <span style={{ fontSize: 12, color: "var(--text-1)" }}>Astra3 is busy with another task</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   HISTORY ROW + HISTORY PAGE
   ============================================================ */
const KIND_META = {
  single: { icon: "analysis", label: "Single" },
  overlay: { icon: "overlay", label: "Overlay" },
  termini: { icon: "termini", label: "Termini" },
  batch: { icon: "batch", label: "Batch" },
};
const STATUS_META = {
  complete: { tone: "success", label: "Complete" },
  failed: { tone: "error", label: "Failed" },
  running: { tone: "warning", label: "Running" },
  // Only a BATCH: a queue stopped part-way kept the structures it finished.
  // Amber, since it was stopped rather than failed.
  cancelled: { tone: "warning", label: "Cancelled" },
};

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// A date as the reports show it: MM-DD-YYYY, with HH:MM (24-hour, local time).
function displayDate(value, withTime = false) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? "");
  const p = (n) => String(n).padStart(2, "0");
  const day = `${p(d.getMonth() + 1)}-${p(d.getDate())}-${d.getFullYear()}`;
  return withTime ? `${day} ${p(d.getHours())}:${p(d.getMinutes())}` : day;
}

function HistoryRow({ entry, onToggleFavorite, onDelete, setPage, compact, sizeBytes = 0,
                     selectable = false, selected = false, onToggleSelect }) {
  const k = KIND_META[entry.kind];
  const s = STATUS_META[entry.status];
  const { setSelectedReportId } = useApp();
  // Selects the clicked entry BEFORE navigating, so the Reports page opens
  // showing this structure rather than whatever happened to be selected.
  const openInReports = () => {
    if (!setPage) return;
    setSelectedReportId(entry.id);
    setPage("reports");
  };
  // In selection mode the row's click target changes meaning: clicking picks
  // the entry rather than navigating away from the page, which is what a
  // person expects while choosing several things to act on.
  const onRowClick = selectable ? () => onToggleSelect && onToggleSelect(entry.id) : openInReports;
  return (
    <Card
      hover
      style={{
        padding: compact ? "10px 14px" : "13px 16px", display: "flex", alignItems: "center", gap: 12,
        // Only set when selected: Card spreads this after its defaults, so an explicit
        // undefined would remove the border and surface.
        ...(selected ? { border: "1px solid var(--accent)", background: "var(--bg-2)" } : {}),
      }}
      onClick={onRowClick}
    >
      {selectable && (
        <div
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${entry.label}`}
          style={{
            width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: "pointer",
            border: `1.5px solid ${selected ? "var(--accent, #4a9eff)" : "var(--text-2)"}`,
            background: selected ? "var(--accent, #4a9eff)" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { e.stopPropagation(); onToggleSelect && onToggleSelect(entry.id); }}
        >
          {selected && <Icon name="check" size={12} />}
        </div>
      )}
      <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--bg-2)", color: "var(--text-1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name={k.icon} size={15} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{entry.label}</span>
          <Badge tone={s.tone} dot>{s.label}</Badge>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-1)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {k.label} · {historyMetaText(entry.meta)} · {timeAgo(entry.timestamp)}
          {/* Only once measured: a deleted or unmeasured run shows nothing rather than
              "0 B". */}
          {sizeBytes > 0 ? ` · ${formatBytes(sizeBytes)}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
        {/* Light theme keeps its original appearance; the dark-mode surface
            and outline colours live in index.html under .astra-fav-btn. */}
        <IconButton
          name={entry.favorite ? "starFilled" : "star"}
          active={entry.favorite}
          title="Favorite"
          onClick={onToggleFavorite}
          className={`astra-fav-btn${entry.favorite ? " is-favorite" : ""}`}
          // Same spread hazard as the Card above: an explicit `undefined`
          // would overwrite IconButton's own default colour rather than
          // falling back to it, so the key is only added when it is set.
          style={entry.favorite ? { color: "var(--amber)" } : {}}
        />
        {onDelete && <IconButton name="trash" title="Remove" onClick={onDelete} />}
      </div>
    </Card>
  );
}

/* ============================================================
   HISTORY DONUT CHART
   ============================================================ */

// A small animated donut of run kinds, drawn as SVG arcs to avoid a chart
// library. Colours are theme tokens, so it follows light and dark mode.

function polarPoint(cx, cy, r, angle) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

// Standard SVG donut-segment path: outer arc clockwise, line in, inner arc
// back. Angles in radians, starting at 12 o'clock.
function donutSlicePath(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const [x1, y1] = polarPoint(cx, cy, rOuter, startAngle);
  const [x2, y2] = polarPoint(cx, cy, rOuter, endAngle);
  const [x3, y3] = polarPoint(cx, cy, rInner, endAngle);
  const [x4, y4] = polarPoint(cx, cy, rInner, startAngle);
  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

const KIND_LABELS = { single: "Single", overlay: "Overlay", termini: "Termini", batch: "Batch" };
// Theme tokens defined for both themes in index.html.
const KIND_COLORS = {
  single: "var(--accent)",
  overlay: "var(--violet)",
  termini: "var(--sage)",
  batch: "var(--gold)",
};

function HistoryDonut({ history, totalBytes, folderBytesByKind }) {
  const [hovered, setHovered] = useState(null);
  // Drives the mount animation. Re-runs whenever the History page mounts,
  // which is what makes the chart animate each time the tab is opened rather
  // than only on the very first visit.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 20); // one frame, so the transition has a "from" state to animate out of
    return () => clearTimeout(t);
  }, []);

  const counts = {};
  for (const h of history) counts[h.kind] = (counts[h.kind] || 0) + 1;
  const data = Object.keys(KIND_LABELS)
    .filter((k) => counts[k])
    .map((k) => ({ kind: k, label: KIND_LABELS[k], value: counts[k], color: KIND_COLORS[k] }));

  const total = history.length;
  if (total === 0) return null;

  const size = 132;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 58;
  const rInner = 38;
  const gap = 0.035; // radians of padding between slices

  let angle = -Math.PI / 2; // start at 12 o'clock
  const slices = data.map((d) => {
    const sweep = (d.value / total) * Math.PI * 2;
    const s = { ...d, start: angle, end: angle + Math.max(sweep - gap, 0.01) };
    angle += sweep;
    return s;
  });

  const active = hovered !== null ? slices[hovered] : null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{
            // The whole chart eases in with a slight scale+rotate, which
            // reads as the slices sweeping into place without needing per-
            // slice path interpolation.
            transform: entered ? "scale(1) rotate(0deg)" : "scale(0.86) rotate(-14deg)",
            opacity: entered ? 1 : 0,
            transition: "transform 620ms cubic-bezier(0.22, 1, 0.36, 1), opacity 420ms ease-out",
          }}
        >
          {slices.map((s, i) => (
            <path
              key={s.kind}
              d={donutSlicePath(cx, cy, rOuter, rInner, s.start, s.end)}
              fill={s.color}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                cursor: "default",
                // Non-hovered slices fade back so the hovered one reads
                // clearly, matching the reference component's behaviour.
                opacity: hovered === null || hovered === i ? 1 : 0.32,
                transformOrigin: `${cx}px ${cy}px`,
                transform: hovered === i ? "scale(1.055)" : "scale(1)",
                transition: "opacity 180ms ease, transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
                transitionDelay: entered ? "0ms" : `${i * 70}ms`,
              }}
            />
          ))}
        </svg>
        <div
          style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: 21, fontWeight: 600, color: "var(--text-0)", lineHeight: 1 }}>
            {active ? active.value : total}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-2)", marginTop: 3, letterSpacing: 0.3 }}>
            {active ? active.label : "Analyses"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        {slices.map((s, i) => (
          <div
            key={s.kind}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{
              display: "flex", alignItems: "center", gap: 8, fontSize: 12,
              opacity: hovered === null || hovered === i ? 1 : 0.45,
              transition: "opacity 180ms ease",
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: "var(--text-1)" }}>{s.label}</span>
            <span style={{ color: "var(--text-2)", marginLeft: "auto", paddingLeft: 10, fontVariantNumeric: "tabular-nums" }}>
              {s.value}
              {folderBytesByKind && folderBytesByKind[s.kind] > 0 ? ` · ${formatBytes(folderBytesByKind[s.kind])}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// The output folder History's figures describe, and earlier folders that still
// hold listed runs. Opened from a small folder button beside the size.
function OutputFolderInfo({ current, others }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (!current) return null;
  const row = (dir, detail) => (
    <div key={dir} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 11, color: "var(--text-0)" }}>
          {dir.split(/(?<=[/\\])/).map((part, i) => <React.Fragment key={i}>{part}<wbr /></React.Fragment>)}
        </div>
        {detail && <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>{detail}</div>}
      </div>
      <Button variant="secondary" size="sm" onClick={() => window.astra3Native?.openPath(dir)}>Open</Button>
    </div>
  );
  return (
    <span ref={boxRef} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
      <button
        type="button"
        title={current}
        aria-label="Output folder details"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ display: "inline-flex", marginLeft: 4, padding: 2, border: 0, background: "none", cursor: "pointer", color: open || others.length ? "var(--text-1)" : "var(--text-2)" }}
      >
        <Icon name="folder" size={12} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Output folders"
          style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30, width: 380, maxWidth: "70vw", padding: "10px 12px 12px",
            background: "var(--bg-1)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-md)", textAlign: "left",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--text-2)", letterSpacing: 0.3 }}>Sizes are for this output folder</div>
          {row(current)}
          {others.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: "var(--text-2)", letterSpacing: 0.3, marginTop: 12 }}>Runs in History saved in other folders</div>
              {others.map((o) => row(o.dir, `${o.runs} ${o.runs === 1 ? "run" : "runs"}${o.bytes ? ` · ${formatBytes(o.bytes)}` : ""}`))}
            </>
          )}
        </div>
      )}
    </span>
  );
}

function HistoryPage({ setPage }) {
  const { history, toggleFavorite, deleteHistoryEntry, clearHistory, settings, isElectron, isBusy } = useApp();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [filterKind, setFilterKind] = useState("all");
  const [favOnly, setFavOnly] = useState(false);
  // The output folder in use: { outputDir, total, byPath }.
  const [usage, setUsage] = useState(null);
  // Each listed run's folder size, wherever it was saved.
  const [runSizes, setRunSizes] = useState({});
  const [confirming, setConfirming] = useState(null); // "history" | "everything" | "selected" | "selectedFiles" | null
  const [working, setWorking] = useState(false);
  // Selection mode changes what a row click does, so it is an explicit toggle.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const entryFolders = useMemo(() => [...new Set(history.map(runFolderForEntry).filter(Boolean))], [history]);
  // Measured on demand rather than continuously, since it walks the disk.
  const refreshUsage = useCallback(() => {
    if (!isElectron) return;
    window.astra3Native.outputUsage()
      .then(setUsage)
      .catch(() => setUsage(null));
    window.astra3Native.runSizes(entryFolders)
      .then((sizes) => setRunSizes(sizes || {}))
      .catch(() => setRunSizes({}));
  }, [isElectron, settings.outputDir, entryFolders]);
  // Re-measured when a run is added and when the window regains focus, since
  // files may change outside the app.
  useEffect(() => { refreshUsage(); }, [refreshUsage, history.length]);
  // A run starting while the confirmation is open would otherwise let it be
  // accepted mid-analysis, which is the exact situation the guard above
  // prevents from being started in the first place.
  useEffect(() => { if (isBusy) setConfirming(null); }, [isBusy]);
  useEffect(() => {
    const onFocus = () => refreshUsage();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshUsage]);

  const sizeForEntry = useCallback((entry) => {
    const folder = runFolderForEntry(entry);
    if (!folder) return 0;
    return runSizes[folder] ?? usage?.byPath?.[folder] ?? 0;
  }, [usage, runSizes]);

  const bytesByKind = {};
  for (const h of history) {
    const size = sizeForEntry(h);
    if (size) bytesByKind[h.kind] = (bytesByKind[h.kind] || 0) + size;
  }

  // Leaving selection mode always drops the selection: a selection that
  // survives invisibly is a selection that gets acted on by accident.
  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelected = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // While a selection exists, the summary describes it, matching what the
  // delete buttons act on.
  const selectedEntries = history.filter((h) => selectedIds.has(h.id));
  const hasSelection = selectMode && selectedEntries.length > 0;
  const selectedBytes = selectedEntries.reduce((sum, h) => sum + sizeForEntry(h), 0);
  const selectedBytesByKind = {};
  for (const h of selectedEntries) {
    const size = sizeForEntry(h);
    if (size) selectedBytesByKind[h.kind] = (selectedBytesByKind[h.kind] || 0) + size;
  }

  // Folders other than the one in use that still hold listed runs.
  const currentOutputDir = usage?.outputDir || settings.outputDir || "";
  const otherFolders = useMemo(() => {
    const byDir = new Map();
    for (const folder of entryFolders) {
      const dir = dirnameOf(folder);
      if (!dir || dir.toLowerCase() === currentOutputDir.toLowerCase()) continue;
      const o = byDir.get(dir) || { dir, runs: 0, bytes: 0 };
      o.runs += 1;
      o.bytes += runSizes[folder] || 0;
      byDir.set(dir, o);
    }
    return [...byDir.values()];
  }, [entryFolders, runSizes, currentOutputDir]);

  const filtered = history.filter((h) => {
    if (favOnly && !h.favorite) return false;
    if (filterKind !== "all" && h.kind !== filterKind) return false;
    if (query && !h.label.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const doClearHistory = () => {
    clearHistory();
    setConfirming(null);
    toast.push({ tone: "success", title: "History cleared", message: "Your analysis files were left untouched." });
  };

  const doDeleteSelected = () => {
    for (const h of selectedEntries) deleteHistoryEntry(h.id);
    const count = selectedEntries.length;
    exitSelectMode();
    setConfirming(null);
    toast.push({
      tone: "success",
      title: `${count} ${count === 1 ? "entry" : "entries"} removed`,
      message: "The analysis files for those runs were left untouched.",
    });
  };

  // Entries leave History only when their folder was deleted; the rest stay
  // and the toast gives the reason.
  const deleteWithFiles = async (entries, everything) => {
    const plan = planDeletion(entries, history);
    const result = everything
      ? await window.astra3Native.clearOutputs(plan.folders)
      : await window.astra3Native.deleteRuns(plan.folders);
    if (result && result.error) {
      toast.push({ tone: "error", title: "Could not delete files", message: result.error });
      return;
    }
    const { removedIds, problems } = settleDeletion(plan, (result && result.results) || []);
    for (const id of removedIds) deleteHistoryEntry(id);
    const freed = formatBytes((result && result.freed) || 0);
    const removed = removedIds.length;
    if (problems.length === 0) {
      toast.push({
        tone: "success",
        title: everything ? "History and files cleared" : `${removed} ${removed === 1 ? "run" : "runs"} deleted`,
        message: `${freed} freed from disk.`,
      });
      return;
    }
    const kept = new Set(problems.flatMap((p) => p.ids)).size;
    toast.push({
      tone: removed > 0 ? "warning" : "error",
      title: removed > 0
        ? `Deleted ${removed} ${removed === 1 ? "run" : "runs"} (${freed} freed); ${kept} kept`
        : `Nothing was deleted; ${kept} ${kept === 1 ? "run" : "runs"} kept`,
      message: `${describeProblems(problems, history)}\n\n${kept === 1 ? "It stays" : "They stay"} in History. Delete from list removes ${kept === 1 ? "it" : "them"} without touching any files.`,
      duration: 12000,
    });
  };

  const doDeleteSelectedWithFiles = async () => {
    setWorking(true);
    try {
      await deleteWithFiles(selectedEntries, false);
      exitSelectMode();
    } catch (e) {
      toast.push({ tone: "error", title: "Could not delete files", message: e?.message || "Something went wrong while deleting the selected run folders." });
    } finally {
      setWorking(false);
      setConfirming(null);
      refreshUsage();
    }
  };

  const doClearEverything = async () => {
    if (isBusy) {
      toast.push({ tone: "error", title: "Analysis in progress", message: "Wait for the current analysis to finish before deleting files." });
      setConfirming(null);
      return;
    }
    setWorking(true);
    try {
      await deleteWithFiles(history, true);
    } catch (e) {
      toast.push({ tone: "error", title: "Could not delete files", message: e?.message || "Something went wrong while deleting the output folders." });
    } finally {
      setWorking(false);
      setConfirming(null);
      refreshUsage();
    }
  };

  return (
    <PageScroll>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 32px 60px" }}>
        {history.length > 0 && (
          <Card style={{ padding: "16px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            <HistoryDonut
              history={hasSelection ? selectedEntries : history}
              totalBytes={hasSelection ? selectedBytes : (usage?.total || 0)}
              folderBytesByKind={hasSelection ? selectedBytesByKind : bytesByKind}
            />
            <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "var(--text-2)", letterSpacing: 0.3 }}>
                  {hasSelection
                    ? `${selectedEntries.length} of ${history.length} selected`
                    : "Output folder"}
                  <OutputFolderInfo current={currentOutputDir} others={otherFolders} />
                </div>
                <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text-0)", fontVariantNumeric: "tabular-nums" }}>
                  {hasSelection
                    ? (selectedBytes > 0 ? formatBytes(selectedBytes) : "")
                    : (usage && usage.total > 0 ? formatBytes(usage.total) : "")}
                </div>
              </div>
              {/* Both are unavailable while an analysis runs: deleting folders under the
                  engine leaves it writing into missing directories, and clearing the list
                  drops the entry the run is about to complete. The reason is shown. */}
              {isBusy && (
                <div style={{ fontSize: 11, color: "var(--amber)", textAlign: "right", maxWidth: 300, lineHeight: 1.5 }}>
                  An analysis is running. Clearing is unavailable until it finishes, so its output isn't deleted mid-write.
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Button
                  variant={selectMode ? "primary" : "secondary"}
                  icon="check"
                  onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                  disabled={working || isBusy}
                >
                  {selectMode ? "Done" : "Select"}
                </Button>
                {selectMode && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setSelectedIds((prev) =>
                        prev.size === filtered.length ? new Set() : new Set(filtered.map((h) => h.id)))}
                    disabled={working || isBusy || filtered.length === 0}
                  >
                    {selectedIds.size === filtered.length && filtered.length > 0 ? "Select none" : "Select all"}
                  </Button>
                )}
                {/* While a selection exists the two delete buttons act on it
                    alone, matching the figures shown above them. With nothing
                    selected they keep their original whole-history meaning. */}
                <Button
                  variant="secondary"
                  icon="trash"
                  onClick={() => setConfirming(hasSelection ? "selected" : "history")}
                  disabled={working || isBusy || (selectMode && !hasSelection)}
                >
                  {hasSelection ? `Delete ${selectedEntries.length} from list` : "Clear history"}
                </Button>
                <Button
                  variant="secondary"
                  icon="trash"
                  onClick={() => setConfirming(hasSelection ? "selectedFiles" : "everything")}
                  disabled={working || isBusy || (selectMode && !hasSelection)}
                >
                  {hasSelection ? `Delete ${selectedEntries.length} + files` : "Clear history & files"}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {confirming && (
          <Card style={{ padding: "16px 18px", marginBottom: 16, border: "1px solid var(--coral)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-0)", marginBottom: 6 }}>
              {confirming === "history"
                ? `Remove all ${history.length} entries from this list?`
                : confirming === "everything"
                ? `Remove all ${history.length} entries and delete every analysis file?`
                : confirming === "selected"
                ? `Remove ${selectedEntries.length} selected ${selectedEntries.length === 1 ? "entry" : "entries"} from this list?`
                : `Remove ${selectedEntries.length} selected ${selectedEntries.length === 1 ? "entry" : "entries"} and delete their files?`}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-1)", marginBottom: 12, lineHeight: 1.6 }}>
              {confirming === "history" ? (
                <>Your rendered images, reports and sessions stay on disk in{" "}
                <span className="mono" style={{ color: "var(--text-0)" }}>{settings.outputDir}</span>. Only this list is cleared.</>
              ) : confirming === "selected" ? (
                <>The files for {selectedEntries.length === 1 ? "this run" : "these runs"} stay on disk in{" "}
                <span className="mono" style={{ color: "var(--text-0)" }}>{settings.outputDir}</span>. Only the
                selected {selectedEntries.length === 1 ? "entry is" : "entries are"} removed from this list.</>
              ) : confirming === "selectedFiles" ? (
                <>This permanently deletes the run folder{selectedEntries.length === 1 ? "" : "s"} for the
                selected {selectedEntries.length === 1 ? "run" : "runs"}
                {selectedBytes > 0 ? `, freeing ${formatBytes(selectedBytes)}` : ""}. Images, reports, JSON
                exports and sessions for {selectedEntries.length === 1 ? "that run" : "those runs"} will
                all be gone. Every other run is left untouched. This cannot be undone.</>
              ) : (
                <>This permanently deletes every run folder inside{" "}
                <span className="mono" style={{ color: "var(--text-0)" }}>{settings.outputDir}</span>, and the
                folder of every run listed here{usage ? `, freeing at least ${formatBytes(usage.total)}` : ""}. Images,
                reports, JSON exports and sessions will all be gone. This cannot be undone.</>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" onClick={() => setConfirming(null)} disabled={working}>Cancel</Button>
              <Button
                variant="danger"
                icon="trash"
                disabled={working}
                onClick={
                  confirming === "history" ? doClearHistory
                  : confirming === "selected" ? doDeleteSelected
                  : confirming === "selectedFiles" ? doDeleteSelectedWithFiles
                  : doClearEverything
                }
              >
                {working ? "Deleting..."
                  : confirming === "history" ? "Clear history"
                  : confirming === "selected" ? `Remove ${selectedEntries.length}`
                  : confirming === "selectedFiles" ? `Delete ${selectedEntries.length} + files`
                  : "Delete everything"}
              </Button>
            </div>
          </Card>
        )}

        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextInput icon="search" placeholder="Search history by ID..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <SegmentedControl
            value={filterKind}
            onChange={setFilterKind}
            options={[{ value: "all", label: "All" }, { value: "single", label: "Single" }, { value: "overlay", label: "Overlay" }, { value: "termini", label: "Termini" }, { value: "batch", label: "Batch" }]}
          />
          <Button variant={favOnly ? "primary" : "secondary"} icon={favOnly ? "starFilled" : "star"} onClick={() => setFavOnly(!favOnly)}>Favorites</Button>
        </div>

        {filtered.length === 0 ? (
          // An empty history, or one hidden by the filters.
          history.length === 0 ? (
            <EmptyState icon="history" title="No analyses yet" description="Runs you complete will be listed here." />
          ) : (
            <div>
              <EmptyState
                icon="history"
                title={`All ${history.length} ${history.length === 1 ? "analysis is" : "analyses are"} hidden by the filters above`}
                description="Your history is intact; the search box, kind filter or Favorites toggle is hiding every entry."
              />
              <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                <Button variant="secondary" icon="refresh" onClick={() => { setQuery(""); setFilterKind("all"); setFavOnly(false); }}>
                  Clear filters
                </Button>
              </div>
            </div>
          )
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.map((h) => (
              <HistoryRow
                key={h.id}
                entry={h}
                setPage={setPage}
                sizeBytes={sizeForEntry(h)}
                selectable={selectMode}
                selected={selectedIds.has(h.id)}
                onToggleSelect={toggleSelected}
                onToggleFavorite={() => toggleFavorite(h.id)}
                onDelete={() => deleteHistoryEntry(h.id)}
              />
            ))}
          </div>
        )}
      </div>
    </PageScroll>
  );
}

/* ============================================================
   SUMMARY: 3D carousel of recent structures
   ============================================================ */

// CSS 3D transforms rather than a second WebGL context: the 3D Viewer already
// holds one, pages stay mounted, and a context created per visit risks leaking
// GPU memory. The panels are the run's own renders (Images/view_front.png).

// A sparse starfield, the same twinkle as the setup screen. Fixed positions
// around the edges and top, clear of the carousel and the info block.
const SUMMARY_STARS = [
  { top: "12%", left: "7%", size: 3, duration: 3.4, delay: 0.2 },
  { top: "22%", left: "17%", size: 2, duration: 2.8, delay: 1.1 },
  { top: "9%", left: "34%", size: 2.5, duration: 3.9, delay: 0.7 },
  { top: "15%", left: "63%", size: 2, duration: 3.1, delay: 1.6 },
  { top: "8%", left: "78%", size: 3, duration: 2.6, delay: 0.4 },
  { top: "20%", left: "91%", size: 2.5, duration: 3.6, delay: 1.3 },
  { top: "44%", left: "4%", size: 2, duration: 3.2, delay: 0.9 },
  { top: "58%", left: "95%", size: 3, duration: 2.9, delay: 1.8 },
  { top: "74%", left: "88%", size: 2, duration: 3.5, delay: 0.6 },
  { top: "86%", left: "72%", size: 2.5, duration: 3.0, delay: 1.4 },
];

function SummaryStars() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {SUMMARY_STARS.map((st, i) => (
        <div key={i} style={{
          position: "absolute", top: st.top, left: st.left,
          width: st.size, height: st.size, borderRadius: "50%",
          background: SETUP_STAR_COLORS[i % SETUP_STAR_COLORS.length],
          // Dimmer than the setup screen's: there it is the whole point of
          // the visual, here it is background texture behind real content.
          opacity: 0.5,
          boxShadow: `0 0 ${st.size * 2.5}px ${SETUP_STAR_COLORS[i % SETUP_STAR_COLORS.length]}`,
          animation: `astra-star-fade-in 1.4s ease-out ${st.delay}s both, astra-star-twinkle ${st.duration}s ease-in-out ${st.delay + 1.4}s infinite`,
        }} />
      ))}
    </div>
  );
}

// The two images a Summary card shows. Runs render different sets (six named
// views, TERMINI close-ups, or none), so: a front view if present, else the
// first image, then a distinct second (an opposing view if possible). One
// image means no flip.
const PREFERRED_FRONT = [/view_front\.png$/i, /front/i];
const PREFERRED_BACK = [/view_back\.png$/i, /back/i, /view_right\.png$/i, /view_left\.png$/i];

function pickCardViews(pngFiles) {
  const files = pngFiles.filter((f) => /\.png$/i.test(f));
  if (files.length === 0) return { front: null, back: null };
  const firstMatch = (patterns, exclude) => {
    for (const pattern of patterns) {
      const hit = files.find((f) => pattern.test(f) && f !== exclude);
      if (hit) return hit;
    }
    return null;
  };
  const front = firstMatch(PREFERRED_FRONT, null) || files[0];
  // Any distinct image is a better second face than repeating the first.
  const back = firstMatch(PREFERRED_BACK, front) || files.find((f) => f !== front) || null;
  return { front, back };
}

// Human-readable label for a rendered view, derived from its filename rather
// than a fixed table, so views added later are described sensibly without
// this needing to know about them.
function describeView(filename) {
  if (!filename) return "";
  const base = filename.replace(/^.*[\\/]/, "").replace(/\.png$/i, "");
  const cleaned = base.replace(/^view[_-]?/i, "").replace(/[_-]+/g, " ").trim();
  if (!cleaned) return "View";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

const SUMMARY_SPACING = 300; // px between neighbouring items along X
const SUMMARY_MAX_VISIBLE = 4; // either side of centre
// The card's real layout size. Deliberately the size the ACTIVE card is shown
// at, because of the blur fix below.
const SUMMARY_CARD_W = 340;
const SUMMARY_CARD_H = 400;

function summaryItemTransform(offset) {
  // offset: distance from centre in item units (0 = centred, ±1 = neighbour).
  // Everything below is a smooth function of it, so a half-way drag looks
  // half-way there rather than snapping between discrete states.
  const abs = Math.abs(offset);
  const x = offset * SUMMARY_SPACING;
  // Neighbours sit back in Z and turn away from the viewer; the centre item
  // comes forward and faces front. Clamped so distant items don't keep
  // rotating past a sensible angle.
  const z = -Math.min(abs, 3) * 130;
  const rotateY = Math.max(-52, Math.min(52, -offset * 34));
  // The centre card is laid out at full size (scale 1) so it rasterises
  // sharply; only neighbours scale down. Scaling up a layer blurs it.
  const scale = Math.max(0.5, 1 - abs * 0.2);
  const opacity = abs > SUMMARY_MAX_VISIBLE ? 0 : Math.max(0.18, 1 - abs * 0.34);
  return { x, z, rotateY, scale, opacity };
}

// Unique codes for display, up to max, with an ellipsis when there are more.
function summarizeCodes(codes, max = 4) {
  const unique = [...new Set(codes.filter(Boolean))];
  if (unique.length === 0) return "";
  const shown = unique.slice(0, max).join(", ");
  return unique.length > max ? `${shown}…` : shown;
}

// The most lines the Summary panel lists for one run.
const SUMMARY_MAX_FACTS = 4;

// What kind of run an entry was, as the Summary panel's headline. Batch
// membership comes from the batch's record of the entries it created, with
// the "via Batch" note as a fallback for entries recorded without one.
function summaryMethodLabel(run, batchChildIds) {
  if (run.kind === "overlay") return "Overlay";
  if (run.kind === "termini") return "Termini";
  const note = String(run.meta || "");
  if (batchChildIds.has(run.id) || /via batch/i.test(note)) return "Batch";
  if (/via advanced console/i.test(note)) return "Advanced Console";
  return "Single Structure";
}

function SummaryPage({ setPage }) {
  const { history, settings, isElectron, setSelectedViewerId } = useApp();
  const toast = useToast();

  // Newest first is how history is stored; reversed here so the carousel
  // reads left-to-right oldest-to-newest like a timeline.
  const runs = history.filter((h) => h.status === "complete" && h.kind !== "batch").slice(0, 24).reverse();

  const [index, setIndex] = useState(Math.max(0, runs.length - 1));
  // Fractional position during a drag. Kept separate from `index` so the snap
  // target and the live position can differ mid-gesture.
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Which card is currently showing its back view. Keyed by entry id rather
  // than a single boolean so flipping one card and then moving along the
  // carousel doesn't leave an unrelated card mysteriously reversed.
  const [flipped, setFlipped] = useState({});
  const [hovered, setHovered] = useState(null);
  const [assets, setAssets] = useState({}); // entry.id -> { image, meta }
  const dragRef = useRef(null);
  const velocityRef = useRef(0);
  const rafRef = useRef(null);

  const active = runs[index] || null;

  // Clamp when the run list shrinks (history cleared, entry deleted) so the
  // carousel can't be left pointing past the end of the list.
  useEffect(() => {
    if (index > runs.length - 1) setIndex(Math.max(0, runs.length - 1));
  }, [runs.length, index]);

  // Loads the front render and the report JSON for whatever is near the
  // centre. Deliberately not everything at once: each image is a full-size
  // ray-traced PNG read off disk and base64'd, so loading 24 of them on tab
  // open would stall the UI for no benefit when only a few are visible.
  useEffect(() => {
    if (!isElectron || runs.length === 0) return;
    let cancelled = false;
    // Thumbnails for the visible neighbourhood only, front faces only; full
    // renders exhaust the renderer. Back faces load when a card is flipped.
    const wanted = runs.slice(Math.max(0, index - 1), index + 2).filter((r) => !assets[r.id]);
    if (wanted.length === 0) return;
    (async () => {
      for (const run of wanted) {
        if (cancelled) return;
        const folder = await resolveRealOutputFolder(run, settings).catch(() => null);
        if (!folder || cancelled) continue;
        let image = null;
        let backPath = null;
        let frontLabel = "";
        let backLabel = "";
        let meta = null;
        try {
          const files = await window.astra3Native.listDir(joinPath(folder, "Images"));
          // view_front is the canonical face-on render; any view is better
          // than none for a run that produced only some of them.
          const views = pickCardViews(files);
          if (views.front) {
            image = await window.astra3Native.readImageThumbnail(joinPath(folder, "Images", views.front), 520);
            frontLabel = describeView(views.front);
          }
          // Known but not loaded until the card is flipped.
          if (views.back) {
            backPath = joinPath(folder, "Images", views.back);
            backLabel = describeView(views.back);
          }
        } catch {
          // No Images folder (-skipimage): placeholder.
        }
        // TERMINI runs write their export under a different name.
        for (const jsonName of ["Astra3_Report.json", "Termini_Analysis.json"]) {
          try {
            const raw = await window.astra3Native.readFile(joinPath(folder, "Session", jsonName));
            meta = JSON.parse(raw);
            break;
          } catch {
            // Missing or unreadable; try the next name.
          }
        }
        if (!cancelled) {
          setAssets((a) => {
            const next = { ...a, [run.id]: { image, backPath, backImage: null, frontLabel, backLabel, meta, folder } };
            // Bounded cache. Without an upper limit the gallery accumulates
            // every thumbnail visited during a session, which is the same
            // unbounded growth in slower motion.
            const ids = Object.keys(next);
            if (ids.length > 12) {
              const keep = new Set(runs.slice(Math.max(0, index - 3), index + 4).map((r) => r.id));
              for (const id of ids) {
                if (!keep.has(id) && Object.keys(next).length > 12) delete next[id];
              }
            }
            return next;
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [index, runs.length, isElectron, settings]);

  // --- Drag / inertia -------------------------------------------------
  const settle = useCallback((from, targetIndex) => {
    cancelAnimationFrame(rafRef.current);
    let current = from;
    const step = () => {
      // Critically-damped-ish lerp: fast at first, easing into the snap.
      // Simple and stable, which matters more here than a real spring since
      // the distance is always small.
      current += (0 - current) * 0.18;
      if (Math.abs(current) < 0.002) {
        setOffset(0);
        setIndex(targetIndex);
        return;
      }
      setOffset(current);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const onPointerDown = (e) => {
    if (runs.length === 0) return;
    cancelAnimationFrame(rafRef.current);
    // Pointer capture starts only once a drag starts; capturing on pointerdown
    // would swallow the click that flips the centre card.
    dragRef.current = { startX: e.clientX, startOffset: offset, lastX: e.clientX, lastT: performance.now(), moved: false, pointerId: e.pointerId, node: e.currentTarget };
    setDragging(true);
  };

  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    const travelled = Math.abs(e.clientX - d.startX);
    // 4px of slack, so a click with a shaky hand is still a click.
    if (!d.moved && travelled > 4) {
      d.moved = true;
      d.node?.setPointerCapture?.(d.pointerId);
    }
    if (!d.moved) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    velocityRef.current = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX;
    d.lastT = now;
    setOffset(d.startOffset + (e.clientX - d.startX) / SUMMARY_SPACING);
  };

  const onPointerUp = () => {
    if (!dragRef.current) return;
    const wasDrag = dragRef.current.moved;
    dragRef.current = null;
    setDragging(false);
    // A click needs no snap, which would fight the flip it triggers.
    if (!wasDrag) { velocityRef.current = 0; return; }
    // Flick momentum: a fast release carries past the nearest item, a slow
    // one just snaps back to the closest.
    const momentum = velocityRef.current * 4;
    const raw = index - (offset + momentum);
    const target = Math.max(0, Math.min(runs.length - 1, Math.round(raw)));
    const residual = offset - (index - target);
    setIndex(target);
    settle(residual, target);
    velocityRef.current = 0;
  };

  const go = useCallback((delta) => {
    cancelAnimationFrame(rafRef.current);
    setOffset(0);
    setIndex((i) => Math.max(0, Math.min(runs.length - 1, i + delta)));
  }, [runs.length]);

  // Wheel: horizontal trackpad swipe, and vertical wheel as a fallback for a
  // plain mouse. Throttled so one gesture doesn't fly through the whole list.
  const wheelLockRef = useRef(0);
  const onWheel = (e) => {
    const amount = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(amount) < 4) return;
    const now = performance.now();
    if (now - wheelLockRef.current < 220) return;
    wheelLockRef.current = now;
    go(amount > 0 ? 1 : -1);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // --- Actions --------------------------------------------------------
  const withFolder = async (fn, failTitle) => {
    if (!active) return;
    const folder = assets[active.id]?.folder || (await resolveRealOutputFolder(active, settings).catch(() => null));
    if (!folder) {
      toast.push({ tone: "error", title: failTitle, message: "This run's output folder could not be located on disk. It may have been moved or deleted." });
      return;
    }
    const err = await fn(folder);
    if (err) toast.push({ tone: "error", title: failTitle, message: err });
  };

  const openReport = () => withFolder(
    (folder) => window.astra3Native.openPath(active.reportPath || joinPath(folder, "Astra3_Report.html")),
    "Could not open report");

  const openSession = () => {
    // An Astra3 Engine run has no outside program to hand its session to; it
    // opens in the app's own 3D Viewer. Its .pse and .cxc files are still
    // written for PyMOL or ChimeraX users.
    if (active.engine === "astra3") { setSelectedViewerId(active.id); setPage("viewer"); return; }
    return openSessionFile();
  };
  const openSessionFile = () => withFolder(async (folder) => {
    if (active.sessionPath) return window.astra3Native.openInPymol(active.sessionPath);
    const files = await window.astra3Native.listDir(joinPath(folder, "Session"));
    const pse = files.find((f) => /\.(pse|cxs)$/i.test(f));
    if (!pse) return "No session file was found in this run's Session folder.";
    return window.astra3Native.openInPymol(joinPath(folder, "Session", pse));
  }, "Could not open session");

  const openFolder = () => withFolder((folder) => window.astra3Native.openPath(folder), "Could not open output folder");

  // --- Metadata for the active item ------------------------------------
  // The panel is an overview, not the report. It names the kind of run in the
  // largest type, then the structures, then at most SUMMARY_MAX_FACTS lines
  // chosen per kind, which keeps it clear of the navigation arrows.
  const meta = active ? assets[active.id]?.meta : null;
  const batchChildIds = useMemo(() => {
    const { batchGroups } = groupCompletedByBatch(history, runs);
    return new Set(batchGroups.flatMap((g) => g.children.map((c) => c.id)));
  }, [history, runs]);
  const methodLabel = active ? summaryMethodLabel(active, batchChildIds) : "";
  const structures = meta?.structures || [];
  const isComparison = active?.kind === "overlay" || active?.kind === "termini";

  const subLabel = (() => {
    if (!active) return "";
    if (isComparison) {
      const count = structures.length || String(active.label || "").split(/\s+vs\s+|,\s*/).filter(Boolean).length;
      const ref = meta?.reference_structure;
      return [ref ? `Reference ${ref}` : null, count > 1 ? `${count} structures` : null].filter(Boolean).join("  ·  ");
    }
    // Resolution and method when the header supplied them; nothing substituted.
    const st = structures[0];
    if (!st) return "";
    const bits = [];
    const res = Number.parseFloat(st.resolution_angstrom);
    if (Number.isFinite(res)) bits.push(`${st.resolution_angstrom} Å`);
    if (st.experimental_method) bits.push(String(st.experimental_method));
    return bits.join("  ·  ");
  })();

  const facts = (() => {
    if (!active || !meta) return [];
    const out = [];
    const range = (values, digits) => {
      const lo = Math.min(...values).toFixed(digits);
      const hi = Math.max(...values).toFixed(digits);
      return lo === hi ? lo : `${lo}–${hi}`;
    };

    if (active.kind === "overlay") {
      const results = Array.isArray(meta.alignment_results) ? meta.alignment_results : [];
      const aligned = results.filter((a) => a.success !== false && typeof a.rmsd_angstrom === "number");
      const failed = results.filter((a) => a.success === false);
      if (aligned.length) {
        const to = meta.reference_structure ? ` to ${meta.reference_structure}` : "";
        out.push(`RMSD${to}: ${range(aligned.map((a) => a.rmsd_angstrom), 3)} Å`);
      }
      if (aligned.length > 1) {
        const best = aligned.reduce((b, a) => (a.rmsd_angstrom < b.rmsd_angstrom ? a : b));
        out.push(`Closest match: ${best.structure_id} (${best.rmsd_angstrom.toFixed(3)} Å)`);
      }
      if (failed.length) out.push(`${failed.length} alignment${failed.length === 1 ? "" : "s"} failed`);
      const resolutions = structures.map((st) => Number.parseFloat(st.resolution_angstrom)).filter(Number.isFinite);
      if (resolutions.length) out.push(`Resolution ${range(resolutions, 2)} Å`);
    } else if (active.kind === "termini") {
      const comparisons = Array.isArray(meta.comparisons) ? meta.comparisons : [];
      const measured = comparisons.filter((c) => c.available && typeof c.tip_displacement_angstrom === "number");
      for (const end of ["N", "C"]) {
        const atEnd = measured.filter((c) => c.terminus === end);
        if (!atEnd.length) continue;
        const top = atEnd.reduce((b, c) => (c.tip_displacement_angstrom > b.tip_displacement_angstrom ? c : b));
        out.push(`Largest ${end}-terminal shift: ${top.tip_displacement_angstrom.toFixed(2)} Å (${top.comparison_structure})`);
      }
      const rmsds = measured.map((c) => c.local_rmsd_angstrom).filter((v) => typeof v === "number");
      if (rmsds.length) out.push(`Local RMSD (in place) ${range(rmsds, 2)} Å`);
      const unavailable = comparisons.length - comparisons.filter((c) => c.available).length;
      if (unavailable > 0) out.push(`${unavailable} terminus measurement${unavailable === 1 ? "" : "s"} unavailable`);
    } else {
      const st = structures[0];
      if (st) {
        const chains = st.chains || [];
        if (chains.length) out.push(`${chains.length} chain${chains.length === 1 ? "" : "s"} (${summarizeCodes(chains, 6)})`);
        const ligs = st.ligands || [];
        const ions = st.ions || [];
        const bound = [];
        if (ligs.length) bound.push(`${ligs.length} ligand${ligs.length === 1 ? "" : "s"} (${summarizeCodes(ligs.map((l) => l.code), 3)})`);
        if (ions.length) bound.push(`${ions.length} ion${ions.length === 1 ? "" : "s"} (${summarizeCodes(ions.map((i) => i.code), 3)})`);
        if (bound.length) out.push(bound.join("  ·  "));
        // null means not checked, not none missing.
        if (st.missing_residues_available && st.missing_residues_by_chain) {
          const total = Object.values(st.missing_residues_by_chain).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
          if (total > 0) out.push(`${total} missing residue${total === 1 ? "" : "s"}`);
        }
        if (typeof st.mean_ca_bfactor === "number") out.push(`Mean Cα B-factor ${st.mean_ca_bfactor.toFixed(1)} Å²`);
        if (st.reduction_used) out.push("Reduced to a single chain");
      }
    }
    return out.slice(0, SUMMARY_MAX_FACTS);
  })();

  if (runs.length === 0) {
    return (
      <PageScroll>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "80px 32px" }}>
          <EmptyState
            icon="viewer"
            title="No structures yet"
            description="Completed analyses appear here as a visual gallery. Run a structure to get started."
          />
        </div>
      </PageScroll>
    );
  }

  return (
    <div
      style={{ position: "relative", height: "100%", overflow: "hidden", background: "var(--bg-0)", userSelect: "none" }}
      onWheel={onWheel}
    >
      <SummaryStars />
      {/* Radial bloom behind the centre item. Sits under the carousel and
          tinted with the accent so it follows the theme in both modes. */}
      <div style={{
        position: "absolute", left: "50%", top: "44%", transform: "translate(-50%, -50%)",
        width: 760, height: 760, pointerEvents: "none",
        background: "radial-gradient(circle, var(--accent-wash) 0%, transparent 62%)",
        opacity: 0.9,
      }} />
      <div style={{
        position: "absolute", left: "50%", top: "44%", transform: "translate(-50%, -50%)",
        width: 340, height: 340, pointerEvents: "none",
        background: "radial-gradient(circle, var(--accent) 0%, transparent 68%)",
        opacity: 0.16, filter: "blur(30px)",
      }} />

      <div style={{
        position: "absolute", top: 20, left: 0, right: 0, display: "flex",
        alignItems: "center", justifyContent: "center", pointerEvents: "none",
      }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: "0.28em", color: "var(--text-2)", textTransform: "uppercase",
        }}>Recent Structures</div>
      </div>

      {/* The carousel itself. perspective on the parent + preserve-3d on the
          stage is what makes the rotateY on each panel read as real depth
          rather than a flat skew. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: "absolute", inset: 0, perspective: 1400,
          cursor: dragging ? "grabbing" : "grab",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div style={{ position: "relative", transformStyle: "preserve-3d", width: 0, height: 0 }}>
          {runs.map((run, i) => {
            const rel = i - index + offset;
            if (Math.abs(rel) > SUMMARY_MAX_VISIBLE + 1) return null;
            const t = summaryItemTransform(rel);
            const asset = assets[run.id];
            const isActive = Math.round(-offset + index) === i;
            const isFlipped = !!flipped[run.id] && !!asset?.backPath;
            const isHovered = hovered === run.id && isActive && !dragging;
            return (
              <div
                key={run.id}
                onMouseEnter={() => setHovered(run.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => {
                  // A neighbour comes forward on click; the centre card flips, but only when
                  // a back render exists (a -skipimage run has none).
                  if (!isActive) { go(i - index); return; }
                  if (!asset?.backPath) return;
                  setFlipped((f) => ({ ...f, [run.id]: !f[run.id] }));
                  if (!asset.backImage) {
                    window.astra3Native.readImageThumbnail(asset.backPath, 520)
                      .then((img) => {
                        if (img) setAssets((a) => (a[run.id] ? { ...a, [run.id]: { ...a[run.id], backImage: img } } : a));
                      })
                      .catch(() => {
                        // The front face stays shown; nothing else to do.
                      });
                  }
                }}
                style={{
                  position: "absolute", left: 0, top: 0,
                  width: SUMMARY_CARD_W, height: SUMMARY_CARD_H,
                  marginLeft: -SUMMARY_CARD_W / 2, marginTop: -SUMMARY_CARD_H / 2,
                  // No hover scale on the card: scaling magnifies its rasterised layer and
                  // blurs it. The hover zoom shrinks the image's padding instead (see the img
                  // below), which re-rasterises it at the new size.
                  transform: `translate3d(${t.x}px, 0, ${t.z}px) rotateY(${t.rotateY}deg) scale(${t.scale})`,
                  opacity: t.opacity,
                  // No transition while dragging; the transform already follows the pointer.
                  transition: dragging ? "none" : "transform 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 300ms ease",
                  transformStyle: "preserve-3d",
                  cursor: isActive && asset?.backPath ? "pointer" : undefined,
                }}
              >
                <div style={{
                  position: "absolute", inset: 0, transformStyle: "preserve-3d",
                  transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                  transition: "transform 620ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}>
                  <SummaryCardFace active={isActive}>
                    {asset?.image ? (
                      <img src={asset.image} alt={run.label} draggable={false}
                        style={{
                          width: "100%", height: "100%", objectFit: "contain",
                          // Less padding gives a bigger protein without scaling; see the transform note
                          // above.
                          padding: isHovered ? 4 : 18,
                          transition: "padding 260ms cubic-bezier(0.22, 1, 0.36, 1)",
                        }} />
                    ) : (
                      <div style={{ textAlign: "center", padding: 16 }}>
                        <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>{run.label}</div>
                        <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 6 }}>
                          {asset ? "No rendered image" : "Loading…"}
                        </div>
                      </div>
                    )}
                    {isActive && !isFlipped && ENGINE_NAMES[run.engine] && (
                      <div style={{
                        position: "absolute", top: 10, left: 0, right: 0, textAlign: "center",
                        fontSize: 9.5, letterSpacing: "0.12em", color: "var(--text-2)", textTransform: "uppercase",
                      }}>Processed with {ENGINE_NAMES[run.engine]}</div>
                    )}
                    {isActive && asset?.backPath && !isFlipped && (
                      <div style={{
                        position: "absolute", bottom: 10, left: 0, right: 0, textAlign: "center",
                        fontSize: 9.5, letterSpacing: "0.12em", color: "var(--text-2)", textTransform: "uppercase",
                      }}>{asset.backLabel ? `Click to see ${asset.backLabel.toLowerCase()}` : "Click to flip"}</div>
                    )}
                  </SummaryCardFace>
                  <SummaryCardFace active={isActive} back>
                    {asset?.backImage && (
                      <img src={asset.backImage} alt={`${run.label} back view`} draggable={false}
                        style={{ width: "100%", height: "100%", objectFit: "contain", padding: 14 }} />
                    )}
                    <div style={{
                      position: "absolute", bottom: 10, left: 0, right: 0, textAlign: "center",
                      fontSize: 9.5, letterSpacing: "0.12em", color: "var(--text-2)", textTransform: "uppercase",
                    }}>{asset?.backLabel || "Second view"}</div>
                  </SummaryCardFace>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Track bar */}
      <div style={{
        position: "absolute", left: "50%", bottom: 116, transform: "translateX(-50%)",
        width: 260, height: 3, borderRadius: 2, background: "var(--line-0)",
      }}>
        <div style={{
          height: "100%", borderRadius: 2, background: "var(--accent)",
          width: `${runs.length <= 1 ? 100 : (100 / runs.length)}%`,
          marginLeft: `${runs.length <= 1 ? 0 : (index / runs.length) * 100}%`,
          transition: dragging ? "none" : "margin-left 420ms cubic-bezier(0.22, 1, 0.36, 1)",
        }} />
      </div>
      <div style={{
        position: "absolute", left: "50%", bottom: 96, transform: "translateX(-50%)",
        fontSize: 10, color: "var(--text-2)", letterSpacing: "0.14em",
      }}>
        {index + 1} / {runs.length}
      </div>

      {/* Active item overlay. Kept to the kind of run, its structures and a
          few lines, so it stays below the navigation arrows on a short
          window. */}
      {active && (
        <div style={{
          position: "absolute", left: 32, bottom: 28, maxWidth: 560, pointerEvents: "auto",
        }}>
          <div key={active.id} className="astra-summary-fade">
            <div style={{ fontSize: 30, fontWeight: 700, color: "var(--text-0)", lineHeight: 1.1 }}>
              {methodLabel}
            </div>
            <div className="mono" style={{
              fontSize: 15, fontWeight: 600, color: "var(--text-1)", marginTop: 6,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {active.label}
            </div>
            {subLabel && (
              <div style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.12em", marginTop: 6, textTransform: "uppercase" }}>
                {subLabel}
              </div>
            )}
            {facts.length > 0 && (
              <div style={{ fontSize: 11.5, color: "var(--text-1)", marginTop: 10, lineHeight: 1.7 }}>
                {facts.map((f) => (
                  <div key={f} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f}</div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 10.5, color: "var(--text-2)", marginTop: 8 }}>{timeAgo(active.timestamp)}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <Button variant="primary" size="sm" icon="reports" onClick={openReport}>Open Report</Button>
              <Button variant="secondary" size="sm" icon="cube" onClick={openSession}>Open Session</Button>
              <Button variant="secondary" size="sm" icon="folder" onClick={openFolder}>Output Folder</Button>
              <Button variant="ghost" size="sm" icon="viewer" onClick={() => { setSelectedViewerId(active.id); setPage("viewer"); }}>View in 3D</Button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard and drag both work; the arrows show the gallery can be navigated. */}
      <button onClick={() => go(-1)} disabled={index === 0} style={summaryArrowStyle("left", index === 0)} aria-label="Previous structure">
        <Icon name="chevronRight" size={16} style={{ transform: "rotate(180deg)" }} />
      </button>
      <button onClick={() => go(1)} disabled={index >= runs.length - 1} style={summaryArrowStyle("right", index >= runs.length - 1)} aria-label="Next structure">
        <Icon name="chevronRight" size={16} />
      </button>
    </div>
  );
}

// One face of a flipping card. backfaceVisibility hidden is what stops the
// two faces showing through each other mid-rotation.
function SummaryCardFace({ children, active, back }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      borderRadius: "var(--radius-lg)",
      background: active ? "var(--bg-1)" : "var(--bg-2)",
      border: `1px solid ${active ? "var(--accent-dim)" : "var(--line-0)"}`,
      boxShadow: active ? "var(--shadow-lg)" : "var(--shadow-sm)",
      overflow: "hidden",
      backfaceVisibility: "hidden",
      WebkitBackfaceVisibility: "hidden",
      transform: back ? "rotateY(180deg)" : "none",
    }}>{children}</div>
  );
}

function summaryArrowStyle(side, disabled) {
  return {
    position: "absolute", top: "44%", [side]: 24, transform: "translateY(-50%)",
    width: 36, height: 36, borderRadius: "50%",
    background: "var(--bg-2)", border: "1px solid var(--line-0)",
    color: disabled ? "var(--text-2)" : "var(--text-0)",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1,
    boxShadow: "var(--shadow-sm)",
  };
}

/* ============================================================
   LIVE CONSOLE OUTPUT (shared: Single/Overlay/Termini/Batch/Console)
   ============================================================ */

// Astra3's ANSI colours (astra3_core.py's RED, GREEN and so on, and the
// 256-colour banner colours) mapped to theme tokens, so console output follows
// light and dark mode. There is no cyan or blue token; --violet is the
// closest.
const ANSI_COLOR_MAP = {
  "91": "var(--coral)",         // RED
  "92": "var(--sage)",          // GREEN
  "93": "var(--amber)",         // YELLOW
  "94": "var(--violet)",        // BLUE
  "95": "var(--accent)",        // VIOLET
  "96": "var(--accent-bright)", // CYAN
  "97": "var(--text-0)",        // WHITE
  "38;5;229": "var(--gold-bright)", // STAR_LIGHT (banner only)
  "38;5;221": "var(--gold)",        // STAR_PASTEL (banner only)
  "38;5;179": "var(--amber)",       // STAR_DARK (banner only)
  "1;38;5;135": "var(--accent-bright)", // ASTRA_PURPLE (banner only)
};

// Splits a console line into {text, color} segments. color is null where no
// code is active, and callers use their own default. Unknown codes keep the
// current colour.
function parseAnsiSegments(text) {
  const segments = [];
  let currentColor = null;
  let lastIndex = 0;
  const re = /\x1b\[([0-9;]*)m/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), color: currentColor });
    }
    const code = match[1];
    if (code === "0" || code === "") {
      currentColor = null;
    } else if (ANSI_COLOR_MAP[code]) {
      currentColor = ANSI_COLOR_MAP[code];
    } // else: unrecognized code, leave currentColor unchanged
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), color: currentColor });
  }
  return segments;
}

// Memoised so a long session does not re-render every earlier line on each
// new one.
const ConsoleLine = React.memo(function ConsoleLine({ text, tone, plain = false }) {
  const toneColor = {
    command: "var(--accent-bright)", info: "var(--text-0)", success: "var(--sage)",
    error: "var(--coral)", warning: "var(--amber)", muted: "var(--text-1)", prompt: "var(--violet)", highlight: "var(--gold)",
  };
  const fallbackColor = toneColor[tone] || "var(--text-0)";
  // Per-segment ANSI colours win over the line's tone, which covers uncoloured
  // text and the interface's own lines. plain strips the codes without
  // colouring: the prompt box repeats the console text in one neutral colour.
  const segments = plain ? [{ text: stripAnsi(text), color: null }] : parseAnsiSegments(text);
  return (
    <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {tone === "command" ? <span style={{ color: "var(--accent)" }}>{"astra3> "}</span> : null}
      {segments.map((seg, i) => (
        <span key={i} style={{ color: seg.color || fallbackColor }}>{seg.text}</span>
      ))}
    </div>
  );
});

// Caps what is mounted, not what is kept (AppProvider keeps 400 lines), so a
// long batch stays responsive.
const CONSOLE_MAX_RENDERED_LINES = 300;
// The session log behind the Advanced Console. Large enough to hold many
// analyses (each prints roughly 50-150 lines), including the startup banner.
const SESSION_LOG_MAX_LINES = 10000;

function LiveConsole({ lines, height = 260, title = "Console output", showCursor = false, onRespond, fillHeight = false,
                      maxLines = CONSOLE_MAX_RENDERED_LINES, droppedBefore = 0, bodyRef, followOutput = true }) {
  const { prompt, answerPrompt } = useApp();
  const endRef = useRef(null);
  const [freeText, setFreeText] = useState("");
  useEffect(() => { if (followOutput) endRef.current?.scrollIntoView({ block: "end" }); }, [lines, followOutput]);
  useEffect(() => { setFreeText(""); }, [prompt]);
  const visibleLines = lines.length > maxLines ? lines.slice(-maxLines) : lines;
  const truncated = lines.length - visibleLines.length;
  const lastLine = lines[lines.length - 1];
  const endedInError = lastLine?.tone === "error";

  const submitFreeText = () => {
    const trimmed = freeText.trim();
    if (trimmed) answerPrompt(trimmed);
  };

  // fillHeight: sized for about 19 lines (12px at line-height 1.7, plus padding
  // and the header) and capped by the window height, so the console scrolls
  // inside itself rather than growing the page. minHeight 0 on the body lets
  // the flex child shrink below its content.
  const fillHeightStyle = fillHeight ? { height: 445, maxHeight: "calc(100vh - 140px)" } : {};
  const bodyStyle = fillHeight
    ? { flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 12px", fontSize: 12, lineHeight: 1.7 }
    : { height, overflowY: "auto", padding: "10px 12px", fontSize: 12, lineHeight: 1.7 };

  return (
    <>
    <div style={{ background: "var(--console-bg)", border: "1px solid var(--line-0)", borderRadius: "var(--radius-md)", overflow: "hidden", ...(fillHeight ? { display: "flex", flexDirection: "column" } : {}), ...fillHeightStyle }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--line-0)", display: "flex", alignItems: "center", gap: 8, background: "var(--bg-1)" }}>
        <div style={{ display: "flex", gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4a4e58" }} />
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4a4e58" }} />
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4a4e58" }} />
        </div>
        <span style={{ fontSize: 11, color: "var(--text-1)", fontWeight: 600 }}>{title}</span>
      </div>
      <div className="mono" ref={bodyRef} style={bodyStyle}>
        {truncated > 0 && (
          <div style={{ color: "var(--text-2)", fontStyle: "italic", marginBottom: 6 }}>… {truncated} earlier line{truncated === 1 ? "" : "s"} hidden. Scroll up in the Advanced Console for the full session log …</div>
        )}
        {truncated === 0 && droppedBefore > 0 && (
          <div style={{ color: "var(--text-2)", fontStyle: "italic", marginBottom: 6 }}>… The first {droppedBefore.toLocaleString()} line{droppedBefore === 1 ? "" : "s"} of this session are no longer kept; the Advanced Console holds the most recent {SESSION_LOG_MAX_LINES.toLocaleString()} lines …</div>
        )}
        {visibleLines.map((l, i) => <ConsoleLine key={l.n ?? truncated + i} text={l.text} tone={l.tone} />)}
        {showCursor && !prompt && (
          <div style={{ color: "var(--text-2)", display: "flex", alignItems: "center" }}>
            <span style={{ color: "var(--accent)" }}>astra3&gt;</span>&nbsp;<span className="astra-cursor-blink">█</span>
          </div>
        )}
        <div ref={endRef} />
      </div>
      {endedInError && onRespond && !prompt && (
        <div style={{ padding: "8px 12px", borderTop: "1px solid var(--line-0)", background: "var(--coral-wash)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontSize: 11, color: "var(--coral)" }}>This run ended with an error.</span>
          <Button variant="secondary" size="sm" icon="console" onClick={onRespond}>Respond in Console</Button>
        </div>
      )}
    </div>
      {prompt && (
        <div className="mono" style={{ marginTop: 12, padding: 14, border: "1px solid var(--amber)", borderRadius: "var(--radius-sm)", background: "var(--bg-2)", boxShadow: "var(--shadow-md)" }}>
          <div style={{ fontSize: 11, color: "var(--amber)", fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="alertTriangle" size={12} /> Astra3 needs your input
          </div>
          <div style={{ marginBottom: 12 }}>
            <ConsoleLine text={prompt.text} tone="muted" plain />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(prompt.options || ["y", "n"]).map((opt) => (
              <Button
                key={opt}
                variant={opt === "y" ? "confirm" : opt === "n" ? "decline" : "secondary"}
                size="sm" onClick={() => answerPrompt(opt)} className="mono"
              >{opt}</Button>
            ))}
            {prompt.allowFreeText && (
              <>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <TextInput
                    mono
                    placeholder="Or type another answer…"
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitFreeText(); }}
                    style={{ fontSize: 12 }}
                  />
                </div>
                <Button variant="secondary" size="sm" onClick={submitFreeText} disabled={!freeText.trim()}>Submit</Button>
              </>
            )}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-2)", marginTop: 10 }}>
            Astra3 is paused until you answer. You can also answer from the Advanced Console.
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================
   SINGLE STRUCTURE PAGE
   ============================================================ */
function SingleStructurePage({ setPage }) {
  const { settings, runAstraCommand, addHistoryEntry, isElectron, isBusy, cancelRun, cancelRequestedRef, pendingStructureSeed, setPendingStructureSeed, setSelectedViewerId, engineInfo } = useApp();
  const toast = useToast();
  const [pdbId, setPdbId] = useState("");
  useEffect(() => {
    // Runs for every seed, not only the first.
    if (pendingStructureSeed?.kind === "single" && pendingStructureSeed.items?.length) {
      setPdbId(pendingStructureSeed.items[0].id);
      setPendingStructureSeed(null); // consume once per seed
    }
  }, [pendingStructureSeed]);
  const [format, setFormat] = useState(settings.defaultFormat);
  const [quality, setQuality] = useState(settings.defaultQuality);
  const [opts, setOpts] = useState({ report: true, images: true, csv: false, sessionOnly: false, renderOnly: false });
  const [busy, setBusy] = useState(false); // true only while THIS page's own run is active

  // Skipped entirely while busy, so changing a default mid-run can never
  // retroactively alter what's shown for (or sent by) a run already in
  // progress.
  useDefaultSync(settings, [
    { key: "defaultFormat", current: format, setCurrent: setFormat },
    { key: "defaultQuality", current: quality, setCurrent: setQuality },
  ], busy);

  const [cancelling, setCancelling] = useState(false);
  // What the last run ended as: null while idle or running, then "complete",
  // "cancelled" or "failed". Kept separate from `busy` so the bar can stay on
  // screen after the run with its final state instead of vanishing.
  const [runOutcome, setRunOutcome] = useState(null);
  const [runPrefix, setRunPrefix] = useState("");
  const [lines, setLines] = useState([]);
  // A single-structure run is one six-view render (render_views renders a
  // fixed six), so the image count is known before the run starts.
  const renderPlan = useMemo(() => ({ images: opts.images ? VIEWS_PER_RENDER : 0 }), [opts.images]);
  const otherPageBusy = isBusy && !busy; // another page's run; this page's own run keeps its controls

  const buildCommand = () => {
    const flags = [];
    // Quality only applies when images are rendered.
    if (opts.images) {
      if (quality === "low") flags.push("-low");
      if (quality === "medium") flags.push("-medium");
      if (quality === "excellent") flags.push("-excellent");
    }
    // Only when fetching: an imported structure's format is fixed by its file.
    if (format === "cif" && !AST_ID_RE.test(pdbId.trim())) flags.push("-mmCIF");
    if (!opts.images) flags.push("-skipimage");
    if (!opts.report) flags.push("-skipreport");
    if (opts.renderOnly) flags.push("-ro");
    if (opts.csv) flags.push("-csv");
    return [pdbId.trim().toUpperCase(), ...flags].join(" ");
  };

  const runAnalysis = async () => {
    if (!pdbId.trim() || isBusy) return;
    // runOutcome has to be cleared here as well: without it a second run
    // starts already showing the previous one's ending.
    setBusy(true); setCancelling(false); setRunOutcome(null); setLines([]);
    // The bar names the structure this run is analysing, fixed when it
    // starts, so typing the next ID does not relabel a run in progress.
    setRunPrefix(pdbId.trim().toUpperCase());
    const startedAt = Date.now(); // cancellation cleanup removes only what this run writes
    const cmd = buildCommand();
    try {
      const result = await runAstraCommand(cmd, {
        originPage: "single",
        onLog: (entry) => setLines((l) => [...l, entry]), // this run's output only
      });
      // A cancelled run returns like a finished one; the bridge says which. Nothing
      // is kept from it: no History entry, and its output is removed.
      if (result?.cancelled || cancelRequestedRef.current) {
        await discardRunOutput(result?.lines, pdbId.trim(), settings.outputDir, startedAt);
        setRunOutcome("cancelled");
        toast.push({ tone: "neutral", title: "Analysis cancelled", message: `${pdbId.trim().toUpperCase()} was not finished, and nothing was saved.` });
        return;
      }
      // An ID that could not be fetched or resolved also returns normally. Nothing
      // was written, so there is nothing to record; the console says why.
      if (!result?.produced) {
        setRunOutcome("failed");
        toast.push({
          tone: "error",
          title: `Could not analyse ${pdbId.trim().toUpperCase()}`,
          message: "Nothing was produced for this ID. Check it against the console output and try again.",
        });
        return;
      }
      // Recorded before anything below can throw, or the `finally` falls
      // through to its own default and files a run that succeeded as failed.
      setRunOutcome("complete");
      // The paths Astra3 printed, so the Viewer and History open the files that
      // were written rather than a folder guessed from the label.
      const entryId = addHistoryEntry({ kind: "single", label: pdbId.trim().toUpperCase(), status: "complete", meta: `${quality[0].toUpperCase()}${quality.slice(1)} · ${structureSourceLabel(pdbId, format)}`, sessionPath: result?.sessionPath || null, reportPath: result?.reportPath || null });
      toast.push({ tone: "success", title: "Analysis complete", message: `${pdbId.trim().toUpperCase()}: report and session saved.` });
      // The report sits beside Session/, one level above the .pse.
      if (settings.autoOpenReport && isElectron && result?.sessionPath) {
        const outputFolder = dirnameOf(dirnameOf(result.sessionPath));
        if (outputFolder) {
          window.astra3Native.openPath(result.reportPath || joinPath(outputFolder, "Astra3_Report.html")).then((err) => {
            if (err) toast.push({ tone: "error", title: "Could not open report", message: err });
          });
        }
      }
      // Through openInPymol rather than the OS handler: .pse usually has no file
      // association on Windows (see fs:openInPymol).
      if (settings.autoOpenSession && isElectron && result?.sessionPath && engineInfo?.engine === "astra3") {
        setSelectedViewerId(entryId);
        setPage("viewer");
      } else if (settings.autoOpenSession && isElectron && result?.sessionPath) {
        window.astra3Native.openInPymol(result.sessionPath).then((err) => {
          if (err) toast.push({ tone: "error", title: "Could not open session", message: err });
        }).catch((e) => {
          // The analysis succeeded; report the failure and nothing more.
          toast.push({ tone: "error", title: "Could not open session", message: e?.message || "The session could not be opened." });
        });
      }
    } catch (e) {
      if (cancelRequestedRef.current) {
        // The other cancellation path: PyMOL was killed rather than
        // interrupted (always so on Windows), so the run rejects instead of
        // returning. Same cleanup, same silence.
        await discardRunOutput(e?.lines, pdbId.trim(), settings.outputDir, startedAt);
        setRunOutcome("cancelled");
        toast.push({ tone: "neutral", title: "Analysis cancelled", message: `${pdbId.trim().toUpperCase()} was not finished, and nothing was saved.` });
      } else {
        addHistoryEntry({ kind: "single", label: pdbId.trim().toUpperCase(), status: "failed", meta: "Analysis error" });
        toast.push({ tone: "error", title: "Analysis failed", message: e?.message || pdbId.trim().toUpperCase() });
      }
    } finally {
      setBusy(false);
      // Anything that got here without recording a completion did not finish:
      // a cancel, or an error. Distinguished so the bar can say which.
      setRunOutcome((prev) => prev || (cancelRequestedRef.current ? "cancelled" : "failed"));
      setCancelling(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    const result = await cancelRun();
    if (!result.ok && result.error) {
      toast.push({ tone: "error", title: "Could not cancel", message: result.error });
      setCancelling(false);
    }
    // On success the run's own catch clears busy and reports the cancel.
  };

  return (
    <PageScroll>
      <BusyLock active={otherPageBusy}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 32px 60px", display: "grid", gridTemplateColumns: "380px 1fr", gap: 24, alignItems: "start" }}>
        <div>
          <Card style={{ padding: 20 }}>
            <FieldLabel>PDB / mmCIF ID</FieldLabel>
            <TextInput icon="search" mono placeholder="e.g. 1ERJ" value={pdbId} onChange={(e) => setPdbId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !isBusy && runAnalysis()} />

            {/* An imported structure is read from its own file, so there is
                no format to fetch it in. */}
            {EXTENDED_ONLY_ID_RE.test(pdbId.trim()) && (
              <FieldHint>Entries with extended PDB IDs are issued in mmCIF only.</FieldHint>
            )}
            {!AST_ID_RE.test(pdbId.trim()) && !EXTENDED_ONLY_ID_RE.test(pdbId.trim()) && (<>
            <FieldLabel style={{ marginTop: 18 }}>Fetch format</FieldLabel>
            <SegmentedControl
              value={format}
              onChange={setFormat}
              options={
                settings.defaultFormat === "pdb"
                  ? [{ value: "pdb", label: "Legacy PDB" }, { value: "cif", label: "mmCIF" }]
                  : [{ value: "cif", label: "mmCIF" }, { value: "pdb", label: "Legacy PDB" }]
              }
            />
            <FieldHint>{settings.defaultFormat === "pdb"
              ? "Legacy PDB is tried first by default; Astra3 falls back to mmCIF automatically if unavailable."
              : "mmCIF is tried first by default; Astra3 falls back to legacy PDB automatically if unavailable."}</FieldHint>
            </>)}

            <FieldLabel style={{ marginTop: 18 }}>Output options</FieldLabel>
            <div style={{ borderTop: "1px solid var(--line-0)", marginTop: 4 }}>
              <Checkbox checked={opts.report} onChange={(v) => setOpts({ ...opts, report: v })} label="Generate report" description="HTML, JSON, and text reports" />
              <Checkbox checked={opts.images} onChange={(v) => setOpts({ ...opts, images: v })} label="Render images" description="6 PNG views" />
              {opts.images && <ImageQualityPicker quality={quality} setQuality={setQuality} />}
              <Checkbox checked={opts.csv} onChange={(v) => setOpts({ ...opts, csv: v })} label="CSV export" description="Off by default, opt-in" />
              <Checkbox checked={opts.sessionOnly} onChange={(v) => setOpts({ ...opts, sessionOnly: v, images: v ? false : opts.images, report: v ? false : opts.report })} label="Session only" description="Skip report + images, save the session only" />
            </div>

            <FieldLabel style={{ marginTop: 18 }}>Output directory</FieldLabel>
            {/* Every run writes to the folder set in Settings: the engine is started
                with it, so a folder chosen here for one run could not take effect. */}
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }} title={settings.outputDir}>
                <TextInput mono icon="folder" value={settings.outputDir} readOnly />
              </div>
              <Button variant="secondary" size="md" onClick={() => setPage("settings")}>Change in Settings</Button>
            </div>

            {busy ? (
              <Button variant="danger" size="lg" icon={cancelling ? undefined : "x"} onClick={handleCancel} disabled={cancelling} style={{ width: "100%", marginTop: 22 }}>
                {cancelling ? <><Spinner size={14} />Cancelling…</> : <>Cancel {pdbId.toUpperCase()}</>}
              </Button>
            ) : (
              <Button variant="primary" size="lg" icon="play" onClick={runAnalysis} disabled={isBusy || !pdbId.trim()} style={{ width: "100%", marginTop: 22 }}>
                Analyze
              </Button>
            )}
            <div className="mono" style={{ fontSize: 10.5, color: "var(--text-2)", marginTop: 10, textAlign: "center" }}>{buildCommand() || "..."}</div>
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Line count is not progress: the stages that print most are fast, and
              rendering prints one line per image. Same stage and image model as Overlay
              and Termini; stays on screen afterwards to say how the run ended. */}
          {(busy || runOutcome) && (
            <RunProgressBar lines={lines} plan={renderPlan} outcome={runOutcome} prefix={runPrefix} />
          )}
          <LiveConsole lines={busy || lines.length ? lines : [{ text: "Run an analysis to see live output here.", tone: "muted" }]} fillHeight onRespond={() => setPage("console")} />
        </div>
      </div>
      </BusyLock>
    </PageScroll>
  );
}

function FieldLabel({ children, style }) {
  return <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-1)", marginBottom: 7, ...style }}>{children}</div>;
}
function FieldHint({ children }) {
  return <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 6, lineHeight: 1.5 }}>{children}</div>;
}
// Image quality, shown under the option that renders images and only while
// it is on. Indented to the checkbox label.
function ImageQualityPicker({ quality, setQuality }) {
  return (
    <div style={{ padding: "0 0 10px 28px" }}>
      <SegmentedControl value={quality} onChange={setQuality} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "excellent", label: "Excellent" }]} />
    </div>
  );
}

// One component so all three pages (Overlay, Termini, Batch) share identical
// behavior and layout, not three independently-maintained copies.
function RunOptionsPanel({ quality, setQuality, opts, setOpts, showTerminiOptions = false, showHomomerOptions = false }) {
  const homomerMode = opts.homomerMode || "ask";
  const homomerPriority = opts.homomerPriority || DEFAULT_HOMOMER_PRIORITY;
  const homomerFallback = opts.homomerFallback || "ask";
  const priorityPicker = (
    <div style={{ marginTop: 10 }}>
      <HomomerPriorityPicker
        priority={homomerPriority}
        setPriority={(next) => setOpts({ ...opts, homomerPriority: next })}
      />
    </div>
  );
  // Close-ups use the same quality setting, so it stays selectable when only
  // close-ups are rendered.
  const closeupsWanted = showTerminiOptions && opts.termini_closeups !== false;
  return (
    <>
      <FieldLabel style={{ marginTop: 18 }}>Output options</FieldLabel>
      <div style={{ borderTop: "1px solid var(--line-0)", marginTop: 4 }}>
        <Checkbox checked={opts.report} onChange={(v) => setOpts({ ...opts, report: v })} label="Generate report" description="HTML, JSON, and text reports" />
        <Checkbox
          checked={opts.images}
          onChange={(v) => setOpts({ ...opts, images: v })}
          label="Render images"
          description="PNG views"
        />
        {opts.images && <ImageQualityPicker quality={quality} setQuality={setQuality} />}
        <Checkbox checked={opts.csv} onChange={(v) => setOpts({ ...opts, csv: v })} label="CSV export" description="Off by default, opt-in" />
        <Checkbox checked={opts.renderOnly} onChange={(v) => setOpts({ ...opts, renderOnly: v })} label="Session only" description="Skip report + whole-structure images, save the session only" />
        {showTerminiOptions && (
          // Independent of Render images: close-ups and the six whole-structure views
          // can be rendered in any combination (do_core_images and do_closeups in
          // astra3.py).
          <Checkbox
            checked={opts.termini_closeups !== false}
            onChange={(v) => setOpts({ ...opts, termini_closeups: v })}
            label="Close-up terminus views"
            description="Two isolated angles per terminus, with orientation arrows"
          />
        )}
        {!opts.images && closeupsWanted && <ImageQualityPicker quality={quality} setQuality={setQuality} />}
      </div>

      {showHomomerOptions && (
        <>
          <FieldLabel style={{ marginTop: 18 }}>Redundant chains (homomers)</FieldLabel>
          <FieldHint style={{ marginTop: -4, marginBottom: 8 }}>
            When a structure has multiple chains that are the same protein, Astra3 normally asks whether to keep just one.
          </FieldHint>
          <SegmentedControl
            wrap
            value={homomerMode}
            onChange={(v) => setOpts({ ...opts, homomerMode: v })}
            options={[{ value: "ask", label: "Ask each time" }, { value: "assembly", label: "Biological assembly" },
              { value: "reduce", label: "Always reduce" }, { value: "keep", label: "Keep all chains" }]}
          />
          {homomerMode === "assembly" && (
            <div style={{ marginTop: 10 }}>
              <FieldHint>
                Keeps the chains in the depositor's preferred biological assembly: one chain of a monomer, both chains of a dimer, and so on. Each report states which rule decided.
              </FieldHint>
              <FieldLabel style={{ marginTop: 14, marginBottom: 0 }}>When the assembly can't decide</FieldLabel>
              <FieldHint>
                The file has no usable assembly records, or its preferred assembly is built from symmetry copies that are not in the file.
              </FieldHint>
              <SegmentedControl
                wrap
                value={homomerFallback}
                onChange={(v) => setOpts({ ...opts, homomerFallback: v })}
                options={[{ value: "ask", label: "Ask each time" }, { value: "reduce", label: "Always reduce" }, { value: "keep", label: "Keep all chains" }]}
              />
              {homomerFallback === "reduce" && priorityPicker}
            </div>
          )}
          {homomerMode === "reduce" && priorityPicker}
        </>
      )}
    </>
  );
}

// Follows later changes to settings.defaultX for fields seeded from them.
// Pages stay mounted, so useState(settings.defaultX) only ran once. A field
// the person changed for this run is left alone, and nothing changes while a
// run is in progress.
//
// fields: [{ key, current, setCurrent }], key being the settings field name.
function useDefaultSync(settings, fields, busy) {
  const prevRef = useRef(Object.fromEntries(fields.map((f) => [f.key, settings[f.key]])));
  useEffect(() => {
    if (busy) return;
    fields.forEach(({ key, current, setCurrent }) => {
      if (settings[key] !== prevRef.current[key] && current === prevRef.current[key]) {
        // Still the old default, so the person did not change it: follow the new one.
        setCurrent(settings[key]);
      }
    });
    prevRef.current = Object.fromEntries(fields.map((f) => [f.key, settings[f.key]]));
  }, [busy, ...fields.map((f) => settings[f.key]), ...fields.map((f) => f.current)]);
}

// The global flags astra3.py accepts anywhere on the command line, shared by
// every run page.
function runOptionFlags(quality, opts, isTermini = false) {
  const flags = [];
  // Close-ups use the same quality, so the flag applies when either is wanted.
  // Only TERMINI has close-ups; other pages leave termini_closeups undefined.
  const anyImagesWanted = opts.images || (isTermini && opts.termini_closeups !== false);
  if (anyImagesWanted) {
    if (quality === "low") flags.push("-low");
    if (quality === "medium") flags.push("-medium");
    if (quality === "excellent") flags.push("-excellent");
  }
  if (!opts.images) flags.push("-skipimage");
  if (!opts.report) flags.push("-skipreport");
  if (opts.renderOnly) flags.push("-ro");
  if (opts.csv) flags.push("-csv");
  if (opts.termini_closeups === false) flags.push("-skipcloseup");
  // homomerMode: "ask" (no flag), "assembly" (-keepassembly, with
  // -assemblyfallback:<mode> for entries whose assembly records cannot decide),
  // "reduce" (-alwaysreduce) or "keep" (-keephomomers). Wherever reduction
  // applies, -reducepriority:<order> comes from homomerPriority.
  const reducePriority = () => {
    if (opts.homomerPriority && opts.homomerPriority.length) {
      flags.push(`-reducepriority:${opts.homomerPriority.join(",")}`);
    }
  };
  if (opts.homomerMode === "reduce") {
    flags.push("-alwaysreduce");
    reducePriority();
  } else if (opts.homomerMode === "keep") {
    flags.push("-keephomomers");
  } else if (opts.homomerMode === "assembly") {
    const fallback = opts.homomerFallback || "ask";
    flags.push("-keepassembly", `-assemblyfallback:${fallback}`);
    if (fallback === "reduce") reducePriority();
  }
  return flags;
}

// Matches the default in rank_homomer_chain_by_priority.
const DEFAULT_HOMOMER_PRIORITY = ["missing", "leastligands", "chainA"];

const HOMOMER_CRITERION_LABELS = {
  missing: "Fewest missing residues",
  leastligands: "Fewest bound ligands",
  mostligands: "Most bound ligands",
  chainA: "Chain A",
};

// Drag-to-reorder priority list for -alwaysreduce (rank_homomer_chain_by_priority
// in astra3_structure.py): each criterion narrows the chains tied for best
// before the next one applies, and a remaining tie goes to the alphabetically
// first chain. The ligand row toggles between fewest and most rather than
// listing both.
function HomomerPriorityPicker({ priority, setPriority }) {
  const dragIndex = useRef(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [draggingIdx, setDraggingIdx] = useState(null);
  const ligandsDirection = priority.includes("mostligands") ? "mostligands" : "leastligands";

  // setData is required for the drag to complete in some Chromium builds and
  // in Firefox. The reorder reads dragIndex, not this value.
  const onDragStart = (idx) => (e) => {
    dragIndex.current = idx;
    setDraggingIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };
  const onDragOver = (idx) => (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverIdx(idx); };
  const onDragEnd = () => { dragIndex.current = null; setDraggingIdx(null); setDragOverIdx(null); };
  const onDrop = (idx) => (e) => {
    e.preventDefault();
    const from = dragIndex.current;
    setDraggingIdx(null);
    setDragOverIdx(null);
    if (from === null || from === idx) return;
    const next = [...priority];
    const [moved] = next.splice(from, 1);
    next.splice(idx, 0, moved);
    setPriority(next);
    dragIndex.current = null;
  };

  const setLigandsDirection = (newDirection) => {
    setPriority(priority.map((c) => (c === "leastligands" || c === "mostligands" ? newDirection : c)));
  };

  return (
    <div>
      <FieldHint style={{ marginTop: -2, marginBottom: 8 }}>
        Drag to set tiebreak priority. Each step only decides between chains still tied after the ones above it. (Preset order is recommended for most runs.)
      </FieldHint>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {priority.map((criterion, idx) => {
          const isLigandsRow = criterion === "leastligands" || criterion === "mostligands";
          return (
            <div
              key={criterion}
              draggable
              onDragStart={onDragStart(idx)}
              onDragOver={onDragOver(idx)}
              onDrop={onDrop(idx)}
              onDragEnd={onDragEnd}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                background: dragOverIdx === idx && draggingIdx !== idx ? "var(--bg-2)" : "var(--bg-1)",
                border: dragOverIdx === idx && draggingIdx !== idx ? "1px solid var(--accent-bright)" : "1px solid var(--line-0)",
                borderRadius: "var(--radius-md)", cursor: "grab",
                opacity: draggingIdx === idx ? 0.5 : 1,
              }}
            >
              <Icon name="grip" size={13} style={{ color: "var(--text-2)", flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "var(--text-2)", fontFamily: "var(--font-mono)", width: 14, flexShrink: 0 }}>{idx + 1}</span>
              <span style={{ fontSize: 12.5, color: "var(--text-0)", flex: 1 }}>{HOMOMER_CRITERION_LABELS[criterion]}</span>
              {isLigandsRow && (
                <SegmentedControl
                  value={ligandsDirection}
                  onChange={setLigandsDirection}
                  options={[{ value: "leastligands", label: "Fewest" }, { value: "mostligands", label: "Most" }]}
                />
              )}
            </div>
          );
        })}
      </div>
      <FieldHint style={{ marginTop: 8 }}>
        If every chain still ties after all of the above, the alphabetically-first chain is used.
      </FieldHint>
    </div>
  );
}

/* ============================================================
   STRUCTURE LIST (shared: Overlay + Termini): add/remove/reorder
   ============================================================ */
function StructureListEditor({ items, setItems, allowFormatToggle = true, referenceMode, referenceId, setReferenceId, positionalReference }) {
  const [draft, setDraft] = useState("");
  const dragIndex = useRef(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [draggingIdx, setDraggingIdx] = useState(null);

  const add = () => {
    const id = draft.trim().toUpperCase();
    if (!id) return;
    if (items.some((i) => i.id === id)) { setDraft(""); return; }
    setItems([...items, { id, format: "cif" }]);
    setDraft("");
  };
  const remove = (id) => setItems(items.filter((i) => i.id !== id));
  const toggleFormat = (id) => setItems(items.map((i) => (i.id === id ? { ...i, format: i.format === "pdb" ? "cif" : "pdb" } : i)));
  const makeReference = (id) => {
    const idx = items.findIndex((i) => i.id === id);
    if (idx <= 0) return;
    const next = [...items];
    const [moved] = next.splice(idx, 1);
    next.unshift(moved);
    setItems(next);
  };

  // setData is required; see HomomerPriorityPicker.
  const onDragStart = (idx) => (e) => {
    dragIndex.current = idx;
    setDraggingIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };
  const onDragOver = (idx) => (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverIdx(idx); };
  const onDragEnd = () => { dragIndex.current = null; setDraggingIdx(null); setDragOverIdx(null); };
  const onDrop = (idx) => (e) => {
    e.preventDefault();
    const from = dragIndex.current;
    setDraggingIdx(null);
    setDragOverIdx(null);
    if (from === null || from === idx) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(idx, 0, moved);
    setItems(next);
    dragIndex.current = null;
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextInput mono icon="plus" placeholder="Add PDB ID..." value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        </div>
        <Button variant="secondary" onClick={add} disabled={!draft.trim()}>Add</Button>
      </div>
      {items.length === 0 ? (
        <EmptyState icon="layers" title="No structures added" description="Add PDB IDs above, or drag files onto this page." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((item, idx) => (
            <div
              key={item.id}
              draggable
              onDragStart={onDragStart(idx)}
              onDragOver={onDragOver(idx)}
              onDrop={onDrop(idx)}
              onDragEnd={onDragEnd}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                background: dragOverIdx === idx && draggingIdx !== idx ? "var(--bg-2)" : "var(--bg-1)",
                border: dragOverIdx === idx && draggingIdx !== idx ? "1px solid var(--accent-bright)" : "1px solid var(--line-0)",
                borderRadius: "var(--radius-md)", cursor: "grab",
                opacity: draggingIdx === idx ? 0.5 : 1,
              }}
            >
              <span style={{ color: "var(--text-2)" }}><Icon name="grip" size={14} /></span>
              <span className="mono" style={{ fontSize: 12, color: "var(--text-2)", width: 16 }}>{idx + 1}</span>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{item.id}</span>
              {allowFormatToggle && AST_ID_RE.test(item.id) && (
                <Tooltip text="Imported file, read as it is" align="left">
                  <Badge tone="neutral">Import</Badge>
                </Tooltip>
              )}
              {allowFormatToggle && EXTENDED_ONLY_ID_RE.test(item.id) && (
                <Tooltip text="Entries with extended PDB IDs are issued in mmCIF only" align="left">
                  <Badge tone="violet">mmCIF</Badge>
                </Tooltip>
              )}
              {allowFormatToggle && !AST_ID_RE.test(item.id) && !EXTENDED_ONLY_ID_RE.test(item.id) && (
                <Tooltip text={`Click to fetch as ${item.format === "cif" ? "legacy PDB" : "mmCIF"} instead`} align="left">
                  <Badge tone={item.format === "cif" ? "violet" : "neutral"}>
                    <button onClick={() => toggleFormat(item.id)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, font: "inherit", display: "flex", alignItems: "center", gap: 3 }}>
                      {item.format === "cif" ? "mmCIF" : "PDB"}
                      {/* A swap icon and a tooltip saying what the click does; a segmented control
                          is too wide for this row. */}
                      <Icon name="refresh" size={10} />
                    </button>
                  </Badge>
                </Tooltip>
              )}
              {(referenceMode || positionalReference) && (() => {
                // The same radio control for both models. referenceMode (OVERLAY) sets
                // referenceId; positionalReference (TERMINI) moves the clicked structure to
                // the top with makeReference, as dragging does.
                const isChecked = referenceMode ? referenceId === item.id : idx === 0;
                const handleClick = referenceMode ? () => setReferenceId(item.id) : () => makeReference(item.id);
                return (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-1)", cursor: "pointer" }}>
                    <span
                      onClick={handleClick}
                      role="radio"
                      aria-checked={isChecked}
                      style={{
                        width: 15, height: 15, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
                        border: `1.5px solid ${isChecked ? "var(--accent)" : "var(--line-1)"}`,
                        background: isChecked ? "var(--accent)" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 120ms ease", boxShadow: isChecked ? "0 0 0 3px var(--accent-wash)" : "none",
                      }}
                    >
                      {isChecked && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--text-on-accent)" }} />}
                    </span>
                    Reference
                  </label>
                );
              })()}
              <IconButton name="x" title="Remove" onClick={() => remove(item.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   OVERLAY PAGE
   ============================================================ */
function OverlayPage({ setPage }) {
  const { runAstraCommand, addHistoryEntry, pendingStructureSeed, setPendingStructureSeed, isBusy, cancelRun, cancelRequestedRef, settings } = useApp();
  const toast = useToast();
  const [items, setItems] = useState([]);
  useEffect(() => {
    // Depending on pendingStructureSeed itself makes this reactive to every
    // later seed.
    if (pendingStructureSeed?.kind === "overlay" && pendingStructureSeed.items?.length) {
      setItems(pendingStructureSeed.items);
      setPendingStructureSeed(null); // consume once
    }
  }, [pendingStructureSeed]);
  const [refMode, setRefMode] = useState("auto");
  const [referenceId, setReferenceId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // What the last run ended as: null while idle or running, then "complete",
  // "cancelled" or "failed". Kept separate from `busy` so the bar can stay on
  // screen after the run with its final state instead of vanishing.
  const [runOutcome, setRunOutcome] = useState(null);
  const [runPrefix, setRunPrefix] = useState("");
  const [lines, setLines] = useState([]);
  const [quality, setQuality] = useState(settings.defaultQuality);
  const [opts, setOpts] = useState({ report: true, images: true, csv: false, renderOnly: false });
  useDefaultSync(settings, [{ key: "defaultQuality", current: quality, setCurrent: setQuality }], busy);
  const otherPageBusy = isBusy && !busy;

  // Six views of every structure together, then six of each comparison
  // with the reference alone.
  const renderPlan = useMemo(() => {
    const comparisons = Math.max(1, items.length - 1);
    return { images: opts.images ? VIEWS_PER_RENDER * (1 + comparisons) : 0 };
  }, [items.length, opts.images]);

  const buildCommand = () => {
    const tokens = ["OVERLAY"];
    items.forEach((it, idx) => {
      tokens.push(it.id);
      if (it.format === "cif" && !AST_ID_RE.test(it.id)) tokens.push("-mmCIF");
    });
    if (refMode === "manual" && referenceId) tokens.push(`-reference${referenceId}`);
    tokens.push(...runOptionFlags(quality, opts));
    return tokens.join(" ");
  };

  const run = async () => {
    if (items.length < 2 || isBusy) return;
    setBusy(true); setCancelling(false); setLines([]); setRunOutcome(null);
    // Fixed at the start, like Single Structure: editing the list mid-run
    // does not relabel the run.
    setRunPrefix(items.map((it) => it.id).join(" vs "));
    const startedAt = Date.now(); // cancellation cleanup removes only what this run writes
    try {
      const result = await runAstraCommand(buildCommand(), {
        originPage: "overlay",
        onLog: (entry) => setLines((l) => [...l, entry]),
      });
      // Every structure in an overlay is measured against the others, so a
      // cancelled one is not a smaller overlay. Its whole output folder goes.
      if (result?.cancelled || cancelRequestedRef.current) {
        await discardRunOutput(result?.lines, null, null, startedAt);
        setRunOutcome("cancelled");
        toast.push({ tone: "neutral", title: "Overlay cancelled", message: "The comparison was not finished, and nothing was saved." });
        return;
      }
      if (!result?.produced) {
        setRunOutcome("failed");
        toast.push({
          tone: "error",
          title: "Overlay did not run",
          message: "No output was produced. Check the structure IDs against the console output and try again.",
        });
        return;
      }
      setRunOutcome("complete");
      // Reference first, then what it was compared against: both OVERLAY and
      // TERMINI measure everything against one reference.
      addHistoryEntry({ kind: "overlay", label: `${items[0].id} vs ${items.slice(1).map((i) => i.id).join(", ")}`, status: "complete", meta: `${items.length} structures${refMode === "auto" ? "" : ` · ref: ${referenceId}`}`, sessionPath: result?.sessionPath || null, reportPath: result?.reportPath || null });
      toast.push({ tone: "success", title: "Overlay complete", message: `${items.length} structures aligned.` });
    } catch (e) {
      if (cancelRequestedRef.current) {
        await discardRunOutput(e?.lines, null, null, startedAt);
        setRunOutcome("cancelled");
        toast.push({ tone: "neutral", title: "Overlay cancelled", message: "The comparison was not finished, and nothing was saved." });
      } else {
        toast.push({ tone: "error", title: "Overlay failed", message: e?.message });
      }
    } finally {
      setBusy(false);
      // Anything that got here without recording a completion did not finish:
      // a cancel, or an error. Distinguished so the bar can say which.
      setRunOutcome((prev) => prev || (cancelRequestedRef.current ? "cancelled" : "failed"));
      setCancelling(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    const result = await cancelRun();
    if (!result.ok && result.error) {
      toast.push({ tone: "error", title: "Could not cancel", message: result.error });
      setCancelling(false);
    }
  };

  return (
    <PageScroll>
      <BusyLock active={otherPageBusy}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 32px 60px", display: "grid", gridTemplateColumns: "380px 1fr", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Card style={{ padding: 20 }}>
            <FieldLabel>Structures ({items.length})</FieldLabel>
            <StructureListEditor items={items} setItems={setItems} referenceMode={refMode === "manual"} referenceId={referenceId} setReferenceId={setReferenceId} />
          </Card>
          <Card style={{ padding: 20 }}>
            <FieldLabel>Reference selection</FieldLabel>
            <SegmentedControl value={refMode} onChange={setRefMode} options={[{ value: "auto", label: "Automatic" }, { value: "manual", label: "Manual" }]} />
            <FieldHint>{refMode === "auto" ? "Astra3 selects the structure with the fewest bound ligands as reference." : "Choose the reference structure from the list above."}</FieldHint>
          </Card>
          <Card style={{ padding: 20 }}>
            {/* No homomer shortcuts: those are for Batch, which runs unattended. Overlay
                asks, as Astra3 does by default. */}
            <RunOptionsPanel quality={quality} setQuality={setQuality} opts={opts} setOpts={setOpts} />
          </Card>
          <Card style={{ padding: 20 }}>
            <SlowNetworkNotice active={busy && !runOutcome} />
            {busy ? (
              <Button variant="danger" size="lg" icon={cancelling ? undefined : "x"} onClick={handleCancel} disabled={cancelling} style={{ width: "100%" }}>
                {cancelling ? <><Spinner size={14} />Cancelling…</> : "Cancel Overlay"}
              </Button>
            ) : (
              <Button variant="primary" size="lg" icon="play" onClick={run} disabled={isBusy || items.length < 2} style={{ width: "100%" }}>
                Run Overlay
              </Button>
            )}
            <div className="mono" style={{ fontSize: 10.5, color: "var(--text-2)", marginTop: 10, textAlign: "center" }}>{buildCommand()}</div>
          </Card>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Directly above the console it describes, the same as every
              other page that runs an analysis. */}
          {(busy || runOutcome) && (
            <RunProgressBar lines={lines} plan={renderPlan} outcome={runOutcome} prefix={runPrefix} />
          )}
          {/* LiveConsole returns a fragment (console and prompt box); this keeps both
              in one grid cell, or the prompt box would wrap under the sidebar. */}
          <LiveConsole lines={busy || lines.length ? lines : [{ text: "Add 2+ structures and run overlay to see live output.", tone: "muted" }]} fillHeight onRespond={() => setPage("console")} />
        </div>
      </div>
      </BusyLock>
    </PageScroll>
  );
}

/* ============================================================
   TERMINI PAGE
   ============================================================ */
function TerminiPage({ setPage }) {
  const { runAstraCommand, addHistoryEntry, pendingStructureSeed, setPendingStructureSeed, isBusy, cancelRun, cancelRequestedRef, settings } = useApp();
  const toast = useToast();
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (pendingStructureSeed?.kind === "termini" && pendingStructureSeed.items?.length) {
      setItems(pendingStructureSeed.items);
      setPendingStructureSeed(null); // consume once
    }
  }, [pendingStructureSeed]);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // What the last run ended as: null while idle or running, then "complete",
  // "cancelled" or "failed". Kept separate from `busy` so the bar can stay on
  // screen after the run with its final state instead of vanishing.
  const [runOutcome, setRunOutcome] = useState(null);
  const [runPrefix, setRunPrefix] = useState("");
  const [lines, setLines] = useState([]);
  const [quality, setQuality] = useState(settings.defaultQuality);
  const [opts, setOpts] = useState({ report: true, images: true, csv: false, renderOnly: false });
  useDefaultSync(settings, [{ key: "defaultQuality", current: quality, setCurrent: setQuality }], busy);
  const [refMode, setRefMode] = useState("auto");
  // Automatic keeps the order structures were added in and hides the
  // reordering controls; Manual shows them, as on the Overlay page.
  const otherPageBusy = isBusy && !busy;

  // One render pass per comparison: six views plus the close-ups. The close-up
  // count depends on matched chains and termini, so this is a starting figure
  // that the run's own totals correct.
  const renderPlan = useMemo(() => {
    const comparisons = Math.max(1, items.length - 1);
    const perComparison = (opts.images ? VIEWS_PER_RENDER : 0)
      + (opts.termini_closeups === false ? 0 : CLOSEUPS_PER_COMPARISON);
    // Two or more comparisons also write six views of every structure
    // together.
    const combined = opts.images && comparisons > 1 ? VIEWS_PER_RENDER : 0;
    return { images: comparisons * perComparison + combined, comparisons };
  }, [items.length, opts.images, opts.termini_closeups]);

  const buildCommand = () => {
    const tokens = ["TERMINI"];
    items.forEach((it) => { tokens.push(it.id); if (it.format === "cif" && !AST_ID_RE.test(it.id)) tokens.push("-mmCIF"); });
    // Manual mode names the reference explicitly: the automatic pick (fewest
    // bound ligands) would override the order the person chose.
    if (refMode === "manual" && items.length > 0) tokens.push(`-reference${items[0].id}`);
    tokens.push(...runOptionFlags(quality, opts, true));
    return tokens.join(" ");
  };

  const run = async () => {
    if (items.length < 2 || isBusy) return;
    setBusy(true); setCancelling(false); setLines([]); setRunOutcome(null);
    // Fixed at the start, like Single Structure: editing the list mid-run
    // does not relabel the run.
    setRunPrefix(items.map((it) => it.id).join(" vs "));
    const startedAt = Date.now(); // cancellation cleanup removes only what this run writes
    try {
      const result = await runAstraCommand(buildCommand(), {
        originPage: "termini",
        onLog: (entry) => setLines((l) => [...l, entry]),
      });
      // As with OVERLAY, every comparison is against the reference, so a run that
      // stopped early has no result. Nothing is kept.
      if (result?.cancelled || cancelRequestedRef.current) {
        await discardRunOutput(result?.lines, null, null, startedAt);
        setRunOutcome("cancelled");
        toast.push({ tone: "neutral", title: "Comparison cancelled", message: "The comparison was not finished, and nothing was saved." });
        return;
      }
      if (!result?.produced) {
        setRunOutcome("failed");
        toast.push({
          tone: "error",
          title: "Comparison did not run",
          message: "No output was produced. Check the structure IDs against the console output and try again.",
        });
        return;
      }
      setRunOutcome("complete");
      addHistoryEntry({ kind: "termini", label: `${items[0].id} vs ${items.slice(1).map((i) => i.id).join(", ")}`, status: "complete", meta: `${items.length} structures`, sessionPath: result?.sessionPath || null, reportPath: result?.reportPath || null });
      toast.push({ tone: "success", title: "Termini comparison complete" });
    } catch (e) {
      if (cancelRequestedRef.current) {
        await discardRunOutput(e?.lines, null, null, startedAt);
        setRunOutcome("cancelled");
        toast.push({ tone: "neutral", title: "Comparison cancelled", message: "The comparison was not finished, and nothing was saved." });
      } else {
        toast.push({ tone: "error", title: "Comparison failed", message: e?.message });
      }
    } finally {
      setBusy(false);
      // Anything that got here without recording a completion did not finish:
      // a cancel, or an error. Distinguished so the bar can say which.
      setRunOutcome((prev) => prev || (cancelRequestedRef.current ? "cancelled" : "failed"));
      setCancelling(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    const result = await cancelRun();
    if (!result.ok && result.error) {
      toast.push({ tone: "error", title: "Could not cancel", message: result.error });
      setCancelling(false);
    }
  };

  return (
    <PageScroll>
      <BusyLock active={otherPageBusy}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 32px 60px", display: "grid", gridTemplateColumns: "380px 1fr", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Card style={{ padding: 20 }}>
            <FieldLabel>Structures ({items.length})</FieldLabel>
            <StructureListEditor items={items} setItems={setItems} positionalReference={refMode === "manual"} />
          </Card>
          <Card style={{ padding: 20 }}>
            <FieldLabel>Reference selection</FieldLabel>
            <SegmentedControl value={refMode} onChange={setRefMode} options={[{ value: "auto", label: "Automatic" }, { value: "manual", label: "Manual" }]} />
            <FieldHint>{refMode === "auto" ? "Astra3 selects the structure with the fewest bound ligands as reference." : "Drag to reorder the list above, or use \"Make reference\" on any entry to move it to the top. The structure at the top is used as the reference."}</FieldHint>
          </Card>
          <Card style={{ padding: 20 }}>
            {/* No homomer shortcuts, as on Overlay. showTerminiOptions is the close-up
                views checkbox. */}
            <RunOptionsPanel quality={quality} setQuality={setQuality} opts={opts} setOpts={setOpts} showTerminiOptions />
          </Card>
          <Card style={{ padding: 20 }}>
            <SlowNetworkNotice active={busy && !runOutcome} />
            {busy ? (
              <Button variant="danger" size="lg" icon={cancelling ? undefined : "x"} onClick={handleCancel} disabled={cancelling} style={{ width: "100%" }}>
                {cancelling ? <><Spinner size={14} />Cancelling…</> : "Cancel Comparison"}
              </Button>
            ) : (
              <Button variant="primary" size="lg" icon="play" onClick={run} disabled={isBusy || items.length < 2} style={{ width: "100%" }}>
                Run Termini Comparison
              </Button>
            )}
            <div className="mono" style={{ fontSize: 10.5, color: "var(--text-2)", marginTop: 10, textAlign: "center" }}>{buildCommand()}</div>
          </Card>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Directly above the console it describes, the same as every
              other page that runs an analysis. */}
          {(busy || runOutcome) && (
            <RunProgressBar lines={lines} plan={renderPlan} outcome={runOutcome} prefix={runPrefix} />
          )}
          <LiveConsole lines={busy || lines.length ? lines : [{ text: "Add a reference plus 1+ comparison structures.", tone: "muted" }]} fillHeight onRespond={() => setPage("console")} />
        </div>
      </div>
      </BusyLock>
    </PageScroll>
  );
}

/* ============================================================
   BATCH PAGE
   ============================================================ */
function BatchPage({ setPage }) {
  const { runAstraCommand, addHistoryEntry, settings, isBusy, acquireLock, releaseLock, setCompletionPulse, cancelRun, sequenceCancelRef, sequenceActiveRef } = useApp();
  const toast = useToast();
  const [pasteText, setPasteText] = useState("");
  const [showFileImport, setShowFileImport] = useState(false);
  const [queue, setQueue] = useState([]);
  const [running, setRunning] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [lines, setLines] = useState([]);
  const [quality, setQuality] = useState(settings.defaultQuality);
  const [opts, setOpts] = useState({ report: true, images: true, csv: false, renderOnly: false });
  useDefaultSync(settings, [{ key: "defaultQuality", current: quality, setCurrent: setQuality }], running);
  const otherPageBusy = isBusy && !running;
  const { pendingStructureSeed, setPendingStructureSeed } = useApp();
  useEffect(() => {
    // Structures handed over from another page (Related Structures).
    if (pendingStructureSeed?.kind === "batch" && pendingStructureSeed.items?.length && !running) {
      setPasteText(pendingStructureSeed.items.map((it) => it.id + (it.format === "cif" ? " -mmCIF" : "")).join("\n"));
      setPendingStructureSeed(null); // consume once
    }
  }, [pendingStructureSeed]);

  const parsePaste = () => {
    // # starts a comment, as in a batch file.
    const jobs = pasteText.split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean).map((line) => {
      const mmcif = /-mmCIF/i.test(line);
      const id = line.replace(/-mmCIF/i, "").trim().toUpperCase();
      return { id, format: mmcif ? "cif" : "pdb", status: "queued" };
    });
    setQueue(jobs);
    setLines([]);
    toast.push({ tone: "neutral", title: "Queue built", message: `${jobs.length} structure(s) queued.` });
  };

  const handleFiles = (files) => {
    const entry = files[0];
    const reader = new FileReader();
    reader.onload = () => { setPasteText(reader.result); setShowFileImport(false); toast.push({ tone: "success", title: "File loaded", message: entry.name }); };
    reader.readAsText(entry.file); // entry is DropZone's {name, size, ext, path, file}
  };

  // Lives in AppProvider (sequenceCancelRef) so any cancel, from this page or
  // the Advanced Console, stops the whole queue rather than one structure.
  const cancelRequestedRef = sequenceCancelRef;
  const [batchCancelling, setBatchCancelling] = useState(false);
  // Just the structure currently running, kept apart from the page console
  // (which holds the whole queue's output) so the bar can tell how far
  // into THIS structure the queue is rather than only counting whole ones.
  const [itemLines, setItemLines] = useState([]);
  const [queueStartedAt, setQueueStartedAt] = useState(0);
  const [pendingConfirm, setPendingConfirm] = useState(null); // the large-batch confirmation

  // A structure stopped part-way leaves a partial folder that looks finished
  // until opened, so it is removed. A cancel taken at a checkpoint returns a
  // cancelled result; one that kills the process makes runAstraCommand throw.
  // Both reach here.
  const discardPartialOutput = async (job, lines, startedAt) => {
    // Located from the paths this structure's own run printed, falling back
    // to the single-structure folder name for a cancel that landed before
    // any path was printed. See discardRunOutput.
    const removed = await discardRunOutput(lines, job.id, settings.outputDir, startedAt);
    if (removed) {
      toast.push({
        tone: "neutral",
        title: `${job.id} was not finished`,
        message: "Its partial output has been removed.",
      });
    }
  };

  const runQueue = async (resumeFailedOnly = false) => {
    if (isBusy) return;
    // "Confirm before large batch runs" asks first at 10 or more structures.
    const targetCount = (resumeFailedOnly ? queue.filter((q) => q.status === "failed") : queue).length;
    if (settings.confirmBeforeBatch !== false && targetCount >= 10 && !pendingConfirm) {
      setPendingConfirm({ resumeFailedOnly, count: targetCount });
      return;
    }
    setPendingConfirm(null);
    cancelRequestedRef.current = false;
    sequenceActiveRef.current = true; // see cancelRun
    setBatchCancelling(false);
    // Hold the lock for the whole queue; the token proves ownership.
    const lockToken = acquireLock();
    if (lockToken === null) return;
    setRunning(true);
    setQueueStartedAt(Date.now()); // the queue-level time estimate measures from here
    setLines([]);
    setItemLines([]);
    // A full run starts from scratch; "Resume failed only" keeps completed
    // items counted.
    if (!resumeFailedOnly) {
      setQueue((q) => q.map((j) => ({ ...j, status: "queued" })));
    }
    const targets = resumeFailedOnly ? queue.filter((q) => q.status === "failed") : queue;
    let cancelled = false;
    const createdEntryIds = []; // see batchEntryIds
    for (const job of targets) {
      if (cancelRequestedRef.current) { cancelled = true; break; }
      const idx = queue.findIndex((q) => q.id === job.id);
      setCurrentIdx(idx);
      setQueue((q) => q.map((j, i) => (i === idx ? { ...j, status: "running" } : j)));
      const cmd = [job.id, (job.format === "cif" && !AST_ID_RE.test(job.id)) ? "-mmCIF" : "", ...runOptionFlags(quality, opts)].filter(Boolean).join(" ");
      const itemStartedAt = Date.now(); // as above, per structure
      setItemLines([]); // this structure's own feed starts here
      setLines((l) => [...l, { text: `> ${cmd}`, tone: "command" }]);
      try {
        // holdLock with lockToken keeps the lock for the whole queue. Prompts
        // go through the global dialog and pause the queue.
        const result = await runAstraCommand(cmd, {
          silent: true,
          holdLock: true,
          lockToken,
          originPage: "batch",
          onLog: (entry) => { setLines((l) => [...l, entry]); setItemLines((l) => [...l, entry]); },
        });
        // A cancel can return normally, so check the result: a half-rendered
        // structure must not count as complete.
        const wasCancelled = result?.cancelled === true || result?.status === "cancelled";
        // A structure whose ID could not be fetched returns normally and
        // produces nothing. Marking it complete gave it a check mark, a
        // history entry with nothing behind it, and a place in the queue's
        // success count.
        const producedOutput = result?.produced === true;
        setQueue((q) => q.map((j, i) => (i === idx
          ? { ...j, status: wasCancelled ? "cancelled" : producedOutput ? "complete" : "failed" }
          : j)));
        if (wasCancelled) {
          await discardPartialOutput(job, result?.lines, itemStartedAt);
          // Set here as well as in the catch: a cancel taken at a checkpoint returns
          // rather than throws. The rest of the queue, its History status and the
          // empty-queue guard all read this flag.
          cancelled = true;
          // No History entry for this structure, and the queue stops.
          break;
        }
        // Each completed item now also gets its own "single" history entry
        // with a real sessionPath, exactly like a run from the Single
        // Structure page would, so it's fully selectable/openable afterward.
        if (!producedOutput) {
          // The queue carries on: one unusable ID is not a reason to abandon
          // the structures after it.
          setLines((l) => [...l, { text: `${job.id}: nothing was produced; skipped.`, tone: "error" }]);
          continue;
        }
        const createdId = addHistoryEntry({
          kind: "single", label: job.id, status: "complete",
          meta: `${quality[0].toUpperCase()}${quality.slice(1)} · ${structureSourceLabel(job.id, job.format)} · via Batch`,
          sessionPath: result?.sessionPath || null,
          reportPath: result?.reportPath || null,
        });
        if (createdId) createdEntryIds.push(createdId);
      } catch (e) {
        // A cancel that kills the command lands here as a thrown error. A cancelled
        // item is not a failed one, and Resume failed only must not re-run it.
        if (cancelRequestedRef.current) {
          setLines((l) => [...l, { text: "Cancelled.", tone: "warning" }]);
          // Marked cancelled here rather than left for the sweep below, which cannot
          // tell it from structures that never started: this is the one whose partial
          // output has to go.
          setQueue((q) => q.map((j, i) => (i === idx ? { ...j, status: "cancelled" } : j)));
          await discardPartialOutput(job, e?.lines, itemStartedAt);
          cancelled = true;
          break;
        }
        setLines((l) => [...l, { text: e?.message || "Command failed", tone: "error" }]);
        setQueue((q) => q.map((j, i) => (i === idx ? { ...j, status: "failed" } : j)));
      }
    }
    setCurrentIdx(-1);
    sequenceActiveRef.current = false;
    setRunning(false);
    if (cancelled) {
      // Anything still queued will never run now. Leaving them on the clock
      // icon reads as "about to start" when the queue has already stopped.
      setQueue((q) => q.map((j) => (j.status === "queued" ? { ...j, status: "cancelled" } : j)));
    }
    releaseLock(); // release the held lock now that the whole queue is done
    const finalQueue = await new Promise((resolve) => setQueue((q) => { resolve(q); return q; }));
    const succeeded = finalQueue.filter((j) => j.status === "complete").length;
    const allDone = !cancelled && succeeded === finalQueue.length;
    // A queue that was stopped before a single structure finished produced
    // nothing: no output on disk, no per-structure entries, nothing to open.
    // An entry for it would be a row that leads nowhere.
    if (!cancelled || succeeded > 0) {
      addHistoryEntry({
        kind: "batch",
        label: `Batch: ${finalQueue.length} structures`,
        // Cancelled is not failed: the structures that did finish are real
        // results, and this entry is how they are reached.
        status: cancelled ? "cancelled" : allDone ? "complete" : "failed",
        meta: cancelled ? `Cancelled at ${succeeded}/${finalQueue.length}` : `${succeeded}/${finalQueue.length} succeeded`,
        // Structures this batch completed, for the Reports page's dropdown; a batch
        // has no report of its own.
        batchIds: finalQueue.filter((j) => j.status === "complete").map((j) => j.id),
        // The exact History entries this batch created. Matching on structure IDs
        // let an overlapping re-run claim another batch's runs.
        batchEntryIds: createdEntryIds.slice(),
      });
    }
    toast.push({
      tone: cancelled ? "warning" : allDone ? "success" : "warning",
      title: cancelled ? "Batch cancelled" : "Batch finished",
      message: cancelled
        ? `Stopped after ${succeeded} of ${finalQueue.length}. The rest were not started.`
        : `${succeeded}/${finalQueue.length} succeeded.`,
    });
    // Items run silent, so AppProvider's per-run completion pulse never fires for
    // them. This fires once, when the whole queue succeeded.
    if (allDone && finalQueue.length > 0) {
      setCompletionPulse(Math.random());
    }
  };

  const failedCount = queue.filter((q) => q.status === "failed").length;
  const completeCount = queue.filter((q) => q.status === "complete").length;
  // Only structures that finished, either way. A cancelled one produced
  // nothing (its partial output was deleted), so it is not progress. See
  // BatchProgressBar.
  const settledCount = completeCount + failedCount;
  // Every BATCH item is a single-structure run: one six-view render.
  const itemPlan = useMemo(() => ({ images: opts.images ? VIEWS_PER_RENDER : 0 }), [opts.images]);

  // "cancelled" is its own state, distinct from failed: the structure did not
  // error, it was stopped part-way. It gets the same red X because from the
  // person's side both mean "this one produced nothing usable".
  const statusIcon = { queued: "clock", running: "refresh", complete: "check", failed: "x", cancelled: "x" };
  const statusColor = {
    queued: "var(--text-2)", running: "var(--amber)", complete: "var(--sage)",
    failed: "var(--coral)", cancelled: "var(--coral)",
  };

  return (
    <PageScroll>
      <BusyLock active={otherPageBusy}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 32px 60px", display: "grid", gridTemplateColumns: "380px 1fr", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Card style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <FieldLabel style={{ marginBottom: 0 }}>Structure IDs</FieldLabel>
              <Tooltip text="Import from a .txt file instead">
                <button
                  onClick={() => setShowFileImport((v) => !v)}
                  style={{
                    display: "flex", alignItems: "center", gap: 5, background: showFileImport ? "var(--accent-wash)" : "transparent",
                    color: showFileImport ? "var(--accent-bright)" : "var(--text-1)", border: "1px solid var(--line-1)",
                    borderRadius: "var(--radius-sm)", padding: "4px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  <Icon name="upload" size={12} />.txt file
                </button>
              </Tooltip>
            </div>
            <textarea
              value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6}
              className="mono"
              // --bg-1 for the same reason as TextInput: a field painted the
              // page colour has no edge to see in the dark theme.
              style={{ width: "100%", background: "var(--bg-1)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-md)", color: "var(--text-0)", padding: 10, fontSize: 12.5, resize: "vertical", outline: "none" }}
              placeholder={"1AKE\n4AKE\n1ERJ -mmCIF"}
            />
            <FieldHint>One ID per line. Add <code className="mono">-mmCIF</code> after an ID to fetch it as mmCIF.</FieldHint>
            {showFileImport && (
              <div style={{ marginTop: 10 }}>
                <DropZone onFiles={handleFiles} accept=".txt,.csv,.list" compact />
              </div>
            )}
            <Button variant="secondary" size="md" onClick={parsePaste} style={{ width: "100%", marginTop: 12 }}>Build Queue</Button>
          </Card>
          <Card style={{ padding: 20 }}>
            <RunOptionsPanel quality={quality} setQuality={setQuality} opts={opts} setOpts={setOpts} showHomomerOptions />
          </Card>
          {queue.length > 0 && (
            <Card style={{ padding: 20 }}>
              {/* The same panel as the other prompts in LiveConsole: amber border, "Astra3
                  needs your input" and green and red y/n buttons. No free-text field: there
                  is no third answer. */}
              {pendingConfirm && (
                <div className="mono" style={{ marginBottom: 10, padding: 14, border: "1px solid var(--amber)", borderRadius: "var(--radius-sm)", background: "var(--bg-2)", boxShadow: "var(--shadow-md)" }}>
                  <div style={{ fontSize: 11, color: "var(--amber)", fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="alertTriangle" size={12} /> Astra3 needs your input
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--text-0)", marginBottom: 12 }}>
                    Run {pendingConfirm.count} structures?
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button variant="confirm" size="sm" className="mono" onClick={() => runQueue(pendingConfirm.resumeFailedOnly)}>y</Button>
                    <Button variant="decline" size="sm" className="mono" onClick={() => setPendingConfirm(null)}>n</Button>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-2)", marginTop: 10 }}>
                    Batch will not run until you answer.
                  </div>
                </div>
              )}
              <Button variant="primary" size="lg" icon={running ? undefined : "play"} onClick={() => runQueue(false)} disabled={isBusy} style={{ width: "100%" }}>
                {running ? <><Spinner size={14} />Running {settledCount}/{queue.length}…</> : `Run Batch (${queue.length})`}
              </Button>
              {/* Cancels the whole queue (sequenceCancelRef), not just the current
                  structure. */}
              {running && (
                <Button variant="danger" size="md" icon={batchCancelling ? undefined : "x"} disabled={batchCancelling}
                  onClick={async () => {
                    setBatchCancelling(true);
                    const result = await cancelRun();
                    if (result?.ok) {
                      toast.push({ tone: "neutral", title: "Cancelling batch", message: result.note || "Stopping after the current structure." });
                    } else if (result?.error) {
                      toast.push({ tone: "error", title: "Could not cancel", message: result.error });
                    }
                    setBatchCancelling(false);
                  }}
                  style={{ width: "100%", marginTop: 8 }}>
                  {batchCancelling ? <><Spinner size={14} />Stopping…</> : "Cancel batch"}
                </Button>
              )}
              {!running && failedCount > 0 && (
                <Button variant="secondary" size="md" icon="refresh" onClick={() => runQueue(true)} disabled={isBusy} style={{ width: "100%", marginTop: 8 }}>
                  Resume {failedCount} failed job{failedCount > 1 ? "s" : ""}
                </Button>
              )}
            </Card>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {queue.length > 0 && (
            <>
            <SlowNetworkNotice active={running} />
            <BatchProgressBar
              queue={queue}
              itemLines={itemLines}
              itemPlan={itemPlan}
              running={running}
              startedAt={queueStartedAt}
            />
            </>
          )}
          <div>
            <SectionLabel>Queue</SectionLabel>
            {queue.length === 0 ? (
              <EmptyState icon="batch" title="No queue built yet" description="Paste IDs or drop a .txt file, then click Build Queue." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 230, overflowY: "auto" }}>
                {queue.map((job, i) => (
                  <div key={job.id + i} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: "var(--radius-md)",
                    background: currentIdx === i ? "var(--accent-wash)" : "var(--bg-1)", border: "1px solid var(--line-0)",
                  }}>
                    <span style={{ color: statusColor[job.status] }} className={job.status === "running" ? "astra-spin" : ""}><Icon name={statusIcon[job.status]} size={14} /></span>
                    <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>{job.id}</span>
                    {AST_ID_RE.test(job.id) ? <Badge tone="neutral">Import</Badge> : job.format === "cif" && <Badge tone="violet">mmCIF</Badge>}
                    <span style={{ fontSize: 11, color: "var(--text-2)", textTransform: "capitalize" }}>{job.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <LiveConsole lines={running || lines.length ? lines : [{ text: "Batch output will appear here while running.", tone: "muted" }]} height={220} onRespond={() => setPage("console")} />
        </div>
      </div>
      </BusyLock>
    </PageScroll>
  );
}

/* ============================================================
   IMPORT LOCAL PAGE
   ============================================================ */
/* ============================================================
   RELATED STRUCTURES: other PDB entries of the same protein, with what
   each is useful for and what will go wrong if it is compared. The
   search and every judgement happen in electron/related-structures.js;
   this page only presents them and hands chosen entries to the
   Overlay, Termini, Batch and Single Structure pages.
   ============================================================ */
// RCSB's pre-rendered picture of an entry. Tries each known image address in
// turn and renders nothing if none loads (offline, or no image published), so
// a missing picture never breaks the list.
function RcsbThumb({ urls, size = 64 }) {
  const [attempt, setAttempt] = useState(0);
  if (!urls || attempt >= urls.length) return null;
  return (
    <img src={urls[attempt]} alt="" loading="lazy" width={size} height={size}
      onError={() => setAttempt((n) => n + 1)}
      style={{ width: size, height: size, objectFit: "contain", borderRadius: 6, background: "#fff",
               border: "1px solid var(--line-0)", flexShrink: 0 }} />
  );
}

function RelatedPage({ setPage }) {
  const { setPendingStructureSeed, settings } = useApp();
  const toast = useToast();
  const [pdbId, setPdbId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [ligandFilter, setLigandFilter] = useState("all");
  const [resFilter, setResFilter] = useState("any");
  const [mutantFilter, setMutantFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("same");
  const [selectedLigands, setSelectedLigands] = useState([]);     // chemical component IDs
  const [ligandMatch, setLigandMatch] = useState("any");          // any / all of the selected ligands
  const [ligandSearch, setLigandSearch] = useState("");
  const [selectedOrganisms, setSelectedOrganisms] = useState([]); // lower-case organism keys
  const [showFilters, setShowFilters] = useState(false);
  const pageRef = useRef(null);
  const scrollerRef = useRef(null);
  const [showTop, setShowTop] = useState(false);
  // Cmd+F (Ctrl+F on Windows) finds text in the results list.
  const resultsRef = useRef(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findStatus, setFindStatus] = useState(null);
  useFindShortcut(() => setFindOpen(true));
  const closeFind = () => { setFindOpen(false); setFindQuery(""); setFindStatus(null); };

  // The results list gets long, so offer a way back to the search box. The
  // page scrolls inside an ancestor container, so find the one that scrolls.
  useEffect(() => {
    if (!pageRef.current) return undefined;
    let el = pageRef.current.parentElement;
    while (el && el.scrollHeight <= el.clientHeight + 4) el = el.parentElement;
    scrollerRef.current = el;
    if (!el) return undefined;
    const onScroll = () => setShowTop(el.scrollTop > 500);
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [result]);
  const backToTop = () => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ top: 0, behavior: "smooth" });
  };

  const search = async (id, entityId) => {
    const clean = String(id || "").trim().toUpperCase();
    // Imported structures have no PDB entry to search from. Said plainly
    // rather than as a malformed-ID error.
    if (/^AST-\d+$/.test(clean)) {
      setResult({ ok: false, incompatible: true, error: `${clean} is an imported structure, which Related Structures cannot use: it searches the Protein Data Bank from a published entry. If the imported file is a PDB entry (for example 3FXI), search that PDB ID instead.` });
      return;
    }
    if (!/^(?:[A-Z0-9]{4}|PDB_[A-Z0-9]{8})$/.test(clean)) {
      toast.push({ tone: "error", title: "Enter a PDB ID", message: "Related structures need a PDB ID, for example 1AKE or pdb_00001ake." });
      return;
    }
    setLoading(true);
    setSelected(new Set());
    if (!entityId) resetFilters();
    try {
      const r = await window.astra3Native.findRelatedStructures({ pdbId: clean, entityId });
      setResult(r);
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally {
      setLoading(false);
    }
  };

  const hits = result?.ok ? result.hits : [];
  const minCoverage = result?.thresholds?.sameRegionCoverage ?? 0.7;
  const visible = useMemo(() => hits.filter((h) => {
    if (ligandFilter === "bound" && h.ligandFree) return false;
    if (ligandFilter === "free" && !h.ligandFree) return false;
    if (resFilter !== "any" && (h.resolution == null || h.resolution > parseFloat(resFilter))) return false;
    if (mutantFilter === "hide" && h.mutations > 0) return false;
    if (regionFilter === "same" && h.coverage != null && h.coverage < minCoverage) return false;
    if (selectedLigands.length) {
      const own = h.ligands || [];
      const ok = ligandMatch === "all" ? selectedLigands.every((l) => own.includes(l)) : selectedLigands.some((l) => own.includes(l));
      if (!ok) return false;
    }
    if (selectedOrganisms.length && !selectedOrganisms.includes((h.organism || "").trim().toLowerCase())) return false;
    return true;
  }), [hits, ligandFilter, resFilter, mutantFilter, regionFilter, minCoverage, selectedLigands, ligandMatch, selectedOrganisms]);
  const activeFilters = [regionFilter !== "same", ligandFilter !== "all", resFilter !== "any",
                         mutantFilter !== "all", selectedLigands.length > 0, selectedOrganisms.length > 0].filter(Boolean).length;
  function resetFilters() {
    setRegionFilter("same"); setLigandFilter("all"); setResFilter("any"); setMutantFilter("all");
    setSelectedLigands([]); setLigandMatch("any"); setLigandSearch(""); setSelectedOrganisms([]);
  }
  const toggleIn = (setter) => (value) => setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  const toggleLigand = toggleIn(setSelectedLigands);
  const toggleOrganism = toggleIn(setSelectedOrganisms);
  const selectStyle = {
    background: "var(--bg-1)", color: "var(--text-0)", border: "1px solid var(--line-1)",
    borderRadius: "var(--radius-sm)", padding: "5px 8px", fontSize: 12, maxWidth: 320,
  };

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const chosen = visible.filter((h) => selected.has(h.entryId)).map((h) => h.entryId);
  const format = settings.defaultFormat === "pdb" ? "pdb" : "cif";
  const send = (kind, ids) => {
    setPendingStructureSeed({ kind, items: ids.map((id) => ({ id, format })) });
    setPage(kind);
  };

  const pct = (x) => `${Math.round(x * 100)}%`;
  const signed = (n) => (n > 0 ? `+${n}` : String(n));
  const severityColor = { high: "var(--coral)", medium: "var(--gold, #b8860b)", low: "var(--text-1)" };
  const suggestionLabel = { overlay: "Overlay", termini: "Termini", state: "Ligand contrast" };

  return (
    <PageScroll>
      {findOpen && (
        <div style={{ position: "sticky", top: 12, zIndex: 20, height: 0, display: "flex", justifyContent: "flex-end", paddingRight: 24 }}>
          <ReadmeFindBar query={findQuery} setQuery={setFindQuery} status={findStatus} setStatus={setFindStatus}
            contentRef={resultsRef} placeholder="Find in results…" autoFocus onClose={closeFind}
            contentVersion={`${result?.query?.entryId || ""}:${visible.length}:${visible[0]?.entryId || ""}:${visible[visible.length - 1]?.entryId || ""}`}
            style={{ height: "fit-content", marginBottom: 0, padding: 6, background: "var(--bg-2)", border: "1px solid var(--line-1)",
                     borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)" }} />
        </div>
      )}
      <div ref={pageRef} style={{ maxWidth: 980, margin: "0 auto", padding: "28px 32px 120px" }}>
        <SectionLabel>Find related structures</SectionLabel>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1, maxWidth: 340 }}>
            <TextInput icon="search" mono placeholder="PDB ID, e.g. 1AKE" value={pdbId}
              onChange={(e) => setPdbId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") search(pdbId); }} />
          </div>
          <Button variant="primary" icon="search" disabled={loading} onClick={() => search(pdbId)}>
            {loading ? "Searching…" : "Find related"}
          </Button>
        </div>
        <FieldHint>Finds every experimental PDB entry of the same protein (same UniProt entry), then checks each one against your structure before you run anything.</FieldHint>

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-1)", marginTop: 18 }}>
            <Spinner size={13} /> Searching the Protein Data Bank…
          </div>
        )}

        {!loading && result && !result.ok && (
          <div style={{ marginTop: 22 }}>
            <EmptyState icon="alertTriangle" title={result.incompatible ? "Not compatible with imported structures" : "Could not find related structures"} description={result.error} />
          </div>
        )}

        {!loading && result?.ok && (
          <div style={{ marginTop: 22 }}>
            <Card style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <RcsbThumb key={`q-${result.query.entryId}`} urls={result.query.thumbnails} size={72} />
              <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="mono" style={{ fontWeight: 700, fontSize: 14 }}>{result.query.entryId}</span>
                <Badge tone="accent">{result.query.method || "Unknown method"}{result.query.resolution != null ? ` · ${result.query.resolution.toFixed(2)} Å` : ""}</Badge>
                {result.query.ligands.length ? <Badge tone="violet">{result.query.ligands.join(", ")}</Badge> : <Badge tone="neutral">Ligand-free</Badge>}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-1)", marginTop: 6 }}>
                {result.query.description || "Protein"} · chain{result.query.chains.length === 1 ? "" : "s"} {result.query.chains.join(", ")}
                {result.basis === "uniprot"
                  ? <> · UniProt <span className="mono">{result.query.accession}</span>{result.query.regions.length ? ` residues ${result.query.regions[0][0]}-${result.query.regions[result.query.regions.length - 1][1]}` : ""}</>
                  : " · no UniProt mapping, matched by sequence (≥90% identity)"}
              </div>
              </div>
              </div>
              {result.query.entities.length > 1 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11.5, color: "var(--text-1)", marginBottom: 6 }}>This entry has several proteins. Search for:</div>
                  <SegmentedControl
                    value={result.query.entityId}
                    onChange={(eid) => search(result.query.entryId, eid)}
                    options={result.query.entities.map((e) => ({ value: e.entityId, label: `${e.description || "Entity " + e.entityId} (${e.chains.join(",")})` }))}
                  />
                </div>
              )}
            </Card>

            <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "18px 0 10px" }}>
              <Button variant={showFilters ? "primary" : "secondary"} size="sm" icon="search"
                onClick={() => setShowFilters((v) => !v)}>
                Filters{activeFilters ? ` (${activeFilters})` : ""}
              </Button>
              {activeFilters > 0 && <Button variant="ghost" size="sm" onClick={resetFilters}>Reset</Button>}
            </div>
            {showFilters && (
              <Card style={{ padding: "14px 16px", marginBottom: 12 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
                  <SegmentedControl value={regionFilter} onChange={setRegionFilter}
                    options={[{ value: "same", label: "Same region" }, { value: "all", label: "Any coverage" }]} />
                  <SegmentedControl value={ligandFilter} onChange={setLigandFilter}
                    options={[{ value: "all", label: "All" }, { value: "bound", label: "With ligands" }, { value: "free", label: "Ligand-free" }]} />
                  <SegmentedControl value={resFilter} onChange={setResFilter}
                    options={[{ value: "any", label: "Any resolution" }, { value: "2.0", label: "≤ 2.0 Å" }, { value: "2.5", label: "≤ 2.5 Å" }, { value: "3.0", label: "≤ 3.0 Å" }]} />
                  <SegmentedControl value={mutantFilter} onChange={setMutantFilter}
                    options={[{ value: "all", label: "Include mutants" }, { value: "hide", label: "Hide mutants" }]} />
                </div>
                {(result.summary.ligandOptions?.length > 0 || result.summary.organismOptions?.length > 1) && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start", marginTop: 14 }}>
                    {result.summary.ligandOptions?.length > 0 && (
                      <div style={{ flex: "1 1 360px", minWidth: 280 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>Bound ligands</span>
                          {selectedLigands.length > 1 && (
                            <SegmentedControl value={ligandMatch} onChange={setLigandMatch}
                              options={[{ value: "any", label: "Any selected" }, { value: "all", label: "All selected" }]} />
                          )}
                          {selectedLigands.length > 0 && <Button variant="ghost" size="sm" onClick={() => setSelectedLigands([])}>Clear</Button>}
                        </div>
                        <input type="text" placeholder="Search ligands by code or name" value={ligandSearch}
                          onChange={(e) => setLigandSearch(e.target.value)} style={{ ...selectStyle, width: "100%", maxWidth: "none", marginBottom: 6 }} />
                        <div style={{ maxHeight: 190, overflowY: "auto", border: "1px solid var(--line-0)", borderRadius: "var(--radius-sm)", padding: "4px 6px" }}>
                          {result.summary.ligandOptions
                            .filter((o) => {
                              const q = ligandSearch.trim().toLowerCase();
                              return !q || o.id.toLowerCase().includes(q) || (o.name || "").toLowerCase().includes(q);
                            })
                            .map((o) => (
                              <label key={o.id} style={{ display: "flex", alignItems: "baseline", gap: 7, fontSize: 12, padding: "3px 2px", cursor: "pointer" }}>
                                <input type="checkbox" checked={selectedLigands.includes(o.id)} onChange={() => toggleLigand(o.id)}
                                  style={{ accentColor: "var(--accent)" }} />
                                <span className="mono" style={{ fontWeight: 600 }}>{o.id}</span>
                                <span style={{ color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={o.name || ""}>{o.name || ""}</span>
                                <span style={{ color: "var(--text-1)", whiteSpace: "nowrap" }}>{o.count} of {result.summary.count} ({Math.round((o.count / result.summary.count) * 100)}%)</span>
                              </label>
                            ))}
                        </div>
                      </div>
                    )}
                    {result.summary.organismOptions?.length > 1 && (
                      <div style={{ flex: "0 1 260px", minWidth: 220 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>Source organisms</span>
                          {selectedOrganisms.length > 0 && <Button variant="ghost" size="sm" onClick={() => setSelectedOrganisms([])}>Clear</Button>}
                        </div>
                        <div style={{ maxHeight: 226, overflowY: "auto", border: "1px solid var(--line-0)", borderRadius: "var(--radius-sm)", padding: "4px 6px" }}>
                          {result.summary.organismOptions.map((o) => (
                            <label key={o.key} style={{ display: "flex", alignItems: "baseline", gap: 7, fontSize: 12, padding: "3px 2px", cursor: "pointer" }}>
                              <input type="checkbox" checked={selectedOrganisms.includes(o.key)} onChange={() => toggleOrganism(o.key)}
                                style={{ accentColor: "var(--accent)" }} />
                              <span style={{ flex: 1, fontStyle: "italic" }}>{o.name}</span>
                              <span style={{ color: "var(--text-1)" }}>{o.count}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}

            <div style={{ fontSize: 12, color: "var(--text-1)", marginBottom: 10 }}>
              {visible.length} of {result.summary.count} shown · {result.summary.ligandBound} with ligands · {result.summary.ligandFree} ligand-free · {result.summary.mutants} with mutations
              {result.summary.truncated && ` · first ${result.summary.count} of ${result.summary.totalFound} entries`}
            </div>

            {visible.length === 0 ? (
              result.summary.count ? (
                <div>
                  <EmptyState icon="search" title={`Your filters hide all ${result.summary.count} results`}
                    description="None of the related structures matches every active filter. Reset them, or open Filters to loosen one." />
                  <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
                    <Button variant="primary" size="sm" onClick={resetFilters}>Reset filters</Button>
                  </div>
                </div>
              ) : (
                <EmptyState icon="search" title="No related entries" description="No other experimental entries of this protein are in the PDB." />
              )
            ) : (
              <div ref={resultsRef} style={{ display: "flex", flexDirection: "column", gap: 6, position: "relative" }}>
                {visible.map((h) => {
                  const isChecked = selected.has(h.entryId);
                  return (
                    <Card key={h.entryId} style={{ padding: "12px 14px", borderColor: isChecked ? "var(--accent)" : "var(--line-0)" }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div onClick={() => toggle(h.entryId)} style={{
                          width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: "pointer", marginTop: 2,
                          border: `1.5px solid ${isChecked ? "var(--accent)" : "var(--line-1)"}`,
                          background: isChecked ? "var(--accent)" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {isChecked && <Icon name="check" size={12} stroke="var(--text-on-accent)" strokeWidth={2.6} />}
                        </div>
                        <RcsbThumb key={h.entryId} urls={h.thumbnails} size={64} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{h.entryId}</span>
                            <Badge tone="accent">{h.method || "Unknown"}{h.resolution != null ? ` · ${h.resolution.toFixed(2)} Å` : ""}</Badge>
                            {h.ligandFree
                              ? <Badge tone="neutral">Ligand-free</Badge>
                              : (h.ligands.length > 0 && <Badge tone="violet">{h.ligands.slice(0, 4).join(", ")}{h.ligands.length > 4 ? "…" : ""}</Badge>)}
                            {(h.carbohydrates || []).length > 0 && <Badge tone="violet">Carbohydrate</Badge>}
                            {h.ionsOnly && <Badge tone="neutral">Ions: {h.ions.slice(0, 3).join(", ")}</Badge>}
                            {h.mutations > 0 && <Badge tone="warning">Mutant</Badge>}
                            {h.released && <span style={{ fontSize: 11.5, color: "var(--text-1)" }}>{h.released.slice(0, 4)}</span>}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--text-1)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={h.title || ""}>{h.title}</div>
                          <div style={{ fontSize: 11.5, color: "var(--text-1)", marginTop: 3 }}>
                            {h.coverage != null
                              ? <>UniProt {h.uniprotRange} · covers {pct(h.coverage)} of {result.query.entryId}'s region · construct N {signed(h.nOffset)}, C {signed(h.cOffset)}</>
                              : "Region comparison unavailable (no UniProt mapping)"}
                            {h.copies > 1 ? ` · ${h.copies} copies` : ""}
                          </div>
                          {h.suggestions.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 7 }}>
                              {h.suggestions.map((s, i) => (
                                <div key={i} style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: 12 }}>
                                  <Badge tone="success">{suggestionLabel[s.kind] || s.kind}</Badge><span>{s.reason}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {h.issues.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 7 }}>
                              {h.issues.map((it, i) => (
                                <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 12, color: severityColor[it.severity] || "var(--text-1)" }}>
                                  <Icon name="alertTriangle" size={13} style={{ flexShrink: 0, marginTop: 2 }} /><span>{it.text}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button size="sm" variant="ghost" icon="play" onClick={() => send("single", [h.entryId])}>Analyze</Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            <div style={{ fontSize: 11, color: "var(--text-1)", marginTop: 16, lineHeight: 1.5 }}>
              Source: {result.source}, retrieved {displayDate(result.retrieved, true)}. Related means the same {result.basis === "uniprot" ? `UniProt entry (${result.query.accession})` : "sequence at ≥90% identity"}.
              Same region: at least {pct(minCoverage)} of {result.query.entryId}'s UniProt range. Termini suggested when construct boundaries differ by {result.thresholds.terminusOffsetCorrectable} residues or fewer.
              Sulfate, glycerol and other common crystallization additives do not count as ligands.
            </div>
          </div>
        )}
      </div>

      {showTop && (
        <button type="button" onClick={backToTop} aria-label="Back to top"
          style={{ position: "sticky", bottom: 16, left: "100%", marginRight: 24, width: 38, height: 38, borderRadius: "50%",
                   border: "1px solid var(--line-1)", background: "var(--bg-1)", color: "var(--text-0)", cursor: "pointer",
                   boxShadow: "var(--shadow-md)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="chevronUp" size={16} />
        </button>
      )}
      {chosen.length > 0 && result?.ok && (
        <div style={{ position: "sticky", bottom: 0, background: "var(--bg-1)", borderTop: "1px solid var(--line-0)", padding: "12px 32px", display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: "var(--text-1)", marginRight: 6 }}>{chosen.length} selected</span>
          <Button variant="primary" icon="overlay" onClick={() => send("overlay", [result.query.entryId, ...chosen])}>Overlay with {result.query.entryId}</Button>
          <Button variant="secondary" icon="termini" onClick={() => send("termini", [result.query.entryId, ...chosen])}>Termini ({result.query.entryId} as reference)</Button>
          <Button variant="secondary" icon="batch" onClick={() => send("batch", chosen)}>Batch analyze</Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}
    </PageScroll>
  );
}

function ImportPage({ setPage }) {
  const { setPendingStructureSeed, runAstraCommand, isBusy, isElectron, bridge } = useApp();
  const toast = useToast();
  const [importedFiles, setImportedFiles] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });

  // Mirrors the main process's import record (pymol-bridge.js), which
  // changes when a restarted engine re-imports or drops files. Loaded on
  // mount, then kept up to date from state events.
  useEffect(() => {
    if (!isElectron || !window.astra3Native?.pymolImports) return undefined;
    const show = (list) => {
      setImportedFiles((list || []).map(({ id, name, path }) => ({
        astId: id, name, path, ext: String(path || "").toLowerCase().replace(/\.gz$/, "").split(".").pop(),
      })));
      // Drop selections for IDs that are gone.
      setSelected((s) => new Set([...s].filter((id) => (list || []).some((e) => e.id === id))));
    };
    window.astra3Native.pymolImports().then(show).catch(() => {});
    return bridge.on("state", (state) => { if (state.imports) show(state.imports); });
  }, [isElectron, bridge]);

  // Files are imported one at a time through runAstraCommand, pointed at
  // bridge.runImportCommand (see bridgeCall), so imports get the same lock,
  // live console and prompt handling as runs.
  const handleFiles = async (files) => {
    if (!isElectron) {
      toast.push({ tone: "neutral", title: "Available in the desktop app", message: "Importing local files requires real filesystem access." });
      return;
    }
    if (isBusy) {
      toast.push({ tone: "error", title: "Astra3 is busy", message: "Wait for the current run to finish before importing." });
      return;
    }
    setImporting(true);
    setImportProgress({ done: 0, total: files.length });
    let successCount = 0;
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const entry = files[fileIndex];
      setImportProgress({ done: fileIndex, total: files.length });
      // DropZone already resolved each file's path: entry is {name, size, ext,
      // path, file}, not a browser File.
      const filePath = entry.path;
      if (!filePath) {
        toast.push({ tone: "error", title: "Could not resolve file path", message: entry.name });
        continue;
      }
      try {
        const result = await runAstraCommand("IMPORT", {
          originPage: "import",
          bridgeCall: (_cmd, opts) => bridge.runImportCommand(filePath, opts),
        });
        const registered = result?.registeredIds || [];
        if (registered.length === 0) {
          toast.push({ tone: "error", title: "Import failed", message: `${entry.name}: Astra3 did not register a structure ID. Check the Advanced Console for the exact error.` });
          continue;
        }
        // The list updates from the bridge's import record (effect above).
        successCount += registered.length;
      } catch (e) {
        toast.push({ tone: "error", title: "Import failed", message: `${entry.name}: ${e?.message || "unknown error"}` });
      }
    }
    setImportProgress({ done: files.length, total: files.length });
    setImporting(false);
    if (successCount > 0) {
      toast.push({ tone: "success", title: "Files imported", message: `${successCount} structure(s) registered with real AST-XXXX IDs.` });
    }
  };

  const analyze = (item) => {
    // Pre-fills Single Structure Analysis with the AST ID astra3.py registered,
    // for the person to review and run there.
    setPendingStructureSeed({ kind: "single", items: [{ id: item.astId, format: "pdb" }] });
    setPage("single");
  };

  const toggleSelect = (astId) => setSelected((s) => {
    const next = new Set(s);
    next.has(astId) ? next.delete(astId) : next.add(astId);
    return next;
  });

  const launchComparison = (kind) => {
    const ids = importedFiles.filter((f) => selected.has(f.astId)).map((f) => f.astId);
    setPendingStructureSeed({ kind, items: ids.map((id) => ({ id, format: "pdb" })) });
    setPage(kind);
  };

  const extBadge = { pdb: { tone: "accent", label: "PDB" }, ent: { tone: "accent", label: "PDB" }, cif: { tone: "violet", label: "mmCIF" }, mmcif: { tone: "violet", label: "mmCIF" }, pse: { tone: "warning", label: "Session" } };
  const selectedCount = selected.size;

  return (
    <PageScroll>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 32px 100px" }}>
        <SectionLabel>Import local structure files</SectionLabel>
        <BusyLock active={importing}>
          {/* The extensions IMPORT accepts (validate_input_file). */}
          <DropZone onFiles={handleFiles} accept=".pdb,.ent,.pse,.cif,.mmcif,.gz" />
        </BusyLock>
        {importing && (
          <div style={{ marginTop: 10 }}>
            {/* A multi-file drop registers them one at a time, so a bare
                spinner says nothing about how many are left. */}
            {importProgress.total > 1 ? (
              <ProgressBar
                value={(importProgress.done / importProgress.total) * 100}
                label={`Registering file ${Math.min(importProgress.done + 1, importProgress.total)} of ${importProgress.total}`}
                animated
              />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-1)" }}>
                <Spinner size={13} /> Registering with Astra3…
              </div>
            )}
          </div>
        )}
        <FieldHint>Imported files get a temporary <code className="mono">AST-XXXX</code> identifier so they can be referenced by any command, exactly like a fetched PDB ID.</FieldHint>

        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <SectionLabel style={{ marginBottom: 0 }}>Imported files</SectionLabel>
            {importedFiles.length > 0 && (
              <span style={{ fontSize: 11.5, color: "var(--text-1)" }}>{selectedCount > 0 ? `${selectedCount} selected` : "Select 2+ to compare"}</span>
            )}
          </div>
          {importedFiles.length === 0 ? (
            <EmptyState icon="file" title="Nothing imported yet" description="Drop .pdb, .cif/.mmcif or .pse files (gzip-compressed too) above to get started." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {importedFiles.map((item) => {
                const badge = extBadge[item.ext] || { tone: "neutral", label: item.ext.toUpperCase() };
                const isChecked = selected.has(item.astId);
                return (
                  <Card key={item.astId} style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, borderColor: isChecked ? "var(--accent)" : "var(--line-0)" }}>
                    <div
                      onClick={() => toggleSelect(item.astId)}
                      style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: "pointer",
                        border: `1.5px solid ${isChecked ? "var(--accent)" : "var(--line-1)"}`,
                        background: isChecked ? "var(--accent)" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {isChecked && <Icon name="check" size={12} stroke="var(--text-on-accent)" strokeWidth={2.6} />}
                    </div>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-1)" }}>
                      <Icon name="file" size={15} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>{item.astId}</span>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-1)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                    </div>
                    <Button variant="primary" size="sm" icon="play" onClick={() => analyze(item)}>Use in Single Structure</Button>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedCount >= 2 && (
        <div className="astra-modal-in" style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "var(--bg-2)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-lg)",
          padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "var(--shadow-lg)", zIndex: 100,
        }}>
          <Badge tone="accent">{selectedCount} selected</Badge>
          <span style={{ fontSize: 12.5, color: "var(--text-1)" }}>Compare these imports:</span>
          <Button variant="secondary" size="sm" icon="overlay" onClick={() => launchComparison("overlay")}>Overlay</Button>
          <Button variant="secondary" size="sm" icon="termini" onClick={() => launchComparison("termini")}>Termini</Button>
          <IconButton name="x" title="Clear selection" onClick={() => setSelected(new Set())} />
        </div>
      )}
    </PageScroll>
  );
}

/* ============================================================
   REPORTS PAGE: embedded HTML viewer and rendered images
   ============================================================
   Reads the Astra3_Report.html and Images/*.png a run produced for the
   selected history entry, through readFile, listDir and readFileAsDataUri
   over IPC (the renderer has no filesystem access).
   ============================================================ */

// The structure IDs an entry's label names, as each page builds it. Only used
// to search the disk in resolveRealOutputFolder, never to build a path.
function idsFromHistoryEntry(entry) {
  if (entry.kind === "overlay" && entry.label.includes(" + ")) return entry.label.split(" + ").map((s) => s.trim()).filter(Boolean);
  if (entry.kind === "overlay" || entry.kind === "termini") {
    const [first, restStr] = entry.label.split(" vs ");
    const rest = (restStr || "").split(",").map((s) => s.trim()).filter(Boolean);
    return [first?.trim(), ...rest].filter(Boolean);
  }
  return [entry.label.trim()].filter(Boolean); // "single" (including imported AST-XXXX runs)
}

// A run's output folder: from the report or session path it printed, else the
// run folder naming all of its IDs whose time is closest to the entry's (a
// re-run of the same structures has its own numbered folder).
async function resolveRealOutputFolder(entry, settings) {
  // The report sits directly in the run folder.
  if (entry.reportPath) {
    const dir = dirnameOf(entry.reportPath);
    if (dir) return dir;
  }
  if (entry.sessionPath) {
    const outputDir = dirnameOf(dirnameOf(entry.sessionPath));
    if (outputDir) return outputDir;
  }
  const ids = idsFromHistoryEntry(entry);
  if (ids.length === 0 || !window.astra3Native) return null;
  try {
    const folders = await window.astra3Native.listRunFolders(settings.outputDir);
    const upperIds = ids.map((id) => id.toUpperCase());
    const when = entry.timestamp || Date.now();
    const match = folders
      .filter((f) => upperIds.every((id) => f.name.toUpperCase().includes(id)))
      .sort((a, b) => Math.abs(a.mtimeMs - when) - Math.abs(b.mtimeMs - when))[0];
    return match ? joinPath(settings.outputDir, match.name) : null;
  } catch {
    return null;
  }
}

// The message for an entry whose folder cannot be found. A run from an earlier
// session may have been moved since; one from this session should be in place.
function outputFolderNotFoundMessage(entry, sessionStartTime) {
  if (entry.timestamp && entry.timestamp < sessionStartTime) {
    return "This run is from a previous session and its files are no longer available in this location. They may have been moved, renamed, or deleted since the run finished.";
  }
  return "Could not locate this run's output folder. It may have been moved or deleted since the run finished.";
}

// The structures a run compared against its reference, from its JSON export:
// TERMINI lists comparisons, OVERLAY every structure. Astra3 can choose a
// reference other than the first ID typed, so the export is the source.
function comparedStructureIds(exported, reference) {
  const ids = new Set();
  for (const c of exported?.comparisons || []) if (c?.comparison_structure) ids.add(String(c.comparison_structure));
  for (const s of exported?.structures || []) if (s?.structure_id) ids.add(String(s.structure_id));
  ids.delete(String(reference));
  return [...ids];
}

// Order within a group: the six views as front, back, top, bottom, left,
// right; close-ups N before C, first angle before second.
const VIEW_ORDER = ["front", "back", "top", "bottom", "left", "right"];
function imageRank(name) {
  const base = name.slice(name.lastIndexOf("/") + 1);
  const view = base.match(/^view_([a-z]+)\.png$/i);
  if (view) { const i = VIEW_ORDER.indexOf(view[1].toLowerCase()); return i === -1 ? 50 : i; }
  const close = base.match(/^closeup_(N|C)term_(.+?)_angle(\d+)\.png$/i);
  if (close) return 100 + (close[1].toUpperCase() === "N" ? 0 : 10) + Number(close[3]);
  return 200;
}

// Group headers name every structure the way a PDB ID is shown: an import
// confirmed as a PDB entry by that entry's ID, any other import by its file
// name without the extension. names comes from the run's exported JSON.
// Also before a folder tag: "model.pdb (run1)" reads "model (run1)".
const IMPORT_EXT_RE = /\.(cif|mmcif|pdb|ent|pse)(\.gz)?(?=$| \()/i;
function structureDisplayNames(exported) {
  const names = {};
  for (const s of exported?.structures || []) {
    if (!s?.structure_id) continue;
    const id = String(s.structure_id);
    names[id] = s.confirmed_pdb_entry ? String(s.confirmed_pdb_entry) : id.replace(IMPORT_EXT_RE, "");
  }
  return names;
}
function structureDisplayName(id, names) {
  const key = String(id);
  return (names && names[key]) || key.replace(IMPORT_EXT_RE, "");
}

// Groups a run's images for the Images tab: combined views first, then each
// comparison's folder in report order, close-ups before whole views.
function groupRunImages(files, reference, compared = [], names = {}) {
  const folderRank = new Map();
  const groups = new Map();
  for (const file of files) {
    const slash = file.name.indexOf("/");
    const folder = slash === -1 ? "" : file.name.slice(0, slash);
    const base = slash === -1 ? file.name : file.name.slice(slash + 1);
    const kind = base.startsWith("closeup_") ? "closeup" : "whole";
    if (!folderRank.has(folder)) folderRank.set(folder, folder === "" ? -1 : folderRank.size);
    const key = `${folder}|${kind}`;
    if (!groups.has(key)) groups.set(key, { key, folder, kind, files: [] });
    groups.get(key).files.push(file);
  }
  const subfolders = new Set([...groups.values()].filter((g) => g.folder).map((g) => g.folder));
  // Two structures make one comparison, and a view of "all structures" is
  // then the same picture as that comparison. Older OVERLAY runs wrote both,
  // so the duplicate top-level set is dropped when exactly one comparison
  // folder exists.
  if (subfolders.size === 1 && groups.has("|whole")) groups.delete("|whole");
  // With no comparison folders the top-level images ARE the one comparison
  // (a two-structure run), named for that pair when the run says who it is.
  const soleComparison = subfolders.size === 0 && compared.length === 1 ? compared[0] : null;
  const foldersWithCloseups = new Set([...groups.values()].filter((g) => g.kind === "closeup").map((g) => g.folder));
  return [...groups.values()]
    .sort((x, y) => (folderRank.get(x.folder) - folderRank.get(y.folder))
      || (x.kind === y.kind ? 0 : x.kind === "closeup" ? -1 : 1))
    .map((g) => ({ ...g, files: [...g.files].sort((a, b) => imageRank(a.name) - imageRank(b.name)) }))
    .map((g) => {
      const other = g.folder || soleComparison;
      if (!other) return { ...g, name: "All structures" };
      const otherName = structureDisplayName(other, names);
      const pair = reference ? `${structureDisplayName(reference, names)} vs ${otherName}` : `${otherName} · aligned to reference`;
      if (g.kind === "closeup") return { ...g, name: `${pair} · terminus close-ups` };
      return { ...g, name: foldersWithCloseups.has(g.folder) ? `${pair} · whole structure` : pair };
    });
}

// Position of each image in a report, keyed by its path under Images/
// ("view_front.png", "6F7R/view_front.png"). The first mention wins, so an
// image a report shows twice keeps its earlier place.
function imageOrderFromReport(html) {
  const order = new Map();
  const pattern = /src=['"]Images\/([^'"]+?\.png)['"]/gi;
  let match;
  while ((match = pattern.exec(String(html || ""))) !== null) {
    if (!order.has(match[1])) order.set(match[1], order.size);
  }
  return order;
}

function compareImageRefs(a, b, reportOrder) {
  const ia = reportOrder.has(a) ? reportOrder.get(a) : Infinity;
  const ib = reportOrder.has(b) ? reportOrder.get(b) : Infinity;
  if (ia !== ib) return ia - ib;
  const depthA = a.includes("/") ? 1 : 0;
  const depthB = b.includes("/") ? 1 : 0;
  if (depthA !== depthB) return depthA - depthB;
  return a.localeCompare(b);
}

// Entries recorded before the automatic reference stopped being labelled
// still carry the phrase in their stored meta.
function historyMetaText(meta) {
  return String(meta || "").replace(/\s*·\s*auto reference\b/g, "");
}

// The report frame cannot read files, so the report's own image tags would
// load nothing. Each image frame is removed and its caption kept, so
// headings, colour keys and captions stay; the path and alt text stay as a
// hidden reference from which the frame asks the app for the image.
function stripImageFramesKeepCaptions(html) {
  if (!html) return html;
  return html.replace(/<div class='image-frame'><img([^>]*)><\/div>/g, (_whole, attrs) => {
    const src = /\bsrc='([^']*)'/.exec(attrs);
    const alt = /\balt='([^']*)'/.exec(attrs);
    return src
      ? `<span class='astra3-image-ref' data-src='${src[1]}' data-alt='${alt ? alt[1] : ""}' hidden></span>`
      : "";
  });
}

// Groups completed runs under the batch that produced them, for the Reports
// and 3D Viewer sidebars. Children are matched on the entry IDs the batch
// recorded, so a later solo run of the same structure is not absorbed; a
// batch with no children left is dropped.
function groupCompletedByBatch(history, completed) {
  const batchGroups = history
    .filter((h) => h.kind === "batch" && (
      (Array.isArray(h.batchEntryIds) && h.batchEntryIds.length > 0) ||
      (Array.isArray(h.batchIds) && h.batchIds.length > 0)
    ))
    .map((batch) => {
      // Exact entry IDs, when the batch recorded them.
      if (Array.isArray(batch.batchEntryIds) && batch.batchEntryIds.length > 0) {
        const wanted = new Set(batch.batchEntryIds);
        return { batch, children: completed.filter((c) => wanted.has(c.id)) };
      }
      // Batches recorded before entry IDs: structure ID plus a time window, which
      // can over-match when batches overlap, so each ID contributes at most one
      // child (the closest run before the batch finished).
      const byLabel = new Map();
      for (const c of completed) {
        if (!batch.batchIds.includes(c.label)) continue;
        if (c.timestamp > batch.timestamp || c.timestamp < batch.timestamp - 86400000) continue;
        const existing = byLabel.get(c.label);
        if (!existing || c.timestamp > existing.timestamp) byLabel.set(c.label, c);
      }
      return { batch, children: Array.from(byLabel.values()) };
    })
    .filter((g) => g.children.length > 0);
  const groupedChildIds = new Set(batchGroups.flatMap((g) => g.children.map((c) => c.id)));
  const ungrouped = completed.filter((h) => !groupedChildIds.has(h.id));
  // Batches and single runs in one list, newest first. A batch is placed by
  // when it finished, which is when its last report was written.
  const ordered = [
    ...batchGroups.map((group) => ({ group, timestamp: group.batch.timestamp })),
    ...ungrouped.map((run) => ({ run, timestamp: run.timestamp })),
  ].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return { batchGroups, ungrouped, ordered };
}

// Copy figure, in the in-app report: one button per image group copies its
// images and colour key as a single picture, and nothing else. The images
// are read from the run's Images folder; a report opened in a browser cannot
// read them back, so the button only exists here.
const FIGURE_MAX_CELL_WIDTH = 1200;
// Figures are copied with a transparent background on macOS, where the
// clipboard carries transparency into PowerPoint and Keynote. On Windows,
// Office may read a clipboard image without its transparency and show those
// areas black, so figures there keep a white background.
const FIGURE_TRANSPARENT = typeof navigator !== "undefined"
  && /Mac/i.test(navigator.platform || navigator.userAgent || "");

// Only files inside the run's own Images folder can be read for a figure.
function safeReportImagePath(src) {
  if (typeof src !== "string" || !/\.(png|jpe?g)$/i.test(src) || /[\\:]/.test(src)) return false;
  const parts = src.split("/");
  return parts.length >= 2 && parts[0] === "Images" && parts.every((part) => part && part !== "." && part !== "..");
}

// A panel label for the figure: the report caption, with a bare file name
// (view_back.png, as single-structure reports caption their views) shown as
// the view it names.
function figurePanelLabel(label) {
  if (!/\.(png|jpe?g)$/i.test(label)) return label;
  const name = label.replace(/\.(png|jpe?g)$/i, "").replace(/^view_/i, "").replace(/_/g, " ").trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : label;
}

// One crop rectangle for every panel's shared empty margin, so the panels
// keep the same scale and alignment. Panels of different sizes, or with no
// white or transparent margin, are left uncropped. Found on a small copy of
// each panel; a few pixels out does not matter.
function sharedContentBox(images) {
  const w = images[0].naturalWidth || images[0].width;
  const h = images[0].naturalHeight || images[0].height;
  const full = { x: 0, y: 0, w, h };
  if (images.some((img) => (img.naturalWidth || img.width) !== w || (img.naturalHeight || img.height) !== h)) return full;
  const scale = Math.min(1, 480 / Math.max(w, h));
  const pw = Math.max(1, Math.round(w * scale));
  const ph = Math.max(1, Math.round(h * scale));
  const probe = document.createElement("canvas");
  probe.width = pw;
  probe.height = ph;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  let minX = pw, minY = ph, maxX = -1, maxY = -1;
  images.forEach((img) => {
    ctx.clearRect(0, 0, pw, ph);
    ctx.drawImage(img, 0, 0, pw, ph);
    const data = ctx.getImageData(0, 0, pw, ph).data;
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const i = (y * pw + x) * 4;
        if (data[i + 3] > 16 && (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245)) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  });
  if (maxX < 0) return full;
  const margin = Math.round(Math.max(w, h) * 0.04);
  const x0 = Math.max(0, Math.floor(minX / scale) - margin);
  const y0 = Math.max(0, Math.floor(minY / scale) - margin);
  const x1 = Math.min(w, Math.ceil((maxX + 1) / scale) + margin);
  const y1 = Math.min(h, Math.ceil((maxY + 1) / scale) + margin);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Draws a group's images in a grid, each with its report caption beneath it,
// and the colour key below the grid, on a white background. Every image must
// load: a figure with a panel missing is not copied.
async function composeFigure(group, loadDataUri, options = {}) {
  const images = await Promise.all(group.panels.map(async (panel) => {
    try {
      const uri = await loadDataUri(panel.src);
      if (!uri) return null;
      const img = document.createElement("img");
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = uri;
      });
      if (typeof img.decode === "function") await img.decode().catch(() => {});
      return img;
    } catch {
      return null;
    }
  }));
  const missing = group.panels.filter((_, i) => !images[i]).map((panel) => panel.src.split("/").pop());
  if (missing.length) throw new Error(`Could not read ${missing.join(", ")}`);

  const n = images.length;
  const cols = n <= 2 ? n : n === 4 ? 2 : 3;
  const crop = sharedContentBox(images);
  const cellW = Math.min(FIGURE_MAX_CELL_WIDTH, crop.w);
  const unit = cellW / 40;
  const pad = Math.round(unit * 1.2);
  const gap = Math.round(unit * 0.8);
  const labelSize = Math.max(12, Math.round(unit * 1.4));
  const keySize = Math.max(12, Math.round(unit * 1.5));
  const labelH = Math.round(labelSize * 1.9);
  const fontOf = (weight, size) => `${weight} ${size}px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
  const width = pad * 2 + cols * cellW + (cols - 1) * gap;

  const cellH = Math.round((crop.h * cellW) / crop.w);
  const cells = images.map((img) => ({ img, h: cellH }));
  const rows = [];
  for (let i = 0; i < n; i += cols) rows.push(cells.slice(i, i + cols));
  const rowHeights = rows.map((row) => Math.max(...row.map((c) => c.h)) + labelH);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  // Key layout, wrapped to the figure width.
  const swatch = Math.round(keySize * 0.9);
  const lineH = Math.round(keySize * 1.8);
  const keyLines = [];
  let line = [];
  let lineW = 0;
  group.keyEntries.forEach((entry) => {
    const name = entry.note ? `${entry.name} (${entry.note})` : entry.name;
    ctx.font = fontOf(600, keySize);
    const parts = [{ type: "name", text: name, w: ctx.measureText(name).width + keySize * 0.6 }];
    ctx.font = fontOf(400, keySize);
    entry.swatches.forEach((s) => parts.push({ type: "swatch", color: s.color, text: s.label, w: swatch + keySize * 0.4 + ctx.measureText(s.label).width + keySize * 0.9 }));
    const entryW = parts.reduce((sum, part) => sum + part.w, 0) + keySize * 1.2;
    if (line.length && lineW + entryW > width - pad * 2) { keyLines.push(line); line = []; lineW = 0; }
    line.push(parts);
    lineW += entryW;
  });
  if (line.length) keyLines.push(line);

  canvas.width = width;
  canvas.height = pad * 2 + rowHeights.reduce((a, b) => a + b, 0) + gap * (rows.length - 1)
    + (keyLines.length ? gap + keyLines.length * lineH : 0);
  const transparent = options.transparent === undefined ? FIGURE_TRANSPARENT : options.transparent;
  if (!transparent) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  let y = pad;
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const x = pad + c * (cellW + gap);
      ctx.drawImage(cell.img, crop.x, crop.y, crop.w, crop.h, x, y, cellW, cell.h);
      const label = figurePanelLabel(group.panels[r * cols + c].label);
      if (label) {
        ctx.font = fontOf(400, labelSize);
        ctx.fillStyle = "#555555";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x + cellW / 2, y + cell.h + labelH / 2, cellW);
      }
    });
    y += rowHeights[r] + gap;
  });

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let ky = y - gap + (keyLines.length ? gap : 0) + lineH / 2;
  keyLines.forEach((entries) => {
    let kx = pad;
    entries.forEach((parts) => {
      parts.forEach((part) => {
        if (part.type === "name") {
          ctx.font = fontOf(600, keySize);
          ctx.fillStyle = "#222222";
          ctx.fillText(part.text, kx, ky);
        } else {
          ctx.fillStyle = part.color;
          ctx.fillRect(kx, ky - swatch / 2, swatch, swatch);
          ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
          ctx.lineWidth = 1;
          ctx.strokeRect(kx + 0.5, ky - swatch / 2 + 0.5, swatch - 1, swatch - 1);
          ctx.font = fontOf(400, keySize);
          ctx.fillStyle = "#333333";
          ctx.fillText(part.text, kx + swatch + keySize * 0.4, ky);
        }
        kx += part.w;
      });
      kx += keySize * 1.2;
    });
    ky += lineH;
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The figure could not be encoded"))), "image/png");
  });
}

// The in-app report is shown in a sandboxed frame (report-frame.html) that
// cannot reach the app. The frame asks for what a report needs by message,
// and every request is checked here: a report can read only images in its
// own run's Images folder and open only its own session and output folder.
//
// Images are sent as reduced copies; decoding a whole report of full-quality
// ray traces can exhaust the renderer. Copy figure reads the full-size files.
const REPORT_IMAGE_DISPLAY_WIDTH = 1024;
const REPORT_THEME_KEY = "astra3-report-theme";
const REPORT_COPY_TEXT_LIMIT = 200000;
const REPORT_FIGURE_PANEL_LIMIT = 48;

function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("The figure could not be read"));
    reader.readAsDataURL(blob);
  });
}

// A figure request from the frame as plain, bounded data, or null when it
// names anything but images of the run.
function reportFigureSpec(message) {
  const panels = Array.isArray(message.panels) ? message.panels : [];
  if (!panels.length || panels.length > REPORT_FIGURE_PANEL_LIMIT) return null;
  if (!panels.every((panel) => panel && safeReportImagePath(panel.src))) return null;
  const text = (value) => String(value || "").slice(0, 200);
  const list = (value, limit) => (Array.isArray(value) ? value.slice(0, limit) : []);
  return {
    panels: panels.map((panel) => ({ src: panel.src, label: text(panel.label) })),
    keyEntries: list(message.key, 64).map((entry) => ({
      name: text(entry && entry.name),
      note: text(entry && entry.note),
      swatches: list(entry && entry.swatches, 16).map((swatch) => ({ color: text(swatch && swatch.color), label: text(swatch && swatch.label) })),
    })),
  };
}

// Answers one report frame until the returned function is called.
function serveReportFrame(frame, html, entry, settings, toast, openInViewer) {
  const native = window.astra3Native;
  // The run's folder is looked up once, as the report opens.
  const folder = resolveRealOutputFolder(entry, settings).catch(() => null);
  const inFolder = async (parts) => {
    const dir = await folder;
    return dir ? joinPath(dir, ...parts) : null;
  };
  // Copying and opening follow a click in the report, never a script alone.
  const clicked = () => !navigator.userActivation || navigator.userActivation.isActive;

  // A finished picture is kept for repeat copies; a failed one is not.
  const figures = new Map();
  const figure = (message) => {
    const spec = reportFigureSpec(message);
    if (!spec) return Promise.reject(new Error("This figure cannot be copied"));
    const key = JSON.stringify(spec);
    if (!figures.has(key)) {
      const loadDataUri = async (src) => {
        const file = await inFolder(src.split("/"));
        return file ? native.readFileAsDataUri(file) : null;
      };
      const made = composeFigure(spec, loadDataUri);
      made.catch(() => figures.delete(key));
      figures.set(key, made);
    }
    return figures.get(key);
  };

  const requests = {
    ready: () => {
      let theme = null;
      try {
        theme = localStorage.getItem(REPORT_THEME_KEY);
      } catch {
        theme = null;
      }
      frame.contentWindow.postMessage({ astra3Report: true, type: "show", html, theme }, "*");
    },
    theme: ({ dark }) => {
      try {
        localStorage.setItem(REPORT_THEME_KEY, dark ? "dark" : "light");
      } catch {
        // Storage is unavailable; the theme lasts until the report closes.
      }
    },
    image: async ({ src }) => {
      if (!safeReportImagePath(src)) return null;
      const file = await inFolder(src.split("/"));
      return file ? native.readImageThumbnail(file, REPORT_IMAGE_DISPLAY_WIDTH) : null;
    },
    prepareFigure: (message) => {
      figure(message).catch(() => {});
    },
    copyFigure: async (message) => {
      if (!clicked()) return { ok: false };
      try {
        const uri = await blobToDataUri(await figure(message));
        if (!(await native.copyImage(uri))) throw new Error("The clipboard did not accept the picture");
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err && err.message) || "" };
      }
    },
    copyText: async ({ text }) => {
      if (!clicked() || typeof text !== "string" || text.length > REPORT_COPY_TEXT_LIMIT) return false;
      return !!(await native.copyText(text));
    },
    openFolder: async () => {
      if (!clicked()) return;
      const dir = await folder;
      if (!dir) {
        toast.push({ tone: "error", title: "Could not open", message: "This run's output folder could not be located on disk. It may have been moved or deleted." });
        return;
      }
      const err = await native.openPath(dir);
      if (err) toast.push({ tone: "error", title: "Could not open output folder", message: err });
    },
    openSession: async ({ href }) => {
      if (!clicked() || typeof href !== "string" || !/\.(pse|cxs)$/i.test(href)) return;
      if (entry.engine === "astra3" && openInViewer) { openInViewer(entry); return; }
      // Relative to the run's output folder, and never outside it.
      const parts = href.replace(/^\.?[/\\]/, "").split(/[/\\]/).filter(Boolean);
      if (!parts.length || parts.some((part) => part === ".." || part === "." || part.includes(":"))) return;
      const file = await inFolder(parts);
      if (!file) {
        toast.push({ tone: "error", title: "Could not open", message: "This run's output folder could not be located on disk. It may have been moved or deleted." });
        return;
      }
      const err = await native.openInPymol(file);
      if (err) toast.push({ tone: "error", title: "Could not open session", message: err });
    },
    shown: () => {
      frame.dataset.report = "shown";
    },
  };

  const onMessage = async (event) => {
    if (!frame.contentWindow || event.source !== frame.contentWindow) return;
    const message = event.data;
    if (!message || message.astra3Report !== true || !Object.hasOwn(requests, message.type)) return;
    let result = null;
    try {
      result = await requests[message.type](message);
    } catch {
      result = null;
    }
    if (typeof message.id === "number" && frame.contentWindow) {
      frame.contentWindow.postMessage({ astra3Report: true, id: message.id, result: result === undefined ? null : result }, "*");
    }
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

function ReportsPage({ setPage }) {
  const { history, settings, isElectron, sessionStartTime, setSelectedViewerId } = useApp();
  const toast = useToast();
  // A batch entry has no single report or session; its structures have their
  // own entries.
  const completed = history.filter((h) => h.status === "complete" && h.kind !== "batch");
  const [expandedBatches, setExpandedBatches] = useState({});
  // Pairs each batch entry with its runs, matched on the batchIds it recorded
  // rather than the "via Batch" meta text, with a time window so a later
  // re-run is not pulled in. A batch with no children left is dropped.
  const { batchGroups, ordered } = groupCompletedByBatch(history, completed);
  const [selected, setSelected] = useState(completed[0] || null);
  // Honour a specific entry requested from elsewhere (clicking a row on the
  // History page or the dashboard).
  const { selectedReportId, setSelectedReportId } = useApp();
  useEffect(() => {
    if (!selectedReportId) return;
    const wanted = history.find((h) => h.id === selectedReportId);
    if (wanted) {
      // Opens the batch's first completed structure.
      if (wanted.kind === "batch") {
        setExpandedBatches((e) => ({ ...e, [wanted.id]: true }));
        const group = batchGroups.find((g) => g.batch.id === wanted.id);
        if (group && group.children.length > 0) setSelected(group.children[0]);
      } else {
        setSelected(wanted);
      }
    }
    // Cleared once consumed so returning to Reports later doesn't keep
    // yanking the selection back to an old request.
    setSelectedReportId(null);
  }, [selectedReportId]);
  const [tab, setTab] = useState("report");
  const [reportHtml, setReportHtml] = useState(null);
  const reportFrame = useRef(null);
  const [reportLoadError, setReportLoadError] = useState(null);
  const [imageFiles, setImageFiles] = useState([]); // [{ name, dataUri }]
  // The same grouping the HTML report uses. A name like "6F7R/view_front.png"
  // came from that comparison's own subfolder; a bare name is the combined
  // view. Groups follow the file list, which follows the report.
  const [imageReference, setImageReference] = useState(null);
  const [imageCompared, setImageCompared] = useState([]);
  const [imageNames, setImageNames] = useState({});
  const imageGroups = useMemo(() => groupRunImages(imageFiles, imageReference, imageCompared, imageNames), [imageFiles, imageReference, imageCompared, imageNames]);
  const [imagesLoading, setImagesLoading] = useState(false);

  // The .pse path Astra3 printed during the run. Older entries, or runs whose
  // session failed to save, fall back to resolveRealOutputFolder.
  const openReportExternally = async (entry) => {
    if (!isElectron) { toast.push({ tone: "neutral", title: "Opening in browser", message: "Astra3_Report.html" }); return; }
    const folder = await resolveRealOutputFolder(entry, settings);
    if (!folder) { toast.push({ tone: "error", title: "Could not open report", message: outputFolderNotFoundMessage(entry, sessionStartTime) }); return; }
    const err = await window.astra3Native.openPath(entry.reportPath || joinPath(folder, "Astra3_Report.html"));
    if (err) toast.push({ tone: "error", title: "Could not open report", message: err });
  };
  const openOutputFolder = async (entry) => {
    if (!isElectron) { toast.push({ tone: "neutral", title: "Opening output folder", message: entry.label }); return; }
    const folder = await resolveRealOutputFolder(entry, settings);
    if (!folder) { toast.push({ tone: "error", title: "Could not open output folder", message: outputFolderNotFoundMessage(entry, sessionStartTime) }); return; }
    await window.astra3Native.openPath(folder);
  };
  const openInViewer = (entry) => { setSelectedViewerId(entry.id); setPage("viewer"); };
  const openSession = async (entry) => {
    if (entry.engine === "astra3") { openInViewer(entry); return; }
    if (!isElectron) { toast.push({ tone: "neutral", title: "Opening session", message: entry.label }); return; }
    if (entry.sessionPath) {
      const err = await window.astra3Native.openInPymol(entry.sessionPath);
      if (err) toast.push({ tone: "error", title: "Could not open session", message: err });
      return;
    }
    const folder = await resolveRealOutputFolder(entry, settings);
    if (!folder) { toast.push({ tone: "error", title: "Could not open session", message: "Could not locate this run's output folder." }); return; }
    // Object names vary by run, so the Session folder is listed rather than a
    // name guessed.
    const files = await window.astra3Native.listDir(joinPath(folder, "Session"));
    const pseFile = files.find((f) => /\.(pse|cxs)$/i.test(f));
    if (!pseFile) { toast.push({ tone: "error", title: "Could not open session", message: "No session file found in this run's Session folder." }); return; }
    const err = await window.astra3Native.openInPymol(joinPath(folder, "Session", pseFile));
    if (err) toast.push({ tone: "error", title: "Could not open session", message: err });
  };
  // Image selection for the Images tab. Off by default so a single click
  // still just opens the image; turning it on changes what a click means,
  // which is why it is explicit.
  const [imageSelectMode, setImageSelectMode] = useState(false);
  const [selectedImages, setSelectedImages] = useState(() => new Set());
  const toggleImageSelected = useCallback((name) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);
  // Images are at <output folder>/Images/<filename>.png.
  const openImageExternally = async (entry, filename) => {
    // filename is a bare name, or "<comparison>/name.png" for TERMINI.
    if (!isElectron) { toast.push({ tone: "neutral", title: "Opening image", message: filename }); return; }
    const folder = await resolveRealOutputFolder(entry, settings);
    if (!folder) { toast.push({ tone: "error", title: "Could not open image", message: "Could not locate this run's output folder." }); return; }
    const err = await window.astra3Native.openPath(joinPath(folder, "Images", filename));
    if (err) toast.push({ tone: "error", title: "Could not open image", message: err });
  };

  // Opens every selected image as one browsable set (see fs:openImageSet in
  // main.js for what "one set" means on each platform).
  const openSelectedImages = async () => {
    if (!isElectron) { toast.push({ tone: "neutral", title: "Available in the desktop app", message: "Opening images externally needs the desktop app." }); return; }
    const folder = await resolveRealOutputFolder(selected, settings);
    if (!folder) { toast.push({ tone: "error", title: "Could not open images", message: "Could not locate this run's output folder." }); return; }
    const paths = [...selectedImages].map((name) => joinPath(folder, "Images", name));
    const result = await window.astra3Native.openImageSet(paths);
    if (!result || (!result.ok && result.opened === 0)) {
      toast.push({ tone: "error", title: "Could not open images", message: (result?.failures || []).slice(0, 3).join("\n") || "Something went wrong." });
      return;
    }
    if (result.failures && result.failures.length > 0) {
      toast.push({ tone: "warning", title: `Opened ${result.opened} image(s)`, message: result.failures.slice(0, 3).join("\n") });
    } else if (result.mode === "windows-individual" && result.opened > 1) {
      // Windows has no equivalent of Preview's single browsable window, so each
      // image opens in its own; the toast says so when several open.
      toast.push({ tone: "neutral", title: `Opened ${result.opened} images`, message: "Windows opens each image in its own viewer window." });
    }
  };

  useEffect(() => {
    if (!selected || !isElectron) { setReportHtml(null); setReportLoadError(null); return; }
    let cancelled = false;
    setReportHtml(null);
    setReportLoadError(null);
    // The outer catch makes sure the tab always ends with content or a message.
    resolveRealOutputFolder(selected, settings).then((folder) => {
      if (cancelled) return;
      if (!folder) { setReportLoadError("Could not locate this run's output folder. It may have been moved or deleted."); return; }
      return window.astra3Native.readFile(selected.reportPath || joinPath(folder, "Astra3_Report.html"))
        .then((html) => { if (!cancelled) setReportHtml(stripImageFramesKeepCaptions(html)); })
        .catch((e) => { if (!cancelled) setReportLoadError(e?.message || "Could not read the report file."); });
    }).catch((e) => {
      if (!cancelled) setReportLoadError(e?.message || "Something went wrong while locating this run's report.");
    });
    return () => { cancelled = true; };
  }, [selected, isElectron]);

  // The frame exists only while the Report tab shows a loaded report.
  useEffect(() => {
    if (reportHtml === null || !selected || !reportFrame.current) return undefined;
    return serveReportFrame(reportFrame.current, reportHtml, selected, settings, toast, openInViewer);
  }, [reportHtml, tab]);

  // TERMINI writes Images/<comparison>/*.png, one folder per comparison; other
  // runs write Images/*.png. Both are listed.
  useEffect(() => {
    if (!selected || !isElectron || tab !== "images") return;
    let cancelled = false;
    setImagesLoading(true);
    setImageFiles([]);
    setImageReference(null);
    resolveRealOutputFolder(selected, settings).then(async (folder) => {
      if (cancelled) return;
      if (!folder) { setImagesLoading(false); return; }
      const imagesDir = joinPath(folder, "Images");
      try {
        const topEntries = await window.astra3Native.listDir(imagesDir);
        const topPngs = topEntries.filter((n) => n.toLowerCase().endsWith(".png"));
        // Both levels: the combined view at the top, and each comparison's
        // images in its own subfolder.
        const subdirs = await window.astra3Native.listSubdirs(imagesDir);
        const nested = await Promise.all(subdirs.map(async (sub) => {
          const subDir = `${imagesDir}/${sub}`;
          const files = await window.astra3Native.listDir(subDir);
          return files.filter((n) => n.toLowerCase().endsWith(".png"))
            .map((name) => ({ name: `${sub}/${name}`, path: `${subDir}/${name}` }));
        }));
        const pngRefs = [
          ...topPngs.map((name) => ({ name, path: `${imagesDir}/${name}` })),
          ...nested.flat(),
        ];
        // Same order as the report: the report lists comparisons best match
        // first, so its image references are read for the order rather than
        // re-deriving the ranking here. Anything the report does not mention
        // follows, top level first, then by name.
        let reportOrder = new Map();
        try {
          const html = await window.astra3Native.readFile(joinPath(folder, "Astra3_Report.html"));
          reportOrder = imageOrderFromReport(html);
        } catch {
          // No report (a -skipreport run): name order is used instead.
        }
        let reference = null;
        let compared = [];
        let names = {};
        for (const name of ["Astra3_Report.json", "Termini_Analysis.json"]) {
          try {
            const exported = JSON.parse(await window.astra3Native.readFile(joinPath(joinPath(folder, "Session"), name)));
            if (exported && exported.reference_structure) {
              reference = String(exported.reference_structure);
              compared = comparedStructureIds(exported, reference);
              names = structureDisplayNames(exported);
              break;
            }
          } catch {
            // Not written for this run type; the groups say "aligned to reference".
          }
        }
        if (!cancelled) { setImageReference(reference); setImageCompared(compared); setImageNames(names); }
        pngRefs.sort((a, b) => compareImageRefs(a.name, b.name, reportOrder));
        // Thumbnails for the grid; Open and Output Folder reach the originals. Six
        // full-quality 3000x2250 ray traces decoded at once can exhaust the renderer.
        const withData = await Promise.all(pngRefs.map(async (ref) => ({
          name: ref.name, dataUri: await window.astra3Native.readImageThumbnail(ref.path, 640),
        })));
        if (!cancelled) { setImageFiles(withData.filter((f) => f.dataUri)); setImagesLoading(false); }
      } catch {
        if (!cancelled) setImagesLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [selected, isElectron, tab]);

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ width: 250, borderRight: "1px solid var(--line-0)", overflowY: "auto", padding: 14, flexShrink: 0 }}>
        <SectionLabel>Completed analyses</SectionLabel>
        {completed.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-1)" }}>No completed analyses yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {/* Batches are listed as expandable groups. A batch has no
                report of its own (it is several separate runs), so it
                can't be "selected" the way a single run can. Expanding it
                reveals the structures it produced, each of which does have
                a report.
              */}
            {ordered.map(({ group, run }) => (group ? (
              <div key={group.batch.id}>
                <button onClick={() => setExpandedBatches((e) => ({ ...e, [group.batch.id]: !e[group.batch.id] }))} style={{
                  textAlign: "left", padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer",
                  background: "transparent", color: "var(--text-0)", width: "100%",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{
                    display: "inline-flex", transition: "transform 160ms ease",
                    transform: expandedBatches[group.batch.id] ? "rotate(90deg)" : "rotate(0deg)",
                  }}>
                    <Icon name="chevronRight" size={12} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, display: "block" }}>{group.batch.label}</span>
                    <span style={{ fontSize: 10.5, color: "var(--text-1)" }}>
                      {group.children.length} report{group.children.length === 1 ? "" : "s"} · {timeAgo(group.batch.timestamp)}
                    </span>
                  </span>
                </button>
                {expandedBatches[group.batch.id] && group.children.map((h) => (
                  <button key={h.id} onClick={() => setSelected(h)} style={{
                    textAlign: "left", padding: "6px 10px 6px 28px", borderRadius: "var(--radius-sm)", border: "none",
                    cursor: "pointer", width: "100%",
                    background: selected?.id === h.id ? "var(--accent-wash)" : "transparent",
                    color: selected?.id === h.id ? "var(--accent-bright)" : "var(--text-0)",
                  }}>
                    <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{h.label}</div>
                  </button>
                ))}
              </div>
            ) : ((h) => (
              <button key={h.id} onClick={() => setSelected(h)} style={{
                textAlign: "left", padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer",
                background: selected?.id === h.id ? "var(--accent-wash)" : "transparent",
                color: selected?.id === h.id ? "var(--accent-bright)" : "var(--text-0)",
              }}>
                <div className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>{h.label}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-1)" }}>{timeAgo(h.timestamp)}</div>
              </button>
            ))(run)))}
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {!selected ? (
          <EmptyState icon="reports" title="Select an analysis" description="Choose a completed analysis on the left to view its report." />
        ) : (
          <>
            {/* Wraps in a narrow window, where the buttons ran off its edge. */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line-0)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className="mono" style={{ fontSize: 14, fontWeight: 700 }}>{selected.label}</span>
                <SegmentedControl value={tab} onChange={setTab} options={[{ value: "report", label: "Report", icon: "reports" }, { value: "images", label: "Images", icon: "image" }]} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="gold" size="sm" icon="externalLink" onClick={() => openReportExternally(selected)}>Open externally</Button>
                <Button variant="secondary" size="sm" icon="folder" onClick={() => openOutputFolder(selected)}>Output folder</Button>
                <Button variant="secondary" size="sm" icon="cube" onClick={() => openSession(selected)}>Open session</Button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: "hidden", padding: tab === "report" ? 16 : 20 }}>
              {tab === "report" ? (
                <div style={{ width: "100%", height: "100%", borderRadius: "var(--radius-lg)", overflow: "hidden", border: "1px solid var(--line-0)", boxShadow: "var(--shadow-md)", position: "relative" }}>
                  {!isElectron ? (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <EmptyState icon="reports" title="Available in the desktop app" description="Report preview reads the real HTML file from disk." />
                    </div>
                  ) : reportLoadError ? (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                      <EmptyState icon="alertTriangle" title="Could not load report" description={reportLoadError} />
                    </div>
                  ) : reportHtml === null ? (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--text-1)", fontSize: 13 }}>
                      <Spinner size={16} /> Loading report…
                    </div>
                  ) : (
                    <iframe
                      ref={reportFrame}
                      title="report"
                      sandbox="allow-scripts allow-popups"
                      src="report-frame.html"
                      style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                    />
                  )}
                </div>
              ) : (
                !isElectron ? (
                  <EmptyState icon="image" title="Available in the desktop app" description="Rendered images read real .png files from disk." />
                ) : imagesLoading ? (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--text-1)", fontSize: 13 }}>
                    <Spinner size={16} /> Loading images…
                  </div>
                ) : imageFiles.length === 0 ? (
                  <EmptyState icon="image" title="No rendered images found" description="This run may have used -skipimage, or its output folder could not be located on disk (it may have been moved, renamed, or deleted since the run finished)." />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <Button
                        variant={imageSelectMode ? "primary" : "secondary"}
                        icon="check"
                        onClick={() => { setImageSelectMode(!imageSelectMode); setSelectedImages(new Set()); }}
                      >
                        {imageSelectMode ? "Done" : "Select"}
                      </Button>
                      {imageSelectMode && (
                        <>
                          <Button
                            variant="secondary"
                            onClick={() => setSelectedImages((prev) =>
                              prev.size === imageFiles.length ? new Set() : new Set(imageFiles.map((f) => f.name)))}
                          >
                            {selectedImages.size === imageFiles.length && imageFiles.length > 0 ? "Select none" : "Select all"}
                          </Button>
                          <Button
                            variant="primary"
                            icon="externalLink"
                            disabled={selectedImages.size === 0}
                            onClick={openSelectedImages}
                          >
                            {`Open ${selectedImages.size || ""} externally`.replace("  ", " ")}
                          </Button>
                          <span style={{ fontSize: 11.5, color: "var(--text-2)" }}>
                            {selectedImages.size} of {imageFiles.length} selected
                          </span>
                        </>
                      )}
                    </div>
                    {/* alignItems:start stops the grid stretching each card to
                        the tallest row height. A stretched card sizes its
                        aspect-ratio image box from the row rather than its own
                        width, which pushed the filename caption past the card's
                        overflow:hidden edge and clipped the bottom of every
                        thumbnail. */}
                    {/* Grouped by the subfolder each image came from, with the
                        same quiet divider the HTML report uses: a run comparing
                        three structures writes one folder per comparison, and an
                        ungrouped grid gave no indication which pair a thumbnail
                        belonged to. Files at the top level (the combined view)
                        come first under "All structures". A run with only one
                        group renders no headings at all, so two-structure runs
                        look exactly as they did. */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, overflowY: "auto", flex: 1, minHeight: 0, alignItems: "start", alignContent: "start", gridAutoRows: "min-content" }}>
                      {imageGroups.map((group) => (
                        <React.Fragment key={group.name}>
                          {(imageGroups.length > 1 || group.name !== "All structures") && (
                            <div style={{
                              gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10,
                              margin: "10px 0 0", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em",
                              textTransform: "uppercase", color: "var(--text-2)",
                            }}>
                              <span>{group.name}</span>
                              <span style={{ flex: 1, height: 1, background: "var(--line-0)" }} />
                            </div>
                          )}
                          {group.files.map((f) => {
                        const picked = selectedImages.has(f.name);
                        return (
                          <div
                            key={f.name}
                            style={{
                              borderRadius: "var(--radius-md)", overflow: "hidden", position: "relative",
                              display: "flex", flexDirection: "column", height: "fit-content", minWidth: 0,
                              border: `1px solid ${picked ? "var(--accent, #4a9eff)" : "var(--line-0)"}`,
                              cursor: imageSelectMode ? "pointer" : "default",
                            }}
                            onClick={imageSelectMode ? () => toggleImageSelected(f.name) : undefined}
                          >
                            {imageSelectMode && (
                              <div
                                role="checkbox"
                                aria-checked={picked}
                                aria-label={`Select ${f.name}`}
                                style={{
                                  position: "absolute", top: 8, left: 8, zIndex: 2,
                                  width: 20, height: 20, borderRadius: 6,
                                  border: `1.5px solid ${picked ? "var(--accent, #4a9eff)" : "var(--text-2)"}`,
                                  background: picked ? "var(--accent, #4a9eff)" : "rgba(0,0,0,0.45)",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}
                                onClick={(e) => { e.stopPropagation(); toggleImageSelected(f.name); }}
                              >
                                {picked && <Icon name="check" size={13} />}
                              </div>
                            )}
                            <div style={{ aspectRatio: "4/3", flex: "0 0 auto", background: "var(--console-bg)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                              <img src={f.dataUri} alt={f.name} style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain", display: "block" }} />
                            </div>
                            <div style={{ padding: "8px 10px", flex: "0 0 auto", fontSize: 11.5, color: "var(--text-1)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, minWidth: 0 }}>
                              <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.name}>{f.name}</span>
                              <IconButton
                                name="externalLink"
                                size={12}
                                onClick={(e) => { if (e) e.stopPropagation(); openImageExternally(selected, f.name); }}
                                title="Open externally"
                              />
                            </div>
                          </div>
                        );
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   3D VIEWER PAGE
   ============================================================
   Molecular viewer built on 3Dmol.js (BSD-3-Clause; Rego & Koes,
   Bioinformatics 2015). Loads the plain-coordinate .pdb Astra3 writes beside
   the .pse for every run (save_session() in astra3_render_report.py): .pse is
   PyMOL's binary format with no JavaScript parser, and the downloaded source
   file is deleted after processing.

   This is a separate renderer drawing the same atoms PyMOL analysed, so
   representations, colours and camera are similar but not pixel-identical to
   a PyMOL render. The ray-traced .png images remain the figures for
   publication; this view is for interactive inspection, and "Open session"
   opens the .pse in PyMOL.
   ============================================================ */

// Separate palettes for chains, ligands and ions, so the three read apart.
const VIEWER_CHAIN_COLORS = ["#AB7ADF", "#6E8EE8", "#F0C361", "#7FBF8A", "#E8614F", "#5FD1C4", "#E888C9", "#8A9BA8"];
const VIEWER_LIGAND_COLORS = ["#F0C361", "#E8614F", "#6E8EE8", "#7FBF8A", "#AB7ADF", "#5FD1C4"];
const CHAIN_COLOR_GROUPS = [
  { label: "Structural", colors: ["#AB7ADF", "#6E8EE8", "#3D9B8F", "#5FD1C4", "#3E5FC4"] },
  { label: "Accent", colors: ["#F0C361", "#E8614F", "#E888C9", "#7FBF8A"] },
  { label: "Neutral", colors: ["#8A9BA8", "#C9C4D8", "#5B5470"] },
];

// 3Dmol.js style keys for each representation choice in the sidebar. Kept as
// a lookup table rather than a big if/else chain in the render effect below.
const REP_STYLE_KEY = { cartoon: "cartoon", surface: "cartoon", sticks: "stick", spheres: "sphere", lines: "line" };

// One shape for an atom, shared by the hover readout and click selection so
// they always describe the same atom.
function atomDescriptor(atom) {
  return {
    chain: atom.chain,
    resi: atom.resi,
    resn: atom.resn,
    atomName: atom.atom,
    elem: atom.elem,
    hetflag: !!atom.hetflag,
    // The residue as a whole: what a person means by clicking part of a side
    // chain.
    key: `${atom.chain}|${atom.resi}|${atom.resn}`,
    serial: atom.serial,
  };
}

const DEFAULT_SELECTION_REP = "keep";

const RESIDUE_REPS = [
  { id: "keep", label: "Keep current" },
  { id: "licorice", label: "Licorice" },
  { id: "stick", label: "Stick" },
  { id: "sphere", label: "Sphere" },
  { id: "ball-and-stick", label: "Ball & stick" },
  { id: "cartoon", label: "Cartoon" },
  { id: "ribbon", label: "Ribbon" },
  { id: "line", label: "Line" },
];

// A 3Dmol colour (0xRRGGBB number, "#RRGGBB", a colour name, or a Color
// object with 0-1 channels) as 0-255 RGB, or null when it cannot be read.
function colorToRgb(c) {
  if (typeof c === "number") return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  if (c && typeof c === "object" && typeof c.r === "number") return [c.r * 255, c.g * 255, c.b * 255];
  if (typeof c === "string") {
    const hex = /^(?:#|0x)?([0-9a-f]{6})$/i.exec(c.trim());
    if (hex) { const n = parseInt(hex[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    try {
      const cc = window.$3Dmol?.CC?.color(c);
      if (cc && typeof cc.r === "number") return [cc.r * 255, cc.g * 255, cc.b * 255];
    } catch { /* unknown colour name */ }
  }
  return null;
}

// Bright selection colours in the spirit of printing inks: yellow, cyan and
// magenta each stand out against dark and mid-tone backgrounds and against
// the greys and pastels chains are usually drawn in.
const SELECTION_HIGHLIGHTS = ["#FFE600", "#00E5FF", "#FF2BD6"];

// Weighted RGB distance ("redmean"), a cheap approximation of how different
// two colours look.
function colorDistance(a, b) {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

// The highlight that stands out most from BOTH the residue's own colour and
// the viewer background, so a selection never disappears into its chain or
// into the background behind it.
function contrastSelectionColor(baseColor, backgroundColor = "#0f0a16") {
  const base = colorToRgb(baseColor);
  const bg = colorToRgb(backgroundColor) || [15, 10, 22];
  let best = SELECTION_HIGHLIGHTS[0];
  let bestScore = -1;
  for (const hex of SELECTION_HIGHLIGHTS) {
    const rgb = colorToRgb(hex);
    const score = Math.min(base ? colorDistance(rgb, base) : Infinity, colorDistance(rgb, bg));
    if (score > bestScore) { bestScore = score; best = hex; }
  }
  return best;
}

// The atoms a selected or painted residue covers: its exact atoms in one
// structure when known, else chain + residue number (older viewer files).
function residueSelector(item) {
  return item.serials && item.serials.length ? { serial: item.serials } : { chain: item.chain, resi: item.resi };
}

// Recolours a residue atom by atom, keeping each atom's representation.
// color null means black or white, whichever contrasts with the atom's
// current colour.
function recolorInPlace(glviewer, selector, color, backgroundColor) {
  const groups = new Map();
  for (const atom of glviewer.selectedAtoms(selector)) {
    const style = atom.style || {};
    const keys = Object.keys(style).filter((k) => style[k] && typeof style[k] === "object").sort();
    if (!keys.length) continue; // hidden: nothing drawn to recolour
    const target = color || contrastSelectionColor(style[keys[0]].color, backgroundColor);
    const sig = `${keys.join(",")}|${target}`;
    if (!groups.has(sig)) groups.set(sig, { keys, target, serials: [] });
    groups.get(sig).serials.push(atom.serial);
  }
  for (const { keys, target, serials } of groups.values()) {
    const spec = {};
    for (const k of keys) spec[k] = { color: target, colorscheme: undefined, colorfunc: undefined };
    glviewer.addStyle({ serial: serials }, spec);
  }
}

// A highlight: keeps the residue's representation ("keep"), or adds the chosen
// one on top, in the chosen colour or the automatic contrasting one.
function applyResidueHighlight(glviewer, item, color, rep, backgroundColor) {
  const selector = residueSelector(item);
  if (rep && rep !== "keep") {
    const first = glviewer.selectedAtoms(selector).find((a) => a.style && Object.keys(a.style).length);
    const base = first ? first.style[Object.keys(first.style)[0]]?.color : null;
    const fixed = color || contrastSelectionColor(base, backgroundColor);
    recolorInPlace(glviewer, selector, fixed);
    glviewer.addStyle(selector, residueStyleFor(rep, fixed));
  } else {
    recolorInPlace(glviewer, selector, color, backgroundColor);
  }
}

function residueStyleFor(rep, color) {
  switch (rep) {
    case "sphere":
      return { sphere: { color } };
    case "ball-and-stick":
      return { stick: { color, radius: 0.18 }, sphere: { color, scale: 0.28 } };
    case "cartoon":
      return { cartoon: { color } };
    case "ribbon":
      // 3Dmol has no "ribbon" cartoon style and would fall back to the default;
      // "trace" is the thin backbone tube PyMOL calls ribbon.
      return { cartoon: { color, style: "trace" } };
    case "line":
      return { line: { color } };
    case "stick":
      return { stick: { color, radius: 0.2 } };
    case "licorice":
    default:
      // "Licorice" is the thicker all-atom stick rendering the term means in
      // PyMOL/VMD; 3Dmol has no separate primitive for it.
      return { stick: { color, radius: 0.3 } };
  }
}

// At most this many residues get an outline at once; beyond that the boxes
// stop helping and only cost frames.
const SELECTION_OUTLINE_LIMIT = 40;
const SVG_NS = "http://www.w3.org/2000/svg";

// Screen-space bounding box of a residue's atoms, relative to the viewer's
// mount node, with a little padding so the outline clears the atoms.
function selectionScreenBox(glviewer, atoms, origin, pad = 7) {
  const points = glviewer.modelToScreen(atoms.map((a) => ({ x: a.x, y: a.y, z: a.z })));
  const ox = origin.left + window.pageXOffset;
  const oy = origin.top + window.pageYOffset;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    x0 = Math.min(x0, p.x - ox); y0 = Math.min(y0, p.y - oy);
    x1 = Math.max(x1, p.x - ox); y1 = Math.max(y1, p.y - oy);
  }
  if (!Number.isFinite(x0)) return null;
  return { x: x0 - pad, y: y0 - pad, width: x1 - x0 + 2 * pad, height: y1 - y0 + 2 * pad };
}

// The outline layer: per residue, a black dashed rectangle with white dashes
// filling its gaps, both marching around the box.
function createSelectionOutlineLayer(count) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  Object.assign(svg.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%",
    pointerEvents: "none", overflow: "visible", zIndex: "2", opacity: "0.8" });
  const boxes = [];
  for (let i = 0; i < count; i++) {
    const pair = ["#000000", "#FFFFFF"].map((stroke, j) => {
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("fill", "none");
      rect.setAttribute("stroke", stroke);
      rect.setAttribute("stroke-width", "1.25");
      rect.setAttribute("stroke-dasharray", "4 4");
      rect.setAttribute("rx", "3");
      const march = document.createElementNS(SVG_NS, "animate");
      march.setAttribute("attributeName", "stroke-dashoffset");
      march.setAttribute("from", String(j * 4));
      march.setAttribute("to", String(j * 4 - 16));
      march.setAttribute("dur", "1.2s");
      march.setAttribute("repeatCount", "indefinite");
      rect.appendChild(march);
      rect.style.display = "none";
      svg.appendChild(rect);
      return rect;
    });
    boxes.push(pair);
  }
  return {
    svg,
    place(i, box) {
      for (const rect of boxes[i] || []) {
        if (!box) { rect.style.display = "none"; continue; }
        rect.style.display = "";
        rect.setAttribute("x", box.x.toFixed(1));
        rect.setAttribute("y", box.y.toFixed(1));
        rect.setAttribute("width", Math.max(box.width, 1).toFixed(1));
        rect.setAttribute("height", Math.max(box.height, 1).toFixed(1));
      }
    },
  };
}

function useMolViewer(mountNode, { pdbText, chains, hetGroups, repMode, visibility, chainColors, ligandColors, itemReps, autoSpin, colorTarget, backgroundColor, onHoverAtom, onPickAtom, onPickBackground, selections, selectionColor, selectionRep, paintedResidues, hiddenResidues }) {
  const viewerRef = useRef(null);
  const surfaceHandleRef = useRef(null);
  // Bumped on every run of the render effect, so a surface that finishes
  // building after its run was superseded can tell and remove itself.
  const surfaceGenRef = useRef(0);
  // Exposed so ViewerPage can show a real, specific error instead.
  const [libraryMissing, setLibraryMissing] = useState(false);

  // Keyed on mountNode, which is state set by a callback ref, so the viewer is
  // created whenever the mount node appears. The node only exists once an entry
  // is selected, so it is often null on the first render.
  useEffect(() => {
    if (!mountNode) return;
    if (!window.$3Dmol) {
      setLibraryMissing(true);
      return;
    }
    setLibraryMissing(false);
    const glviewer = window.$3Dmol.createViewer(mountNode, {
      backgroundColor: backgroundColor || "#0f0a16",
      antialias: true,
    });
    viewerRef.current = glviewer;
    return () => {
      // $3Dmol.GLViewer has no explicit destroy(); clearing models and
      // letting the DOM node get removed by React is what the library itself
      // does between page navigations in its own examples.
      try { glviewer.clear(); } catch { /* already torn down */ }
      viewerRef.current = null;
    };
  }, [mountNode]);

  // Separate from creation, so a background change does not rebuild the
  // viewer. setBackgroundColor takes a hex string.
  useEffect(() => {
    const glviewer = viewerRef.current;
    if (!glviewer || !backgroundColor) return;
    if (typeof glviewer.setBackgroundColor === "function") {
      glviewer.setBackgroundColor(backgroundColor);
      glviewer.render();
    }
  }, [backgroundColor, mountNode]);

  // Reloads when the structure text changes. Show waters is display only: they
  // are hidden by style, never removed, so toggling needs no reload and the
  // loaded model is never modified.
  useEffect(() => {
    const glviewer = viewerRef.current;
    if (!glviewer || !pdbText) return;
    glviewer.clear();
    glviewer.addModel(pdbText, "pdb");
    glviewer.zoomTo();
    glviewer.render();
  }, [pdbText]);

  // Re-apply styles/visibility/colors whenever any of those change,
  // Set whenever 3Dmol's atom-click callback fires. The container listener
  // below runs after it, so "no atom click in the last moment" means the
  // click landed on empty space.
  const atomClickAtRef = useRef(0);
  const shiftHeldRef = useRef(false);
  const hoverCbRef = useRef(null);
  const pickCbRef = useRef(null);
  hoverCbRef.current = onHoverAtom;
  const pickBackgroundRef = useRef(null);
  pickBackgroundRef.current = onPickBackground;
  pickCbRef.current = onPickAtom;

  // Restyles without reloading; setStyle only touches the existing atoms.
  useEffect(() => {
    const glviewer = viewerRef.current;
    if (!glviewer || !pdbText) return;

    glviewer.setStyle({}, {}); // clear all prior styles first, so switching representation doesn't leave the old one's geometry behind
    // Each run supersedes the last. addSurface resolves asynchronously, so a run
    // that starts before the previous surface is built would clear a handle that
    // is still null and leave the late surface on screen with no way to remove
    // it.
    surfaceGenRef.current += 1;
    const surfaceGen = surfaceGenRef.current;
    if (surfaceHandleRef.current) {
      try { glviewer.removeSurface(surfaceHandleRef.current); } catch { /* already removed with the previous model */ }
      surfaceHandleRef.current = null;
    }

    const styleKey = REP_STYLE_KEY[repMode] || "cartoon";

    chains.forEach((chain) => {
      const sel = { ...blockSelector(chain), hetflag: false };
      // Nucleic chains get a nucleic cartoon whatever the protein representation:
      // a protein cartoon on DNA draws a thin trace with no bases.
      if (chain.isNucleic) {
        // Either the DNA/RNA group switch or this chain's own eye toggle.
        if (!visibility.nucleic || visibility.chains[chain.id] === false) {
          glviewer.setStyle(sel, {});
          return;
        }
        const nucColor = chainColors[chain.id] || "#7FB3E8";  // distinct default from the protein purple, so DNA reads as a different kind of thing at a glance
        // No explicit cartoon style: one 3Dmol rejects for the geometry it built
        // leaves the chain empty, and the default looks right. The nucleic cartoon
        // already draws the base rungs, so the bases are not drawn again.
        glviewer.setStyle(sel, { cartoon: { color: nucColor } });
        return;
      }
      if (visibility.chains[chain.id] === false) {
        glviewer.setStyle(sel, {});
        return;
      }
      const color = chainColors[chain.id] || "#AB7ADF";
      // A chain set to its own representation ignores the global
      // buttons; every other chain still follows them.
      const chainRep = (itemReps || {})[chain.id];
      const styleSpec = chainRep ? residueStyleFor(chainRep, color) : {};
      if (!chainRep) {
        if (styleKey === "cartoon") styleSpec.cartoon = { color };
        else if (styleKey === "stick") styleSpec.stick = { color, radius: 0.16 };
        else if (styleKey === "sphere") styleSpec.sphere = { color, scale: 0.35 };
        else if (styleKey === "line") styleSpec.line = { color };
      }
      glviewer.setStyle(sel, styleSpec);
    });

    if (repMode === "surface") {
      // Surfaces are scoped by chain letter only: addSurface takes a list of
      // letters, and adding serial ranges would union every block sharing a
      // letter. Two structures sharing a chain letter in surface mode therefore
      // share a surface.
      const visibleChainIds = chains.filter((c) => visibility.chains[c.id] !== false).map((c) => c.chainLetter || c.id);
      if (visibleChainIds.length && window.$3Dmol.SurfaceType) {
        glviewer.addSurface(window.$3Dmol.SurfaceType.VDW, { opacity: 0.85, colorscheme: "whiteCarbon" }, { chain: visibleChainIds, hetflag: false })
          .then((handle) => {
            if (surfaceGenRef.current !== surfaceGen) {
              // Superseded while it was building: remove it now rather
              // than store a handle for a surface that should not exist.
              try { glviewer.removeSurface(handle); } catch { /* already gone with the model */ }
              glviewer.render();
              return;
            }
            surfaceHandleRef.current = handle;
          });
      }
    }

    // Ligands and other hetero groups: per-group colours (an explicit choice in
    // ligandColors, else VIEWER_LIGAND_COLORS) and sticks whatever the protein
    // representation, so they stay legible in cartoon mode. Ions are spheres: a
    // monatomic ion has no bonds, and sticks draw only bonds. Slightly larger
    // than waters.
    hetGroups.filter((g) => g.isIon).forEach((group, i) => {
      const key = group.resn + "|" + group.resi + "|" + group.chain;
      // The group switch or this one ion on its own.
      if (!visibility.ions || visibility.hidden[key]) {
        glviewer.setStyle({ ...blockSelector(group), resi: group.resi, resn: group.resn }, {});
        return;
      }
      const color = ligandColors[key] || VIEWER_LIGAND_COLORS[i % VIEWER_LIGAND_COLORS.length];
      // Spheres unless this ion has been set to something else.
      const ionStyle = (itemReps || {})[key]
        ? residueStyleFor(itemReps[key], color)
        : { sphere: { color, radius: 0.55 } };
      glviewer.setStyle({ ...blockSelector(group), resi: group.resi, resn: group.resn }, ionStyle);
    });

    if (visibility.ligands) {
      // Ions are styled as spheres above; a later stick style would hide them.
      hetGroups.filter((g) => g.resn !== "HOH" && !g.isIon).forEach((group, i) => {
        const key = group.resn + "|" + group.resi + "|" + group.chain;
        if (visibility.hidden[key]) {
          glviewer.setStyle({ ...blockSelector(group), resi: group.resi, resn: group.resn }, {});
          return;
        }
        const color = ligandColors[key] || VIEWER_LIGAND_COLORS[i % VIEWER_LIGAND_COLORS.length];
        // Scoped by serials as for chains: two structures can share a chain letter
        // and a ligand residue number.
        const ligStyle = (itemReps || {})[key]
          ? residueStyleFor(itemReps[key], color)
          : { stick: { color, radius: 0.22 } };
        glviewer.setStyle({ ...blockSelector(group), resi: group.resi, resn: group.resn }, ligStyle);
      });
    }

    // Waters as small spheres, or an empty style when off. Display only; Astra3
    // strips water before analysis.
    if (visibility.waters) {
      glviewer.setStyle({ resn: "HOH" }, { sphere: { color: "#6E8EE8", radius: 0.18 } });
    } else {
      glviewer.setStyle({ resn: "HOH" }, {});
    }

    // Selection highlight, applied last so it wins over every representation.
    // Residues coloured in an earlier selection come first, so a residue picked
    // again shows the active colour. Recolouring a whole chain, ligand or ion
    // clears these for it (see ViewerPage).
    for (const painted of Object.values(paintedResidues || {})) {
      applyResidueHighlight(glviewer, painted, painted.color, painted.rep, backgroundColor);
    }

    for (const sel of selections || []) {
      applyResidueHighlight(glviewer, sel, selectionColor, selectionRep, backgroundColor);
    }

    // Residues hidden from the Selected panel. Last, so hidden wins.
    for (const hidden of Object.values(hiddenResidues || {})) {
      glviewer.setStyle(residueSelector(hidden), {});
    }

    // Hover and pick, registered after setStyle: restyling rebuilds the geometry
    // and drops callbacks attached before it.
    try {
      glviewer.setHoverable({}, true,
        (atom) => { if (atom) hoverCbRef.current?.(atomDescriptor(atom)); },
        () => hoverCbRef.current?.(null));
      glviewer.setClickable({}, true, (atom, _v, event) => {
        if (!atom) return;
        // Recorded so the container-level handler below can tell an atom
        // click from a click on empty space. 3Dmol only fires this callback
        // for atoms, so "no atom callback fired for this click" is the only
        // available signal that the person clicked the background.
        atomClickAtRef.current = Date.now();
        pickCbRef.current?.(atomDescriptor(atom), !!(event && event.shiftKey) || shiftHeldRef.current);
      });
    } catch {
      // Older 3Dmol builds may not expose both APIs. Hovering is an
      // enhancement, not something the viewer depends on, so a build without
      // it should still render normally.
    }

    glviewer.render();
  }, [pdbText, chains, hetGroups, repMode, visibility, chainColors, ligandColors, itemReps, selections, selectionColor, selectionRep, paintedResidues, hiddenResidues, backgroundColor]);

  // --- Selection outline ------------------------------------------------
  // A thin black-and-white dashed box that runs around each selected residue,
  // whatever its representation, drawn in an SVG layer over the canvas and
  // following the camera. It exists only while something is selected.
  useEffect(() => {
    const glviewer = viewerRef.current;
    const visible = (selections || []).filter((sel) => !(hiddenResidues || {})[sel.key]).slice(0, SELECTION_OUTLINE_LIMIT);
    if (!mountNode || !glviewer || visible.length === 0) return undefined;
    if (window.getComputedStyle(mountNode).position === "static") mountNode.style.position = "relative";
    const layer = createSelectionOutlineLayer(visible.length);
    mountNode.appendChild(layer.svg);
    let frame = 0;
    const draw = () => {
      const origin = mountNode.getBoundingClientRect();
      visible.forEach((sel, i) => {
        const atoms = glviewer.selectedAtoms(residueSelector(sel));
        const box = atoms.length ? selectionScreenBox(glviewer, atoms, origin) : null;
        layer.place(i, box);
      });
      frame = window.requestAnimationFrame(draw);
    };
    draw();
    return () => { window.cancelAnimationFrame(frame); layer.svg.remove(); };
  }, [selections, hiddenResidues, mountNode, pdbText]);

  // --- Pointer behaviour on the canvas ---------------------------------
  // Three things 3Dmol does not provide, wired at the container level so the
  // library's own orbit/zoom handling is left intact everywhere else.
  useEffect(() => {
    if (!mountNode) return;

    // Shift+drag is bound to zoom inside 3Dmol, which makes Shift+click
    // unusable for picking: the zoom fires on the same gesture. Swallowing
    // the event in the capture phase keeps it from reaching 3Dmol at all,
    // so Shift becomes a modifier for selection instead of a zoom gesture.
    const onPointerDownCapture = (e) => {
      shiftHeldRef.current = !!e.shiftKey;
      if (e.shiftKey) {
        e.stopPropagation();
      }
    };

    // Rolls the view when dragging near an edge, as PyMOL does: vertical drags
    // roll in the left and right bands, horizontal drags in the top and bottom
    // bands, with the direction flipped between opposite edges so the motion
    // follows the pointer.
    const EDGE_FRACTION = 0.14;
    const ROLL_DEGREES_PER_PIXEL = 0.4;
    let rolling = false;
    let rollAxis = null;      // "vertical" (left/right band) or "horizontal"
    let rollSign = 1;
    let lastPoint = { x: 0, y: 0 };

    const onMouseDown = (e) => {
      if (e.button !== 0 || e.shiftKey) return;
      const rect = mountNode.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const marginX = rect.width * EDGE_FRACTION;
      const marginY = rect.height * EDGE_FRACTION;
      const onLeft = x < marginX;
      const onRight = x > rect.width - marginX;
      const onTop = y < marginY;
      const onBottom = y > rect.height - marginY;
      if (!onLeft && !onRight && !onTop && !onBottom) return;

      // A corner belongs to whichever band it is deeper into, so the gesture
      // is never ambiguous about which axis it reads.
      const depthX = onLeft ? x : onRight ? rect.width - x : Infinity;
      const depthY = onTop ? y : onBottom ? rect.height - y : Infinity;
      // Screen y grows downward, and a clockwise on-screen rotation is negative
      // about the viewing axis, so each sign is the inverse of the naive reading.
      if (depthX <= depthY) {
        rollAxis = "vertical";
        // Right edge, dragging down -> clockwise. Left edge mirrors it.
        rollSign = onRight ? -1 : 1;
      } else {
        rollAxis = "horizontal";
        // Bottom edge, dragging right -> clockwise. Top edge mirrors it.
        rollSign = onBottom ? 1 : -1;
      }
      rolling = true;
      lastPoint = { x: e.clientX, y: e.clientY };
      e.stopPropagation();
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!rolling) return;
      const glviewer = viewerRef.current;
      if (!glviewer) return;
      const dx = e.clientX - lastPoint.x;
      const dy = e.clientY - lastPoint.y;
      lastPoint = { x: e.clientX, y: e.clientY };
      const travel = rollAxis === "vertical" ? dy : dx;
      const delta = travel * ROLL_DEGREES_PER_PIXEL * rollSign;
      if (delta === 0) return;
      // Rolls about the viewing axis ("vz") so the structure spins in the plane of
      // the screen. Plain "z" is the model's own axis, which tips the structure once
      // it has been orbited. Older 3Dmol builds reject "vz" and fall back to "z".
      try {
        glviewer.rotate(delta, "vz");
        glviewer.render();
      } catch {
        try {
          glviewer.rotate(delta, "z");
          glviewer.render();
        } catch {
          rolling = false;
        }
      }
      e.stopPropagation();
      e.preventDefault();
    };

    const endRoll = () => { rolling = false; };

    // Deferred a frame so 3Dmol's atom-click callback runs first; otherwise every
    // atom click would also clear the selection.
    const onClick = () => {
      const clickedAtom = Date.now() - atomClickAtRef.current < 250;
      if (!clickedAtom) pickBackgroundRef.current?.();
    };

    mountNode.addEventListener("pointerdown", onPointerDownCapture, true);
    mountNode.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("mouseup", endRoll, true);
    mountNode.addEventListener("click", onClick);
    return () => {
      mountNode.removeEventListener("pointerdown", onPointerDownCapture, true);
      mountNode.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("mouseup", endRoll, true);
      mountNode.removeEventListener("click", onClick);
    };
  }, [mountNode]);

  // 3Dmol's own spin(), which stops when the person starts dragging.
  useEffect(() => {
    const glviewer = viewerRef.current;
    if (!glviewer) return;
    if (autoSpin) glviewer.spin("y", 0.4);
    else glviewer.spin(false);
  }, [autoSpin, pdbText]);

  const resetView = useCallback(() => {
    const glviewer = viewerRef.current;
    if (!glviewer) return;
    glviewer.zoomTo(); // recenters and rescales to fit
    // zoomTo() resets position and zoom but not rotation. getView() returns
    // [pos.x, pos.y, pos.z, zoomZ, q.x, q.y, q.z, q.w]; keep the position and
    // zoom and set the quaternion to identity.
    if (typeof glviewer.getView === "function" && typeof glviewer.setView === "function") {
      const view = glviewer.getView();
      if (Array.isArray(view) && view.length === 8) {
        glviewer.setView([view[0], view[1], view[2], view[3], 0, 0, 0, 1]);
      }
    }
    glviewer.render();
  }, []);

  const captureScreenshot = useCallback(() => {
    const glviewer = viewerRef.current;
    if (!glviewer) return null;
    return glviewer.pngURI ? glviewer.pngURI() : null;
  }, []);

  return { resetView, captureScreenshot, libraryMissing };
}

// A minimal ATOM/HETATM parser for the sidebar's chain and ligand lists
// (chain, residue name and number, hetero flag). 3Dmol does the full parse
// for rendering.
function parsePdbSummary(pdbText) {
  // Chains and het groups are keyed by a disambiguated key, not the chain
  // letter: a multi-object save writes every object flat with no re-lettering,
  // so two structures can both have a chain A. A TER record, or a change of
  // letter without one, starts a new block.
  //
  // Structure tags Astra3 writes at the top of the viewer file
  // ("REMARK 999 ASTRA3 STRUCTURE S1 1XGD") map each structure to the segment
  // ID its atoms carry ("*" for a single structure). Older files fall back to
  // the groupIndex heuristic below.
  const structureTags = new Map();
  const serialInfo = new Map(); // atom serial -> { blockKey, resKey, structureLabel }
  const residueSerials = new Map(); // resKey -> [serials]: one residue in one structure
  const occurrenceInStructure = new Map(); // `${label}|${chain}` -> blocks seen
  let openStructureLabel = null;
  const chainsMap = new Map(); // disambiguated key -> { id, chainLetter, occurrence, resCount, serials }
  const hetMap = new Map(); // `${resn}|${resi}|${disambiguated chain key}` -> group (carries chainLetter + serials too, for real 3Dmol.js selection)
  if (!pdbText) return { chains: [], hetGroups: [] };
  const lines = pdbText.split("\n");

  const occurrenceCounts = new Map(); // raw chain letter -> how many blocks of it seen so far
  let openBlockChainLetter = null; // raw chain letter of the currently-open block, or null
  let openBlockKey = null; // this block's disambiguated key
  let boundaryPending = true; // true right after a TER, or at the very start
  // Structure boundaries for older OVERLAY and TERMINI files without tags: a
  // chain letter at or before the current group's first letter starts a new
  // structure. This can misattribute an unusual file, so ViewerPage only shows
  // structure IDs when the group count matches.
  let groupIndex = -1;
  let currentGroupFirstLetter = null;

  for (const line of lines) {
    const record = line.slice(0, 6).trim();
    if (record === "REMARK" && line.startsWith("REMARK 999 ASTRA3 STRUCTURE ")) {
      const [tag, ...label] = line.slice("REMARK 999 ASTRA3 STRUCTURE ".length).trim().split(/\s+/);
      if (tag && label.length) structureTags.set(tag, label.join(" "));
      continue;
    }
    if (record === "TER") {
      boundaryPending = true;
      continue;
    }
    if (record !== "ATOM" && record !== "HETATM") continue;
    const resn = line.slice(17, 20).trim();
    const chainLetter = line.slice(21, 22).trim() || "A";
    const resi = line.slice(22, 26).trim();
    // Columns 7-11. Serials are unique across a multi-object save, unlike chain
    // letters and residue numbers, so selections use {chain, serial: [...]}.
    // 3Dmol's serial field takes single numbers, not a range, and a list matches
    // any one of its values, so every serial is listed.
    const serial = parseInt(line.slice(6, 11).trim(), 10);
    const structureLabel = structureTags.size
      ? (structureTags.get(line.slice(72, 76).trim()) || structureTags.get("*") || null)
      : null;

    if (boundaryPending || chainLetter !== openBlockChainLetter || structureLabel !== openStructureLabel) {
      const count = (occurrenceCounts.get(chainLetter) || 0) + 1;
      occurrenceCounts.set(chainLetter, count);
      // The first occurrence keeps the plain letter, so a file that never repeats
      // one is unaffected.
      openBlockKey = count > 1 ? `${chainLetter}#${count}` : chainLetter;
      openBlockChainLetter = chainLetter;
      boundaryPending = false;
      // See groupIndex above. With structure tags, the group is the structure's
      // position among them.
      if (structureLabel) {
        groupIndex = [...new Set(structureTags.values())].indexOf(structureLabel);
      } else if (currentGroupFirstLetter === null || chainLetter <= currentGroupFirstLetter) {
        groupIndex += 1;
        currentGroupFirstLetter = chainLetter;
      }
      openStructureLabel = structureLabel;
      const occKey = `${structureLabel}|${chainLetter}`;
      occurrenceInStructure.set(occKey, (occurrenceInStructure.get(occKey) || 0) + 1);
    }
    // One residue of one structure, including its insertion code (22-27).
    const resKey = `${openBlockKey}|${line.slice(22, 27).trim()}|${resn}`;
    if (Number.isFinite(serial)) {
      serialInfo.set(serial, { blockKey: openBlockKey, resKey, structureLabel });
      if (!residueSerials.has(resKey)) residueSerials.set(resKey, []);
      residueSerials.get(resKey).push(serial);
    }

    if (record === "ATOM") {
      if (!chainsMap.has(openBlockKey)) {
        chainsMap.set(openBlockKey, { id: openBlockKey, chainLetter, occurrence: occurrenceCounts.get(chainLetter), resCount: 0, nucleicCount: 0, serials: [], groupIndex,
          structureLabel, structureOccurrence: occurrenceInStructure.get(`${structureLabel}|${chainLetter}`) || 1 });
      }
      const entry = chainsMap.get(openBlockKey);
      entry.resCount++;
      // Counted rather than decided per-atom: a chain is classified by what
      // most of it is, so a lone modified residue in a protein chain (or a
      // bound amino acid in a nucleic one) can't flip the whole chain into
      // the wrong representation.
      if (NUCLEIC_RESN.has(resn)) entry.nucleicCount++;
      if (Number.isFinite(serial)) entry.serials.push(serial);
    } else if (resn !== "HOH") {
      const key = resn + "|" + resi + "|" + openBlockKey;
      if (!hetMap.has(key)) {
        hetMap.set(key, { resn, resi, chain: openBlockKey, chainLetter, serials: [], groupIndex, structureLabel, isIon: isIonResn(resn) });
      }
      if (Number.isFinite(serial)) hetMap.get(key).serials.push(serial);
    }
  }
  const chains = Array.from(chainsMap.values()).map((c) => ({
    ...c,
    // Majority rule, on atom counts. Nucleotides have far more atoms per
    // residue than the stray het that might sit in the same chain, so a
    // simple majority is a reliable signal here.
    isNucleic: c.resCount > 0 && c.nucleicCount / c.resCount > 0.5,
  }));
  // A one-atom het group is an ion whatever its name.
  const hetGroups = Array.from(hetMap.values()).map((g) => ({
    ...g,
    isIon: g.isIon || g.serials.length === 1,
  }));
  return { chains, hetGroups, residueIndex: { serialInfo, residueSerials } };
}

function ordinalSuffix(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" })[n % 10] || "th"}`;
}

// "1XGD (Chain A)", "6F7R (Chain A; 2nd occurrence)". The structure comes from
// the viewer file's own tags when present; otherwise from the run's IDs when
// the group heuristic agrees with them; otherwise the chain alone.
function chainDisplayLabel(c, groupIds) {
  const letter = c.chainLetter || c.id;
  if (c.structureLabel) {
    const occ = c.structureOccurrence || 1;
    return `${c.structureLabel} (Chain ${letter}${occ > 1 ? `; ${ordinalSuffix(occ)} occurrence` : ""})`;
  }
  if (groupIds && c.groupIndex != null && groupIds[c.groupIndex]) return `${groupIds[c.groupIndex]} (Chain ${letter})`;
  return `Chain ${letter}${c.occurrence > 1 ? ` (${ordinalSuffix(c.occurrence)} occurrence)` : ""}`;
}

// Residue names 3Dmol.js will be asked to draw as nucleic acid rather than
// protein. Covers DNA (DA/DC/DG/DT), RNA (A/C/G/U), and the "+"/"D" prefixed
// variants older PDB entries use.
const NUCLEIC_RESN = new Set([
  "DA", "DC", "DG", "DT", "DU", "DI",
  "A", "C", "G", "U", "I",
  "+A", "+C", "+G", "+T", "+U",
  "ADE", "CYT", "GUA", "THY", "URA",
]);

// Monatomic ions recorded as HETATM, drawn as spheres; Astra3's analysis
// also names and colours them apart from ligands.
const ION_RESN = new Set([
  "NA", "K", "MG", "CA", "MN", "FE", "FE2", "CO", "NI", "CU", "CU1", "ZN",
  "CD", "HG", "CL", "BR", "IOD", "F", "LI", "RB", "CS", "SR", "BA", "AL",
  "AU", "AG", "PT", "PB", "CR", "MO", "W", "V", "SE", "SM", "GD", "EU",
  "YB", "LU", "TB", "HO", "ER", "NH4", "OH",
]);

// Small polyatomic ions grouped with the monatomic ones.
const POLY_ION_RESN = new Set(["SO4", "PO4", "NO3", "CO3", "ACT", "EDO", "GOL", "MES", "TRS", "CAC", "FMT"]);

function isIonResn(resn) {
  return ION_RESN.has(resn) || POLY_ION_RESN.has(resn);
}

// Selection spec for one disambiguated block: its chain letter plus every
// atom serial (see parsePdbSummary). Falls back to the letter alone if no
// serials were recorded.
function blockSelector(entry) {
  const chainLetter = entry.chainLetter || entry.chain;
  if (entry.serials && entry.serials.length) {
    return { chain: chainLetter, serial: entry.serials };
  }
  return { chain: chainLetter };
}

function ViewerPage() {
  // State set by a callback ref, so useMolViewer can react to the node
  // appearing; a ref object never changes identity.
  const [mountNode, setMountNode] = useState(null);
  const { history, quickViews, addQuickView, removeQuickView, settings, isElectron, sessionStartTime, selectedViewerId, setSelectedViewerId } = useApp();
  const toast = useToast();
  // Same reasoning as ReportsPage: a "batch" entry has no single structure
  // file of its own to load into the 3D viewer.
  const completed = history.filter((h) => h.status === "complete" && h.kind !== "batch");
  // Batches shown as expandable groups here too, using the same shared helper
  // as the Reports sidebar so the two present history identically.
  const { batchGroups, ordered } = groupCompletedByBatch(history, completed);
  const [expandedBatches, setExpandedBatches] = useState({});
  // Individual protein chains start folded; expanding on every load would
  // push the rest of the panel down. See the disclosure that uses this.
  const [selected, setSelected] = useState(completed[0] || quickViews[0] || null);
  // Analyses and Quick View entries in one list, newest first.
  const listed = [...ordered, ...quickViews.map((run) => ({ run, timestamp: run.timestamp }))]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  // Coordinates fetched for Quick View entries this session, by entry id, so
  // switching back to one does not fetch it again.
  const quickViewText = useRef(new Map());
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickId, setQuickId] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState(null);
  // Opens the structure the user asked for when arriving from elsewhere
  // (Summary's "View in 3D"). Without this the viewer keeps whatever was last
  // loaded, so the button navigated here but showed a different protein.
  useEffect(() => {
    if (!selectedViewerId) return;
    const wanted = history.find((h) => h.id === selectedViewerId);
    if (wanted) {
      if (wanted.kind === "batch") {
        // A batch has no structure of its own; open the first run it produced.
        setExpandedBatches((e) => ({ ...e, [wanted.id]: true }));
        const group = batchGroups.find((g) => g.batch.id === wanted.id);
        if (group && group.children.length > 0) setSelected(group.children[0]);
      } else {
        setSelected(wanted);
      }
    }
    setSelectedViewerId(null); // consumed
  }, [selectedViewerId]);
  const [pdbText, setPdbText] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(false);

  // The .pdb Astra3 writes beside the session (save_session in
  // astra3_render_report.py), found by swapping the extension. Entries without
  // a session path search the output folder.
  const pdbPathFor = async (entry) => {
    if (entry.sessionPath && /\.(pse|cxs)$/.test(entry.sessionPath)) {
      return entry.sessionPath.slice(0, -4) + ".pdb";
    }
    const folder = await resolveRealOutputFolder(entry, settings);
    if (!folder) return null;
    const files = await window.astra3Native.listDir(`${folder}/Session`);
    const pdbFile = files.find((f) => f.toLowerCase().endsWith(".pdb"));
    return pdbFile ? `${folder}/Session/${pdbFile}` : null;
  };

  useEffect(() => {
    if (!selected) { setPdbText(null); return; }
    setLoading(true);
    setLoadError(null);
    if (!isElectron) {
      // No filesystem outside Electron.
      setLoading(false);
      setLoadError("Loading real structure data requires the desktop app (file access is not available in this preview).");
      setPdbText(null);
      return;
    }
    let cancelled = false;
    if (selected.kind === "quickview") {
      const kept = quickViewText.current.get(selected.id);
      if (kept) {
        setPdbText(kept);
        setLoading(false);
        return undefined;
      }
      window.astra3Native.quickView({ id: selected.structureId, path: selected.path || null }).then((result) => {
        if (cancelled) return;
        if (result && result.ok) {
          quickViewText.current.set(selected.id, result.text);
          setPdbText(result.text);
        } else {
          setLoadError(result?.error || "Quick View could not load this structure.");
          setPdbText(null);
        }
        setLoading(false);
      });
      return () => { cancelled = true; };
    }
    pdbPathFor(selected).then((path) => {
      if (cancelled) return;
      if (!path) {
        const isCurrentSession = !selected.timestamp || selected.timestamp >= sessionStartTime;
        setLoadError(isCurrentSession
          ? `Could not locate the structure file for ${selected.label}. Its output folder may not have been generated yet, may have used -sessiononly/-skipreport, or may have been moved/deleted since the run finished.`
          : outputFolderNotFoundMessage(selected, sessionStartTime));
        setPdbText(null);
        setLoading(false);
        return;
      }
      window.astra3Native.readFile(path).then((text) => {
        if (cancelled) return;
        setPdbText(text);
        setLoading(false);
      }).catch((e) => {
        if (cancelled) return;
        setLoadError(`Could not read the structure file for ${selected.label}: ${e.message || e}.`);
        setPdbText(null);
        setLoading(false);
      });
    });
    return () => { cancelled = true; };
  }, [selected, isElectron]);

  const { chains: parsedChains, hetGroups, residueIndex } = useMemo(() => parsePdbSummary(pdbText), [pdbText]);
  const chains = parsedChains.length ? parsedChains : [];
  // Structure IDs for chain labels, used only when the detected structure
  // groups match the IDs the entry names (an OVERLAY of 3FXI and 4FXI gives
  // "3FXI (Chain A)" and "4FXI (Chain A)"). Otherwise null, and labels use the
  // occurrence number rather than risk a wrong ID.
  const groupIdsForLabels = useMemo(() => {
    if (!selected) return null;
    const knownIds = idsFromHistoryEntry(selected);
    if (knownIds.length < 2) return null; // single-structure entries never needed this to begin with
    const maxGroupIndex = Math.max(-1, ...chains.map((c) => c.groupIndex ?? -1));
    if (maxGroupIndex + 1 !== knownIds.length) return null;
    return knownIds;
  }, [selected, chains]);
  // hetGroups includes water; the Ligands toggle is only offered when a real
  // ligand is present.
  const realLigandGroups = hetGroups.filter((g) => g.resn !== "HOH");
  // Protein and nucleic chains are counted and toggled separately, so turning
  // protein chains off does not hide the DNA.
  const proteinChains = chains.filter((c) => !c.isNucleic);
  const nucleicChains = chains.filter((c) => c.isNucleic);
  // Split exactly as useMolViewer splits them, indices included: the default
  // colour is chosen by position within each list.
  const ionGroups = hetGroups.filter((g) => g.isIon);
  const ligandOnlyGroups = hetGroups.filter((g) => g.resn !== "HOH" && !g.isIon);
  const chainHets = hetGroupsByChain(chains, hetGroups);

  const [repMode, setRepMode] = useState("cartoon");
  // Ions and nucleic chains are on by default; waters are off. hidden holds
  // individually hidden ligands and ions, keyed as ligandColors; the ligands
  // and ions flags are the group switches above it.
  const [visibility, setVisibility] = useState({ ligands: true, ions: true, nucleic: true, waters: false, chains: {}, hidden: {} });
  const [chainColors, setChainColors] = useState({});
  const [ligandColors, setLigandColors] = useState({});
  // Per-item representation overrides, keyed as the colour maps. Absent means
  // the default for that kind of item, so changing the global representation
  // still moves every chain not set apart.
  const [itemReps, setItemReps] = useState({});
  const setItemRep = (key, rep) => setItemReps((st) => {
    const next = { ...st };
    if (rep) next[key] = rep; else delete next[key];
    return next;
  });
  // { kind: "chain", id } or { kind: "ligand", key }.
  const [colorTarget, setColorTarget] = useState(null);
  // Chains whose "Bound to this chain" list has been folded away; open by default.
  const [closedChainHets, setClosedChainHets] = useState({});
  const [autoSpin, setAutoSpin] = useState(true);
  const [backgroundColor, setBackgroundColor] = useState("#0f0a16");

  // Assign default colors/visibility to newly-seen chains without clobbering
  // choices already made for chains that were already there.
  useEffect(() => {
    setChainColors((prev) => {
      const next = { ...prev };
      chains.forEach((c, i) => { if (!next[c.id]) next[c.id] = VIEWER_CHAIN_COLORS[i % VIEWER_CHAIN_COLORS.length]; });
      return next;
    });
    setVisibility((prev) => {
      const next = { ...prev, chains: { ...prev.chains } };
      chains.forEach((c) => { if (next.chains[c.id] === undefined) next.chains[c.id] = true; });
      return next;
    });
  }, [chains]);

  // hoveredAtom changes on every pointer move and only the readout reads it,
  // so it is not a styling dependency.
  const [hoveredAtom, setHoveredAtom] = useState(null);
  // Selection is a list so Shift+click can build one up. The panel describes
  // the most recent pick; the colour controls apply to all of them.
  const [selections, setSelections] = useState([]);
  // null = automatic: black or white, whichever contrasts with the residue's
  // own colour. A colour picked in the panel replaces it until reset.
  const [selectionColor, setSelectionColor] = useState(null);
  // A selection keeps whatever representation it already has; the panel can
  // switch it to another one.
  const [selectionRep, setSelectionRep] = useState(DEFAULT_SELECTION_REP);
  // Residues hidden with the Selected panel's eye button, keyed like
  // selections. Kept after the selection is released.
  const [hiddenResidues, setHiddenResidues] = useState({});
  // Residues whose colour was kept when they were deselected, keyed by atom
  // key so picking one again replaces its entry.
  const [paintedResidues, setPaintedResidues] = useState({});
  const selection = selections.length ? selections[selections.length - 1] : null;

  // Commits the current colour of every residue in `list` so it survives the
  // selection being cleared.
  const commitPainted = useCallback((list, color, rep) => {
    if (!list || list.length === 0) return;
    setPaintedResidues((prev) => {
      const next = { ...prev };
      for (const sel of list) next[sel.key] = { chain: sel.chain, block: sel.block, resi: sel.resi, serials: sel.serials, color, rep };
      return next;
    });
  }, []);

  // Recolouring a whole chain, ligand or ion overrides any residue-level
  // colour committed inside it. Without this, a chain recolour would visibly
  // skip the residues someone had painted earlier, and the only way to undo
  // that would be to find and re-pick each one.
  const clearPaintedOnChain = useCallback((chainId) => {
    setPaintedResidues((prev) => {
      const next = {};
      let changed = false;
      for (const [key, painted] of Object.entries(prev)) {
        if ((painted.block || painted.chain) === chainId) { changed = true; continue; }
        next[key] = painted;
      }
      return changed ? next : prev;
    });
  }, []);

  const setChainColor = useCallback((key, hex) => {
    setChainColors((prev) => ({ ...prev, [key]: hex }));
    clearPaintedOnChain(key);
  }, [clearPaintedOnChain]);

  // Clicking empty space abandons the selection, colour and representation
  // included: most clicks away mean never mind.
  const resetSelections = useCallback(() => {
    setSelections([]);
    setSelectionRep(DEFAULT_SELECTION_REP);
  }, []);

  // Keeps what is currently shown: the colour and representation are written
  // into the painted map so they survive, then the selection is released.
  const keepSelections = useCallback(() => {
    setSelections((cur) => { commitPainted(cur, selectionColor, selectionRep); return []; });
    setSelectionRep(DEFAULT_SELECTION_REP);
  }, [commitPainted, selectionColor, selectionRep]);

  const { resetView, captureScreenshot, libraryMissing } = useMolViewer(mountNode, {
    pdbText, chains, hetGroups, repMode, visibility, chainColors, ligandColors, itemReps,
    autoSpin, colorTarget, backgroundColor,
    onHoverAtom: setHoveredAtom,
    // Plain click replaces the selection; clicking the only selected residue
    // clears it, so the same click that selects is still the way out.
    // Shift+click adds to or removes from the set without disturbing the
    // rest.
    onPickAtom: (picked, additive) => setSelections((cur) => {
      // The exact residue clicked, in the structure it belongs to. Chain and
      // number alone are shared by every structure in an overlay, so they
      // would highlight the same residue in all of them.
      const info = residueIndex?.serialInfo?.get(picked.serial);
      const atom = info
        ? { ...picked, key: info.resKey, block: info.blockKey, structure: info.structureLabel,
            serials: residueIndex.residueSerials.get(info.resKey) }
        : picked;
      if (additive) {
        if (cur.some((sel) => sel.key === atom.key)) return cur.filter((sel) => sel.key !== atom.key);
        return [...cur, atom];
      }
      if (cur.length === 1 && cur[0].key === atom.key) return [];
      return [atom];
    }),
    // Clicking empty space abandons the selection entirely.
    onPickBackground: resetSelections,
    selections, selectionColor, selectionRep, paintedResidues, hiddenResidues,
  });

  // Everything back to how the model was first drawn: camera, representation,
  // per-item colours, representations and hiding, painted residues, selection
  // and background.
  const resetEverything = useCallback(() => {
    resetView();
    setRepMode("cartoon");
    setChainColors({});
    setLigandColors({});
    setItemReps({});
    setVisibility({ ligands: true, ions: true, nucleic: true, waters: false, chains: {}, hidden: {} });
    setPaintedResidues({});
    setHiddenResidues({});
    setSelections([]);
    setSelectionColor(null);
    setSelectionRep(DEFAULT_SELECTION_REP);
    setBackgroundColor("#0f0a16");
    setColorTarget(null);
  }, [resetView]);

  // A newly loaded structure invalidates any selection: the same chain and
  // residue number in a different structure is a different residue, and
  // leaving it set would highlight something the person never picked.
  useEffect(() => { setSelections([]); setPaintedResidues({}); setHiddenResidues({}); setSelectionRep(DEFAULT_SELECTION_REP); setHoveredAtom(null); }, [pdbText]);

  // Eye button in the Selected panel: hides every selected residue, or shows
  // them all again when every one of them is already hidden.
  const selectionHidden = selections.length > 0 && selections.every((sel) => hiddenResidues[sel.key]);
  const toggleSelectionHidden = useCallback(() => {
    setHiddenResidues((prev) => {
      const next = { ...prev };
      if (selections.every((sel) => prev[sel.key])) {
        for (const sel of selections) delete next[sel.key];
      } else {
        for (const sel of selections) next[sel.key] = { chain: sel.chain, resi: sel.resi, serials: sel.serials };
      }
      return next;
    });
  }, [selections]);
  const hiddenCount = Object.keys(hiddenResidues).length;

  const toggleChainVis = (id) => setVisibility((v) => ({ ...v, chains: { ...v.chains, [id]: !v.chains[id] } }));
  // A group box reads on when any member shows, and switching it off hides
  // every member individually, so showing one ligand after hiding all is one
  // click. The group flags stay true; the per-item map decides what is drawn.
  const groupKeyOf = (g) => g.resn + "|" + g.resi + "|" + g.chain;
  const anyGroupVisible = (list) => list.some((g) => !visibility.hidden[groupKeyOf(g)]);
  const setGroupVis = (list, show, flag) => setVisibility((st) => ({
    ...st,
    [flag]: true,
    hidden: { ...st.hidden, ...Object.fromEntries(list.map((g) => [groupKeyOf(g), !show])) },
  }));

  const toggleGroupVis = (key) => setVisibility((v) => ({ ...v, hidden: { ...v.hidden, [key]: !v.hidden[key] } }));
  const isGroupHidden = (key) => visibility.hidden[key] === true;

  // Fetched or read first, so an ID that cannot be shown is never saved.
  const openQuickView = async (event) => {
    event.preventDefault();
    if (quickBusy) return;
    if (!isElectron) { setQuickError("Quick View needs the Astra3 desktop app."); return; }
    setQuickBusy(true);
    setQuickError(null);
    let result;
    try {
      result = await window.astra3Native.quickView({ id: quickId });
    } catch (e) {
      result = { ok: false, error: `Quick View failed: ${e.message || e}` };
    }
    setQuickBusy(false);
    if (!result || !result.ok) { setQuickError(result?.error || "Quick View could not load this structure."); return; }
    const imported = result.kind === "import";
    const entry = addQuickView({
      label: result.id, structureId: result.id, source: result.kind, format: result.format,
      path: imported ? result.path : null, name: imported ? result.name : null,
    });
    quickViewText.current.set(entry.id, result.text);
    setSelected(entry);
    setQuickId("");
    if (result.note) toast.push({ tone: "neutral", title: "Quick View", message: result.note });
  };

  const openSession = async () => {
    if (!selected) return;
    if (!isElectron) { toast.push({ tone: "neutral", title: "Opening session", message: selected.label }); return; }
    if (selected.sessionPath) {
      const err = await window.astra3Native.openInPymol(selected.sessionPath);
      if (err) toast.push({ tone: "error", title: "Could not open session", message: err });
      return;
    }
    // Entries without a session path search the output folder.
    const folder = await resolveRealOutputFolder(selected, settings);
    if (!folder) { toast.push({ tone: "error", title: "Could not open session", message: "Could not locate this run's output folder." }); return; }
    const files = await window.astra3Native.listDir(`${folder}/Session`);
    const pseFile = files.find((f) => /\.(pse|cxs)$/i.test(f));
    if (!pseFile) { toast.push({ tone: "error", title: "Could not open session", message: "No session file found in this run's Session folder." }); return; }
    const err = await window.astra3Native.openInPymol(`${folder}/Session/${pseFile}`);
    if (err) toast.push({ tone: "error", title: "Could not open session", message: err });
  };

  const takeScreenshot = async () => {
    const uri = captureScreenshot();
    if (!uri) { toast.push({ tone: "error", title: "Screenshot failed", message: "Viewer isn't ready yet." }); return; }
    if (isElectron) {
      // The renderer cannot write files; the main process saves through a dialog.
      const saved = await window.astra3Native.saveScreenshot(uri, `${selected?.label || "structure"}_viewer.png`);
      if (!saved || saved.cancelled) return;
      if (!saved.ok) { toast.push({ tone: "error", title: "Screenshot not saved", message: saved.error || "" }); return; }
    } else {
      downloadDataUri(uri, `${selected?.label || "structure"}_viewer.png`);
    }
    toast.push({ tone: "success", title: "Screenshot saved" });
  };

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ width: 220, borderRight: "1px solid var(--line-0)", overflowY: "auto", padding: 14, flexShrink: 0 }}>
        <SectionLabel>Completed analyses</SectionLabel>
        {listed.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-1)" }}>No completed analyses yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {listed.map(({ group, run }) => (group ? (
              <div key={group.batch.id}>
                <button onClick={() => setExpandedBatches((e) => ({ ...e, [group.batch.id]: !e[group.batch.id] }))} style={{
                  textAlign: "left", padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer",
                  background: "transparent", color: "var(--text-0)", width: "100%",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{
                    display: "inline-flex", transition: "transform 160ms ease",
                    transform: expandedBatches[group.batch.id] ? "rotate(90deg)" : "rotate(0deg)",
                  }}>
                    <Icon name="chevronRight" size={12} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, display: "block" }}>{group.batch.label}</span>
                    <span style={{ fontSize: 10.5, color: "var(--text-1)" }}>
                      {group.children.length} structure{group.children.length === 1 ? "" : "s"} · {timeAgo(group.batch.timestamp)}
                    </span>
                  </span>
                </button>
                {expandedBatches[group.batch.id] && group.children.map((h) => (
                  <button key={h.id} onClick={() => setSelected(h)} style={{
                    textAlign: "left", padding: "6px 10px 6px 28px", borderRadius: "var(--radius-sm)", border: "none",
                    cursor: "pointer", width: "100%",
                    background: selected?.id === h.id ? "var(--accent-wash)" : "transparent",
                    color: selected?.id === h.id ? "var(--accent-bright)" : "var(--text-0)",
                  }}>
                    <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{h.label}</div>
                  </button>
                ))}
              </div>
            ) : ((h) => {
              const row = (
                <button key={h.id} onClick={() => setSelected(h)} style={{
                  textAlign: "left", padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer",
                  background: selected?.id === h.id ? "var(--accent-wash)" : "transparent",
                  color: selected?.id === h.id ? "var(--accent-bright)" : "var(--text-0)",
                  flex: 1, minWidth: 0,
                }}>
                  <div className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>{h.label}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-1)" }}>{timeAgo(h.timestamp)}{h.kind === "quickview" ? " · Quick View" : ""}</div>
                </button>
              );
              if (h.kind !== "quickview") return row;
              return (
                <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  {row}
                  <Tooltip text="Remove from this list">
                    <IconButton name="x" size={13} onClick={() => {
                      removeQuickView(h.id);
                      if (selected?.id === h.id) setSelected(null);
                    }} />
                  </Tooltip>
                </div>
              );
            })(run)))}
          </div>
        )}
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--line-0)" }}>
          <button onClick={() => { setQuickOpen((v) => !v); setQuickError(null); }} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 2px", border: "none",
            background: "transparent", color: "var(--text-0)", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
          }}>
            <span style={{ display: "inline-flex", transition: "transform 160ms ease", transform: quickOpen ? "rotate(90deg)" : "rotate(0deg)" }}>
              <Icon name="chevronRight" size={12} />
            </span>
            Quick View
          </button>
          {quickOpen && (
            <form onSubmit={openQuickView} style={{ marginTop: 6 }}>
              <TextInput
                mono
                autoFocus
                value={quickId}
                onChange={(e) => { setQuickId(e.target.value); setQuickError(null); }}
                placeholder="1AKE or AST-0001"
                aria-label="PDB ID or temporary ID"
                spellCheck={false}
              />
              <Button type="submit" variant="secondary" size="sm" icon="viewer" disabled={quickBusy || !quickId.trim()} style={{ width: "100%", marginTop: 8 }}>
                {quickBusy ? "Opening…" : "Open"}
              </Button>
              {quickError ? (
                <div role="alert" style={{ fontSize: 11, color: "var(--coral)", marginTop: 8, lineHeight: 1.5, wordBreak: "break-word" }}>{quickError}</div>
              ) : (
                <FieldHint>A PDB ID, or a temporary ID from the Import page. The structure opens here without an analysis.</FieldHint>
              )}
            </form>
          )}
        </div>
      </div>

      {!selected ? (
        <div style={{ flex: 1, display: "flex" }}>
          <EmptyState icon="viewer" title="Select an analysis" description="Choose a completed analysis on the left to load it into the viewer, or open any structure with Quick View." />
        </div>
      ) : (
        <>
          <div style={{ flex: 1, position: "relative" }}>
            <div ref={setMountNode} style={{ position: "absolute", inset: 0 }} />
            {libraryMissing ? (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 30 }}>
                <EmptyState icon="alertTriangle" title="3D renderer failed to load" description="renderer/vendor/3Dmol-min.js is missing. Run scripts/vendor-deps.sh (needs internet access once), then relaunch Astra3." />
              </div>
            ) : (
              <>
                {loading && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,10,22,0.7)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-1)", fontSize: 13 }}><Spinner size={16} />Loading structure…</div>
                  </div>
                )}
                {loadError && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 30, background: "rgba(10,8,14,0.85)" }}>
                    <div style={{ maxWidth: 480, background: "var(--bg-2)", border: "1px solid var(--coral)", borderRadius: "var(--radius-lg)", padding: 20, boxShadow: "var(--shadow-lg)" }}>
                      <EmptyState icon="alertTriangle" title="Could not load structure" description={loadError} />
                    </div>
                  </div>
                )}
              </>
            )}
            <div style={{ position: "absolute", top: 14, left: 14, display: "flex", alignItems: "center", gap: 10 }}>
              <span className="mono" style={{ fontSize: 13, fontWeight: 700, background: "var(--bg-2)", padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--line-0)" }}>{selected.label}{selected.kind === "quickview" && selected.name ? ` · ${selected.name}` : ""}</span>
            </div>
            <div style={{ position: "absolute", bottom: 14, left: 14, right: 14, fontSize: 11, color: "var(--text-2)", lineHeight: 1.6, pointerEvents: "none" }}>
              Drag to orbit · drag near an edge to rotate · middle-click/ctrl+drag to pan · scroll to zoom ·
              click an atom to select · shift+click for several
            </div>
            {/* Hover readout, bottom right. Falls back to the current selection when
                nothing is under the pointer, so it stays readable while orbiting. */}
            {(hoveredAtom || selection) && (
              <div className="mono" style={{
                // Raised above the controls hint rather than sharing its
                // line: the two overlapped whenever a selection was active,
                // and the hint is what a newcomer needs to still be able to
                // read.
                position: "absolute", bottom: 46, right: 14, maxWidth: 300,
                fontSize: 11, lineHeight: 1.6, textAlign: "right",
                background: "var(--bg-2)", border: "1px solid var(--line-0)",
                borderRadius: "var(--radius-sm)", padding: "8px 11px",
                boxShadow: "var(--shadow-sm)", pointerEvents: "none",
              }}>
                {(() => {
                  const a = hoveredAtom || selection;
                  const isSel = !hoveredAtom && selection;
                  return (
                    <>
                      <div style={{ color: "var(--text-0)", fontWeight: 600 }}>
                        {a.resn} {a.resi}
                        <span style={{ color: "var(--text-2)", fontWeight: 400 }}> · chain {a.chain}</span>
                      </div>
                      <div style={{ color: "var(--text-1)" }}>
                        {a.atomName}{a.elem ? ` (${a.elem})` : ""}{a.hetflag ? " · hetero" : ""}
                      </div>
                      <div style={{ color: isSel ? "var(--gold)" : "var(--text-2)", fontSize: 10, marginTop: 2 }}>
                        {isSel ? "Selected. Click again to clear" : "Click to select"}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
            <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 6 }}>
              <Tooltip text={libraryMissing ? "" : (autoSpin ? "Stop auto-rotation" : "Start auto-rotation")}>
                <IconButton name="refresh" active={autoSpin} disabled={libraryMissing} onClick={() => setAutoSpin(!autoSpin)} />
              </Tooltip>
              <Tooltip text={libraryMissing ? "" : "Reset view, colors and representations"}>
                <IconButton name="cube" disabled={libraryMissing} onClick={resetEverything} />
              </Tooltip>
              {selected?.engine !== "astra3" && selected?.kind !== "quickview" && <Button variant="secondary" size="sm" icon="cube" onClick={openSession}>Open session</Button>}
              <Button variant="secondary" size="sm" icon="image" onClick={takeScreenshot}>Screenshot</Button>
            </div>
          </div>

          <div style={{ width: 260, borderLeft: "1px solid var(--line-0)", padding: 16, overflowY: "auto", flexShrink: 0 }}>
            <SectionLabel>Representation</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
              {[["cartoon", "layers"], ["surface", "cube"], ["sticks", "grip"], ["spheres", "dot"], ["lines", "termini"]].map(([mode, icon]) => (
                <button key={mode} onClick={() => setRepMode(mode)} style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: "var(--radius-md)", border: "none", cursor: "pointer",
                  background: repMode === mode ? "var(--accent-wash)" : "transparent", color: repMode === mode ? "var(--accent-bright)" : "var(--text-1)", fontSize: 12.5, fontWeight: 500, textTransform: "capitalize",
                }}>
                  <Icon name={icon} size={14} />{mode}
                </button>
              ))}
            </div>

            <SectionLabel>Camera</SectionLabel>
            <div style={{ marginBottom: 20 }}>
              <VisRow label="Auto-rotate" checked={autoSpin} onChange={setAutoSpin} />
            </div>

            <CollapsibleSection title="Visibility" style={{ marginBottom: 20 }}>
              {/* Protein chains only: the master switch leaves nucleic chains to the
                  DNA/RNA toggle. */}
              {proteinChains.length > 0 && (
                <>
                  {/* A one-chain structure gets a single row rather than a master toggle and an
                      expander listing one chain. */}
                  {proteinChains.length === 1 ? (
                    <VisRow
                      label={`Protein Chain (${proteinChains[0].chainLetter || proteinChains[0].id})`}
                      checked={visibility.chains[proteinChains[0].id] !== false}
                      onChange={() => toggleChainVis(proteinChains[0].id)}
                    />
                  ) : (
                    /* The master switch only; individual chains are toggled in the Chains
                       section. */
                    <VisRow
                      label={`Protein Chains (${proteinChains.length})`}
                      checked={proteinChains.some((c) => visibility.chains[c.id] !== false)}
                      onChange={(v) => setVisibility((st) => ({
                        ...st,
                        chains: { ...st.chains, ...Object.fromEntries(proteinChains.map((c) => [c.id, v])) },
                      }))}
                    />
                  )}
                </>
              )}
              {realLigandGroups.length > 0 && (
                <VisRow
                  label="Ligands"
                  checked={anyGroupVisible(realLigandGroups)}
                  onChange={(v) => setGroupVis(realLigandGroups, v, "ligands")}
                />
              )}
              {/* Each only offered when the structure contains it. */}
              {hetGroups.some((g) => g.isIon) && (
                <VisRow
                  label="Ions"
                  checked={anyGroupVisible(ionGroups)}
                  onChange={(v) => setGroupVis(ionGroups, v, "ions")}
                />
              )}
              {nucleicChains.length > 0 && (
                <VisRow label={`DNA / RNA (${nucleicChains.length})`} checked={visibility.nucleic} onChange={(v) => setVisibility((st) => ({ ...st, nucleic: v }))} />
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Chains" count={chains.length || ""}>
            {chains.length === 0 && !loading && <div style={{ fontSize: 11.5, color: "var(--text-2)" }}>No chain data loaded yet.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {chains.map((c) => (
                <React.Fragment key={c.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 2px" }}>
                  <button onClick={() => toggleChainVis(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: visibility.chains[c.id] !== false ? "var(--text-0)" : "var(--text-2)" }}>
                    <Icon name={visibility.chains[c.id] !== false ? "eye" : "eyeOff"} size={14} />
                  </button>
                  {/* "Chain A", or "3FXI (Chain A)" when a letter repeats in a multi-structure
                      file and the IDs are known (see groupIdsForLabels). */}
                  <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>
                    {chainDisplayLabel(c, groupIdsForLabels)}
                  </span>
                  <button onClick={() => setColorTarget(colorTarget?.kind === "chain" && colorTarget.key === c.id ? null : { kind: "chain", key: c.id })} style={{
                    width: 18, height: 18, borderRadius: 5, background: chainColors[c.id] || "#AB7ADF", border: "1.5px solid var(--line-1)", cursor: "pointer",
                  }} />
                </div>
                <ChainHetRows
                  entry={chainHets[c.id]}
                  open={!closedChainHets[c.id]}
                  onToggleOpen={() => setClosedChainHets((s) => ({ ...s, [c.id]: !s[c.id] }))}
                  isVisible={anyGroupVisible}
                  onSetVisible={setGroupVis}
                />
                </React.Fragment>
              ))}
            </div>
            {colorTarget?.kind === "chain" && (() => {
              const key = colorTarget.key;
              const label = chains.find((c) => c.id === key);
              return (
                <RecolorPanel
                  title={`Recolor chain ${label?.chainLetter || key}`}
                  color={chainColors[key]}
                  fallback="#AB7ADF"
                  onPick={(hex) => setChainColor(key, hex)}
                  rep={itemReps[key]}
                  onRep={(r) => setItemRep(key, r)}
                  defaultRepLabel={repMode}
                />
              );
            })()}

            </CollapsibleSection>

            {ionGroups.length > 0 && (
              <CollapsibleSection title="Ions" count={ionGroups.length} style={{ marginTop: 20 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {ionGroups.map((g, i) => {
                    const ionKey = g.resn + "|" + g.resi + "|" + g.chain;
                    const defaultColor = VIEWER_LIGAND_COLORS[i % VIEWER_LIGAND_COLORS.length];
                    return (
                      <div key={ionKey} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--text-1)", padding: "3px 0", opacity: isGroupHidden(ionKey) ? 0.45 : 1 }}>
                        <button onClick={() => toggleGroupVis(ionKey)} title={isGroupHidden(ionKey) ? "Show" : "Hide"} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", color: isGroupHidden(ionKey) ? "var(--text-2)" : "var(--text-0)" }}>
                          <Icon name={isGroupHidden(ionKey) ? "eyeOff" : "eye"} size={13} />
                        </button>
                        <button onClick={() => setColorTarget(colorTarget?.kind === "ion" && colorTarget.key === ionKey ? null : { kind: "ion", key: ionKey })} style={{
                          width: 14, height: 14, borderRadius: "50%", background: ligandColors[ionKey] || defaultColor,
                          border: "1.5px solid var(--line-1)", cursor: "pointer", flexShrink: 0, padding: 0,
                        }} />
                        <span className="mono">{g.resn}</span>
                        <span style={{ color: "var(--text-2)" }}>chain {g.chainLetter || g.chain}, res {g.resi}</span>
                      </div>
                    );
                  })}
                </div>
                {colorTarget?.kind === "ion" && (() => {
                  const key = colorTarget.key;
                  const idx = ionGroups.findIndex((g) => (g.resn + "|" + g.resi + "|" + g.chain) === key);
                  if (idx < 0) return null;
                  const target = ionGroups[idx];
                  return (
                    <RecolorPanel
                      title={`Recolor ${target.resn} (chain ${target.chainLetter || target.chain}, res ${target.resi})`}
                      color={ligandColors[key]}
                      fallback={VIEWER_LIGAND_COLORS[idx % VIEWER_LIGAND_COLORS.length]}
                      onPick={(hex) => setLigandColors((st) => ({ ...st, [key]: hex }))}
                      rep={itemReps[key]}
                      onRep={(r) => setItemRep(key, r)}
                      defaultRepLabel="sphere"
                    />
                  );
                })()}
              </CollapsibleSection>
            )}

            {ligandOnlyGroups.length > 0 && (
              <CollapsibleSection title="Ligands" count={ligandOnlyGroups.length} style={{ marginTop: 20 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {ligandOnlyGroups.map((g, i) => {
                    const ligandKey = g.resn + "|" + g.resi + "|" + g.chain;
                    const defaultColor = VIEWER_LIGAND_COLORS[i % VIEWER_LIGAND_COLORS.length];
                    return (
                      <div key={ligandKey} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--text-1)", padding: "3px 0", opacity: isGroupHidden(ligandKey) ? 0.45 : 1 }}>
                        <button onClick={() => toggleGroupVis(ligandKey)} title={isGroupHidden(ligandKey) ? "Show" : "Hide"} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", color: isGroupHidden(ligandKey) ? "var(--text-2)" : "var(--text-0)" }}>
                          <Icon name={isGroupHidden(ligandKey) ? "eyeOff" : "eye"} size={13} />
                        </button>
                        <button onClick={() => setColorTarget(colorTarget?.kind === "ligand" && colorTarget.key === ligandKey ? null : { kind: "ligand", key: ligandKey })} style={{
                          width: 14, height: 14, borderRadius: "50%", background: ligandColors[ligandKey] || defaultColor,
                          border: "1.5px solid var(--line-1)", cursor: "pointer", flexShrink: 0, padding: 0,
                        }} />
                        <span className="mono">{g.resn}</span>
                        <span style={{ color: "var(--text-2)" }}>chain {g.chainLetter || g.chain}, res {g.resi}</span>
                      </div>
                    );
                  })}
                </div>
                {colorTarget?.kind === "ligand" && (() => {
                  const key = colorTarget.key;
                  const idx = ligandOnlyGroups.findIndex((g) => (g.resn + "|" + g.resi + "|" + g.chain) === key);
                  if (idx < 0) return null;
                  const target = ligandOnlyGroups[idx];
                  return (
                    <RecolorPanel
                      title={`Recolor ${target.resn} (chain ${target.chainLetter || target.chain}, res ${target.resi})`}
                      color={ligandColors[key]}
                      fallback={VIEWER_LIGAND_COLORS[idx % VIEWER_LIGAND_COLORS.length]}
                      onPick={(hex) => setLigandColors((st) => ({ ...st, [key]: hex }))}
                      rep={itemReps[key]}
                      onRep={(r) => setItemRep(key, r)}
                      defaultRepLabel="stick"
                    />
                  );
                })()}
              </CollapsibleSection>
            )}

            {/* Background is its own section, after Ligands, since it is a
                scene setting rather than a visibility toggle. */}
            {/* Sits under Ligands/Ions and above Background, matching where
                the selection sits conceptually: a thing in the structure you
                can recolour, like the chains and ligands above it. */}
            {!selection && hiddenCount > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 20, fontSize: 11.5, color: "var(--text-2)" }}>
                <span>{hiddenCount} residue{hiddenCount === 1 ? "" : "s"} hidden</span>
                <Button variant="ghost" size="sm" icon="eye" onClick={() => setHiddenResidues({})}>Show all</Button>
              </div>
            )}
            {selection && (
              <>
                <SectionLabel style={{ marginTop: 20 }}>Selected</SectionLabel>
                <div style={{ background: "var(--bg-2)", borderRadius: "var(--radius-md)", padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-0)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selection.resn} {selection.resi}
                    </div>
                    <button
                      onClick={toggleSelectionHidden}
                      title={selectionHidden ? "Show the selected residues" : "Hide the selected residues"}
                      aria-label={selectionHidden ? "Show the selected residues" : "Hide the selected residues"}
                      style={{ background: "none", border: "none", padding: 2, cursor: "pointer", flexShrink: 0,
                               color: selectionHidden ? "var(--text-2)" : "var(--text-0)", display: "flex" }}
                    >
                      <Icon name={selectionHidden ? "eyeOff" : "eye"} size={14} />
                    </button>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-2)", marginBottom: 10 }}>
                    {selection.structure ? `${selection.structure} · ` : ""}chain {selection.chain} · {selection.atomName}
                    {selections.length > 1 && ` · ${selections.length} residues selected`}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-2)", marginBottom: 10 }}>
                    Shift+click to add or remove residues. Clicking empty space discards the selection.
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <input
                      type="color"
                      value={/^#[0-9A-Fa-f]{6}$/.test(selectionColor || "") ? selectionColor : "#FFFFFF"}
                      onChange={(e) => setSelectionColor(e.target.value)}
                      title="Open color wheel"
                      style={{ width: 34, height: 34, padding: 0, border: "1.5px solid var(--line-1)", borderRadius: "var(--radius-sm)", background: "none", cursor: "pointer", flexShrink: 0 }}
                    />
                    {selectionColor ? (
                      <>
                        <HexColorInput value={selectionColor} onCommit={(hex) => setSelectionColor(hex)} />
                        <Button variant="ghost" size="sm" onClick={() => setSelectionColor(null)} title="Yellow, cyan or magenta, whichever stands out from the residue and the background">Auto</Button>
                      </>
                    ) : (
                      <span style={{ fontSize: 10.5, color: "var(--text-2)", lineHeight: 1.4 }}>
                        Auto: yellow, cyan or magenta, whichever stands out from both the residue and the background
                      </span>
                    )}
                  </div>
                  {/* A dropdown, since a row per option pushed the buttons below the fold.
                      Applies to every selected residue. */}
                  <label style={{ display: "block", fontSize: 10.5, color: "var(--text-2)", marginBottom: 4 }}>
                    Representation
                  </label>
                  <select
                    value={selectionRep}
                    onChange={(e) => setSelectionRep(e.target.value)}
                    style={{
                      width: "100%", marginBottom: 10, padding: "6px 8px", fontSize: 11.5,
                      background: "var(--bg-1)", color: "var(--text-0)",
                      border: "1px solid var(--line-1)", borderRadius: "var(--radius-sm)", cursor: "pointer",
                    }}
                  >
                    {RESIDUE_REPS.map((rep) => (
                      <option key={rep.id} value={rep.id}>{rep.label}</option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button variant="secondary" size="sm" icon="check" onClick={keepSelections}
                            style={{
                              flex: 1,
                              color: "var(--sage)",
                              borderColor: "var(--sage)",
                              background: "var(--sage-wash)",
                            }}>
                      Keep colour
                    </Button>
                    {/* Abandons the selection, including colours from an earlier pass. */}
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="x"
                      onClick={() => {
                        setPaintedResidues((prev) => {
                          const next = { ...prev };
                          for (const sel of selections) delete next[sel.key];
                          return next;
                        });
                        resetSelections();
                      }}
                      style={{
                        flex: 1,
                        color: "var(--coral)",
                        borderColor: "var(--coral)",
                        background: "var(--coral-wash)",
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </>
            )}

            <SectionLabel style={{ marginTop: 20 }}>Background</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 2px" }}>
              <span style={{ fontSize: 12.5, color: "var(--text-0)" }}>Background color</span>
              <button onClick={() => setColorTarget(colorTarget?.kind === "background" ? null : { kind: "background", key: "background" })} style={{
                width: 18, height: 18, borderRadius: 5, background: backgroundColor, border: "1.5px solid var(--line-1)", cursor: "pointer",
              }} />
            </div>
            {colorTarget?.kind === "background" && (
              <div style={{ marginTop: 6, padding: 10, background: "var(--bg-2)", borderRadius: "var(--radius-md)" }}>
                <div style={{ fontSize: 11, color: "var(--text-1)", marginBottom: 10 }}>Viewer background</div>

                {/* The native picker and a hex field, as for chain recolouring. */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <input
                    type="color"
                    value={/^#[0-9A-Fa-f]{6}$/.test(backgroundColor || "") ? backgroundColor : "#0F0A16"}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    title="Open color wheel"
                    style={{
                      width: 34, height: 34, padding: 0, border: "1.5px solid var(--line-1)", borderRadius: "var(--radius-sm)",
                      background: "none", cursor: "pointer", flexShrink: 0,
                    }}
                  />
                  <HexColorInput value={backgroundColor} onCommit={setBackgroundColor} />
                </div>

                {/* Preset swatches from white to black. */}
                <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Quick select</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["#FFFFFF", "#D9D9D9", "#B0B0B0", "#808080", "#4A4A4A", "#26222E", "#0F0A16", "#000000"].map((c) => (
                    <Tooltip key={c} text={c} align="left">
                      <button onClick={() => setBackgroundColor(c)} style={{
                        width: 20, height: 20, borderRadius: 6, background: c,
                        border: backgroundColor?.toUpperCase() === c ? "2px solid var(--accent-bright)" : "1.5px solid var(--line-1)", cursor: "pointer",
                      }} />
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function downloadDataUri(dataUri, filename) {
  const a = document.createElement("a");
  a.href = dataUri;
  a.download = filename;
  a.click();
}

// Ligands and ions grouped under the chain they belong to: the chain with the
// same chain letter in the same structure. Structure tags decide when the file
// has them; otherwise the nearest chain with that letter earlier in the file
// does, which is where a structure's own ligands follow its protein atoms.
// A group with no such chain is left out here and stays in the Ligands and
// Ions sections, rather than being attached to a chain it may not belong to.
function hetGroupsByChain(chains, hetGroups) {
  const firstSerial = (item) => (item.serials && item.serials.length ? item.serials[0] : Infinity);
  const byChain = {};
  for (const g of hetGroups) {
    if (g.resn === "HOH") continue;
    const candidates = chains.filter((c) => c.chainLetter === g.chainLetter
      && (!c.structureLabel || !g.structureLabel || c.structureLabel === g.structureLabel));
    if (!candidates.length) continue;
    const start = firstSerial(g);
    const earlier = candidates.filter((c) => firstSerial(c) <= start);
    const owner = earlier.length
      ? earlier.reduce((best, c) => (firstSerial(c) > firstSerial(best) ? c : best))
      : candidates[0];
    if (!byChain[owner.id]) byChain[owner.id] = { ligands: [], ions: [] };
    byChain[owner.id][g.isIon ? "ions" : "ligands"].push(g);
  }
  return byChain;
}

// The ligands and ions bound to one chain, listed under that chain so the chain
// and what it carries can be hidden together. Open by default, with one switch
// per kind rather than one row per molecule; the residue names are shown so
// it is clear what each switch covers.
function ChainHetRows({ entry, open, onToggleOpen, isVisible, onSetVisible }) {
  if (!entry) return null;
  const kinds = [["Ligands", entry.ligands, "ligands"], ["Ions", entry.ions, "ions"]].filter(([, list]) => list.length > 0);
  if (!kinds.length) return null;
  const names = (list) => [...new Set(list.map((g) => g.resn))].join(", ");
  return (
    <div style={{ marginLeft: 22, marginBottom: 4 }}>
      <button onClick={onToggleOpen} aria-expanded={open} style={{
        background: "none", border: "none", cursor: "pointer", padding: "0 0 2px 0",
        display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--text-2)",
      }}>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />
        Bound to this chain
      </button>
      {open && kinds.map(([label, list, flag]) => {
        const shown = isVisible(list);
        return (
          <div key={flag} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0 2px 16px" }}>
            <button onClick={() => onSetVisible(list, !shown, flag)}
              title={`${shown ? "Hide" : "Show"} this chain's ${label.toLowerCase()}`}
              style={{ background: "none", border: "none", cursor: "pointer", color: shown ? "var(--text-0)" : "var(--text-2)" }}>
              <Icon name={shown ? "eye" : "eyeOff"} size={13} />
            </button>
            <span style={{ fontSize: 12, color: shown ? "var(--text-0)" : "var(--text-2)" }}>{label} ({list.length})</span>
            <span style={{ fontSize: 11, color: "var(--text-2)", flex: 1, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {names(list)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function VisRow({ label, checked, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
      <span style={{ fontSize: 12.5, color: "var(--text-0)" }}>{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

// The recolour panel, rendered inside whichever section owns the item being
// recoloured, so it opens beside what was clicked.
function RecolorPanel({ title, color, fallback, onPick, rep, onRep, defaultRepLabel }) {
  const active = color || fallback;
  return (
    <div style={{ marginTop: 10, padding: 10, background: "var(--bg-2)", borderRadius: "var(--radius-md)" }}>
      <div style={{ fontSize: 11, color: "var(--text-1)", marginBottom: 10 }}>{title}</div>

      {/* The native colour picker, plus a hex field for typing a code. Both write
          the same state as the swatches. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <input
          type="color"
          value={/^#[0-9A-Fa-f]{6}$/.test(active) ? active : fallback}
          onChange={(e) => onPick(e.target.value)}
          title="Open color wheel"
          style={{
            width: 34, height: 34, padding: 0, border: "1.5px solid var(--line-1)", borderRadius: "var(--radius-sm)",
            background: "none", cursor: "pointer", flexShrink: 0,
          }}
        />
        {/* Sized for a seven-character hex code. */}
        <HexColorInput value={active} onCommit={onPick} width={104} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {CHAIN_COLOR_GROUPS.map((group) => (
          <div key={group.label}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{group.label}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {group.colors.map((c) => (
                <Tooltip key={c} text={c} align="left">
                  <button onClick={() => onPick(c)} style={{
                    width: 20, height: 20, borderRadius: 6, background: c,
                    border: active === c ? "2px solid var(--text-0)" : "1.5px solid var(--line-1)", cursor: "pointer",
                  }} />
                </Tooltip>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Representation for one chain, ligand or ion, as opposed to the buttons at
          the top, which set every protein chain. "Default" clears the override. */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Representation</div>
        <select
          value={rep || ""}
          onChange={(e) => onRep(e.target.value || null)}
          style={{
            width: "100%", padding: "6px 8px", fontSize: 11.5,
            background: "var(--bg-1)", color: "var(--text-0)",
            border: "1px solid var(--line-1)", borderRadius: "var(--radius-sm)", cursor: "pointer",
          }}
        >
          <option value="">Default ({defaultRepLabel})</option>
          {RESIDUE_REPS.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// Hex text entry beside the colour wheel. Keeps a draft while typing and
// commits only a valid #RGB or #RRGGBB, expanded to six digits.
function HexColorInput({ value, onCommit, width }) {
  const [draft, setDraft] = useState(value);
  const lastCommitted = useRef(value);

  useEffect(() => {
    if (value !== lastCommitted.current) {
      setDraft(value);
      lastCommitted.current = value;
    }
  }, [value]);

  const normalize = (raw) => {
    let v = raw.trim();
    if (!v.startsWith("#")) v = "#" + v;
    if (/^#[0-9A-Fa-f]{3}$/.test(v)) {
      v = "#" + v.slice(1).split("").map((c) => c + c).join("");
    }
    return /^#[0-9A-Fa-f]{6}$/.test(v) ? v.toUpperCase() : null;
  };

  const commit = () => {
    const normalized = normalize(draft);
    if (normalized) {
      lastCommitted.current = normalized;
      setDraft(normalized);
      onCommit(normalized);
    } else {
      setDraft(value); // invalid: revert to the last valid colour
    }
  };

  const isValid = normalize(draft) !== null;

  return (
    <TextInput
      mono
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { commit(); e.target.blur(); } }}
      placeholder="#RRGGBB"
      maxLength={7}
      style={{
        width: width || undefined, flex: width ? "0 0 auto" : 1, fontSize: 12,
        borderColor: isValid ? undefined : "var(--coral)",
      }}
    />
  );
}

/* ============================================================
   SETTINGS PAGE
   ============================================================ */
function SettingsPage() {
  const { settings, updateSettings, isElectron, engineInfo } = useApp();
  const toast = useToast();
  const save = () => toast.push({ tone: "success", title: "Settings saved" });

  // Whether the PyMOL path below exists, checked whenever it changes. null
  // means not checked yet.
  const [pymolVerified, setPymolVerified] = useState(null);

  // The saved path, as opposed to settings.pymolPath, which follows the field
  // while typing. A restart is only offered when the saved value would change.
  const [savedPymolPath, setSavedPymolPath] = useState(null);
  // Set when a candidate path (from Browse or the text field's onBlur)
  // differs from savedPymolPath, holding it until the person confirms or
  // cancels the restart prompt below. null when no change is pending.
  const [pendingPymolPath, setPendingPymolPath] = useState(null);
  const [pathValidating, setPathValidating] = useState(false);
  const [pathValidationError, setPathValidationError] = useState(null);

  useEffect(() => {
    if (!isElectron) return;
    window.astra3Native.getPymolPath().then((p) => {
      // Blank when PyMOL is not on this computer, rather than a location
      // that does not exist.
      updateSettings({ pymolPath: p || "" });
      setSavedPymolPath(p || null);
    }).catch(() => {
      // Reading the saved path failed. Left as-is rather than cleared: the
      // value already on screen is the best guess available, and blanking it
      // would look like the setting had been lost. Without this the rejection
      // was simply unhandled and nothing here ever ran again.
    });
    // Read again whenever PyMOL's availability changes (see EngineSettings).
  }, [isElectron, engineInfo.available?.pymol]);

  useEffect(() => {
    if (!isElectron || !settings.pymolPath) { setPymolVerified(null); return; }
    let cancelled = false;
    window.astra3Native.verifyPymolPath(settings.pymolPath)
      .then((ok) => { if (!cancelled) setPymolVerified(ok); })
      // null, not false: "the check itself failed" is not the same as "the
      // path is wrong", and showing a confident red cross for a check that
      // never completed would send someone fixing a setting that is fine.
      .catch(() => { if (!cancelled) setPymolVerified(null); });
    return () => { cancelled = true; };
  }, [isElectron, settings.pymolPath]);

  // A path that differs from the saved one goes through the restart prompt:
  // the bridge reads the saved path only when it starts PyMOL, so a running
  // process would keep the old one.
  const requestPymolPathChange = (candidate, fromBrowse = false) => {
    if (!candidate) return;
    if (candidate === savedPymolPath) {
      // Nothing changes, so there is nothing to restart for.
      if (fromBrowse) toast.push({ tone: "neutral", title: "PyMOL location unchanged", message: "Astra3 is already using this PyMOL." });
      return;
    }
    setPathValidationError(null);
    setPendingPymolPath(candidate);
  };

  const confirmPymolPathChange = async () => {
    if (!pendingPymolPath || pathValidating) return;
    // Now validated the same two-stage way PymolSetupDialog's own confirm()
    // is.
    setPathValidating(true);
    setPathValidationError(null);
    const check = await checkEnginePath("pymol", pendingPymolPath);
    if (check.error) {
      setPathValidating(false);
      setPathValidationError(check.error);
      return;
    }
    await window.astra3Native.setPymolPath(pendingPymolPath);
    await window.astra3Native.restartApp();
    // main.js exits right after relaunch().
  };

  const cancelPymolPathChange = () => {
    // Show the saved value again.
    if (savedPymolPath) updateSettings({ pymolPath: savedPymolPath });
    setPendingPymolPath(null);
    setPathValidationError(null);
  };

  const browsePymol = async () => {
    if (!isElectron) { toast.push({ tone: "neutral", title: "Native picker", message: "Available in the desktop app." }); return; }
    const picked = await window.astra3Native.openPymolExecutableDialog();
    if (picked) {
      updateSettings({ pymolPath: picked });
      requestPymolPathChange(picked, true);
    }
  };

  const browseOutputDir = async () => {
    if (!isElectron) { toast.push({ tone: "neutral", title: "Native picker", message: "Available in the desktop app." }); return; }
    const picked = await window.astra3Native.openFolderDialog();
    if (picked) commitOutputDir(picked);
  };

  // The field shows the folder as the main process saved it, or reverts if
  // the folder was refused.
  const outputDirAtFocus = useRef(null);
  const commitOutputDir = async (candidate) => {
    if (!isElectron) return;
    let result;
    try {
      result = await window.astra3Native.setOutputDir(candidate);
    } catch (e) {
      result = { ok: false, error: e?.message || "The output folder could not be changed." };
    }
    if (result && result.ok) {
      updateSettings({ outputDir: result.dir });
      return;
    }
    const current = await window.astra3Native.getOutputDir().catch(() => null);
    if (current) updateSettings({ outputDir: current });
    toast.push({
      tone: "error",
      title: "Output folder not changed",
      message: `${(result && result.error) || "That folder can't hold results."}${current ? `\n\nResults are still saved in:\n${current}` : ""}`,
      duration: 9000,
    });
  };

  return (
    <PageScroll>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 32px 60px" }}>
        <Card style={{ padding: 22, marginBottom: 16 }}>
          <SectionLabel>Defaults</SectionLabel>
          <SettingRow label="Default render quality" desc="Used for new Single Structure / Overlay / Termini runs">
            <SegmentedControl value={settings.defaultQuality} onChange={(v) => updateSettings({ defaultQuality: v })} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "excellent", label: "Excellent" }]} />
          </SettingRow>
          <SettingRow label="Default fetch format" desc={settings.defaultFormat === "pdb" ? "Legacy PDB is tried first; Astra3 falls back to mmCIF automatically if unavailable" : "mmCIF is tried first; Astra3 falls back to legacy PDB automatically if unavailable"}>
            <SegmentedControl
              value={settings.defaultFormat}
              onChange={(v) => updateSettings({ defaultFormat: v })}
              options={settings.defaultFormat === "pdb"
                ? [{ value: "pdb", label: "Legacy PDB" }, { value: "cif", label: "mmCIF" }]
                : [{ value: "cif", label: "mmCIF" }, { value: "pdb", label: "Legacy PDB" }]}
            />
          </SettingRow>
          <SettingRow label="Default output directory" stacked>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TextInput mono icon="folder" value={settings.outputDir} onFocus={(e) => { outputDirAtFocus.current = e.target.value; }} onChange={(e) => updateSettings({ outputDir: e.target.value })} onBlur={(e) => { if (e.target.value !== outputDirAtFocus.current) commitOutputDir(e.target.value); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </div>
              <Button variant="secondary" onClick={browseOutputDir}>Browse</Button>
            </div>
          </SettingRow>
        </Card>

        <EngineSettings>
          <SettingRow label={<><EngineDot engine="pymol" />PyMOL location</>} desc="Changing this restarts Astra3." stacked>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TextInput
                  mono icon="cube" value={settings.pymolPath} placeholder="Not found"
                  onChange={(e) => updateSettings({ pymolPath: e.target.value })}
                  onBlur={(e) => { if (isElectron) requestPymolPathChange(e.target.value); }}
                />
              </div>
              <Button variant="secondary" onClick={browsePymol}>Browse</Button>
            </div>
            {isElectron && pymolVerified === false && (
              <FieldHint>PyMOL was not found at this path. Install PyMOL from pymol.org if you haven't, or Browse to its actual location.</FieldHint>
            )}
            {isElectron && !settings.pymolPath && (
              <FieldHint>PyMOL was not found on this computer. Install it from pymol.org, or Browse to it.</FieldHint>
            )}
          </SettingRow>
        </EngineSettings>
        <DrawingWindowSettings />

        {pendingPymolPath && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}>
            <div className="astra-modal-in" style={{ width: "min(440px, 90vw)", background: "var(--bg-1)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <Icon name="alertTriangle" size={18} style={{ color: "var(--amber)" }} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>Restart Astra3?</span>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.6, margin: "0 0 20px" }}>
                Changing the PyMOL executable location requires Astra3 to restart so the new path takes effect everywhere. Astra3 will close and reopen automatically.
              </p>
              {pathValidationError && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, color: "var(--coral)", fontSize: 12 }}>
                  <Icon name="alertTriangle" size={13} style={{ flexShrink: 0 }} />
                  {pathValidationError}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button variant="secondary" onClick={cancelPymolPathChange} disabled={pathValidating}>Cancel</Button>
                <Button variant="primary" onClick={confirmPymolPathChange} disabled={pathValidating}>
                  {pathValidating ? <><Spinner size={14} />Checking…</> : "Restart now"}
                </Button>
              </div>
            </div>
          </div>
        )}

        <Card style={{ padding: 22, marginBottom: 16 }}>
          <SectionLabel>Behavior</SectionLabel>
          <SettingRow label="Auto-open report" desc="Open the HTML report automatically when an analysis finishes">
            <Toggle checked={settings.autoOpenReport} onChange={(v) => updateSettings({ autoOpenReport: v })} />
          </SettingRow>
          <SettingRow label="Auto-open session" desc="Open the generated session when an analysis finishes">
            <Toggle checked={settings.autoOpenSession} onChange={(v) => updateSettings({ autoOpenSession: v })} />
          </SettingRow>
          <SettingRow label="Confirm before large batch runs" desc="Ask before running a batch of 10+ structures">
            <Toggle checked={settings.confirmBeforeBatch} onChange={(v) => updateSettings({ confirmBeforeBatch: v })} />
          </SettingRow>
          <SettingRow label="Completion sound" desc="Play a short sound alongside the glow when an analysis finishes">
            <Toggle checked={settings.completionSound} onChange={(v) => updateSettings({ completionSound: v })} />
          </SettingRow>
        </Card>

        <Card style={{ padding: 22 }}>
          <SectionLabel>Appearance</SectionLabel>
          <SettingRow label="Theme" desc="Applies immediately across the whole app">
            <SegmentedControl value={settings.theme} onChange={(v) => updateSettings({ theme: v })} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} />
          </SettingRow>
          <SettingRow label="Content font" desc="Body text, card copy, and descriptions. Tabs and inputs keep their own fixed typeface and are unaffected.">
            {/* A native <select>: the OS draws the open list, so it never runs off
                screen. Grouped into bundled and system fonts. */}
            <select
              value={settings.contentFont}
              onChange={(e) => updateSettings({ contentFont: e.target.value })}
              style={{
                width: "100%", maxWidth: 280, background: "var(--bg-0)", border: "1px solid var(--line-1)",
                borderRadius: "var(--radius-md)", color: "var(--text-0)", padding: "9px 10px",
                fontSize: 13, fontFamily: "var(--font-ui)", outline: "none", cursor: "pointer",
              }}
            >
              {CONTENT_FONT_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((opt) => (
                    <option key={opt.label} value={opt.label}>{opt.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </SettingRow>
        </Card>

        <Button variant="primary" size="lg" onClick={save} style={{ marginTop: 20 }}>Save Settings</Button>
      </div>
    </PageScroll>
  );
}

// Settings > Analysis engine: which engine analyses run with, and where PyMOL
// and ChimeraX are installed. Each location is blank when that program was not
// found and accepts only its own program. The PyMOL row is passed in as
// children: it shares the Settings page's PyMOL state and restart prompt.
function EngineSettings({ children }) {
  const { isElectron, engineInfo, switchEngine, refreshEngineStatus, rememberEngineVersion, isBusy } = useApp();
  const toast = useToast();
  const [cxPath, setCxPath] = useState("");
  const [cxSaved, setCxSaved] = useState(null);
  // null: nothing checked; "checking"; { version } when it is ChimeraX; { error } when not.
  const [cxState, setCxState] = useState(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!isElectron || !window.astra3Native.getChimeraxPath) return;
    window.astra3Native.getChimeraxPath().then((p) => {
      setCxPath(p || "");
      setCxSaved(p || null);
      if (!p) return;
      window.astra3Native.chimeraxVersion(p).then((v) => {
        if (v) { setCxState({ version: v }); rememberEngineVersion("chimerax", v); }
      }).catch(() => {});
    }).catch(() => {});
    // Read again whenever ChimeraX's availability changes, as when it is set
    // up from the setup dialog: this page stays mounted from launch.
  }, [isElectron, engineInfo.available?.chimerax]);

  const applyChimeraxPath = async (candidate) => {
    const value = String(candidate || "").trim();
    if (!value || value === cxSaved) return;
    setCxPath(value);
    setCxState("checking");
    const check = await checkEnginePath("chimerax", value);
    if (check.error) {
      setCxState({ error: check.error });
      toast.push({ tone: "error", title: "Not ChimeraX", message: check.error });
      return;
    }
    const saved = await window.astra3Native.setChimeraxPath(value);
    setCxPath(saved);
    setCxSaved(saved);
    setCxState({ version: check.version });
    rememberEngineVersion("chimerax", check.version);
    await refreshEngineStatus();
    toast.push({ tone: "success", title: "ChimeraX location saved", message: `ChimeraX v${check.version}` });
  };

  const browse = async () => {
    if (!isElectron) { toast.push({ tone: "neutral", title: "Native picker", message: "Available in the desktop app." }); return; }
    const picked = await window.astra3Native.openChimeraxExecutableDialog();
    if (picked) applyChimeraxPath(picked);
  };

  const choose = async (value) => {
    if (value === engineInfo.engine && !engineInfo.none) return;
    if (!engineInfo.available?.[value]) {
      toast.push({ tone: "error", title: `${ENGINE_NAMES[value]} not set up`, message: `Enter the ${ENGINE_NAMES[value]} location below first.` });
      return;
    }
    setSwitching(true);
    try {
      await switchEngine(value);
    } catch (e) {
      toast.push({ tone: "error", title: "Engine not switched", message: e.message });
    } finally {
      setSwitching(false);
    }
  };

  const cxHint = cxState === "checking" ? "Checking…"
    : cxState?.error ? cxState.error
    : cxState?.version ? `ChimeraX v${cxState.version} found.`
    : cxPath ? null
    : "ChimeraX was not found on this computer. Install it from cgl.ucsf.edu/chimerax, or Browse to it.";

  return (
    <Card style={{ padding: 22, marginBottom: 16 }}>
      <SectionLabel>Analysis engine</SectionLabel>
      <SettingRow label="Engine" desc="Used for analysis and images. A switch applies from the next analysis." stacked>
        <SegmentedControl
          value={engineInfo.none ? null : engineInfo.engine}
          onChange={choose}
          disabled={isBusy || switching}
          options={[{ value: "pymol", label: "PyMOL" }, { value: "chimerax", label: "ChimeraX" }, { value: "astra3", label: "Astra3 Engine" }]}
        />
        {isBusy && <FieldHint>Finish or cancel the current run to switch.</FieldHint>}
        {engineInfo.engine === "chimerax" && !engineInfo.none && (
          <FieldHint>Measurements agree with the other engines to within rounding. ChimeraX saves sessions as .cxs.</FieldHint>
        )}
        {engineInfo.engine === "astra3" && !engineInfo.none && (
          <FieldHint>Measurements agree with the other engines to within rounding. The Astra3 Engine saves each session for PyMOL (.pse) and for ChimeraX (.cxc).</FieldHint>
        )}
      </SettingRow>
      {children}
      <SettingRow label={<><EngineDot engine="chimerax" />ChimeraX location</>} desc="Used when ChimeraX is the engine." stacked>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextInput mono icon="cube" value={cxPath} placeholder="Not found" onChange={(e) => setCxPath(e.target.value)}
              onBlur={(e) => { if (isElectron) applyChimeraxPath(e.target.value); }} />
          </div>
          <Button variant="secondary" onClick={browse}>Browse</Button>
        </div>
        {cxHint && <FieldHint>{cxHint}</FieldHint>}
      </SettingRow>
    </Card>
  );
}

// Settings > Drawing window: whether images appear in a window as they are
// made, under every engine. In the background by default; the window lists
// the images with a 3D view to turn, reset and save.
function DrawingWindowSettings() {
  const { isElectron } = useApp();
  const [engineWindowShown, setEngineWindowShown] = useState(false);
  useEffect(() => {
    if (isElectron && window.astra3Native.getEngineWindow) {
      window.astra3Native.getEngineWindow().then((v) => setEngineWindowShown(!!v)).catch(() => {});
    }
  }, [isElectron]);
  if (!isElectron || !window.astra3Native.getEngineWindow) return null;
  return (
    <Card style={{ padding: 22, marginBottom: 16 }}>
      <SectionLabel>Drawing window</SectionLabel>
      <SettingRow label="Images" desc="For every engine; the images are the same either way. The window lists each image as it is made; choosing one turns its 3D view to that image's camera." stacked>
        <SegmentedControl
          value={engineWindowShown ? "window" : "background"}
          onChange={(v) => {
            const shown = v === "window";
            setEngineWindowShown(shown);
            window.astra3Native.setEngineWindow(shown).catch(() => {});
          }}
          options={[{ value: "background", label: "In the background" }, { value: "window", label: "In a window" }]}
        />
      </SettingRow>
    </Card>
  );
}

function SettingRow({ label, desc, children, stacked }) {
  return (
    <div style={{ display: stacked ? "block" : "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "13px 0", borderTop: "1px solid var(--line-0)" }}>
      <div style={{ marginBottom: stacked ? 8 : 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 11.5, color: "var(--text-1)", marginTop: 2 }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}

/* ============================================================
   COLOR PALETTE PAGE
   ============================================================ */
// PyMOL colour names the page offers, with their RGB as PyMOL defines them.
// astra3_core.PALETTE_NAMED_COLORS lists the same names, and the ChimeraX
// engine defines each one, so a named colour looks the same in either engine.
// Any other colour is saved as #RRGGBB.
const PALETTE_HEX = {
  grey90: "#E8E8E8", grey80: "#CECECE", grey70: "#B4B4B4", grey60: "#9B9B9B", grey50: "#818181",
  grey40: "#676767", grey30: "#4D4D4D", wheat: "#FCD1A6", sand: "#B88C4D", brown: "#A6522B",
  chocolate: "#8E391C", dirtyviolet: "#B28080", skyblue: "#3380CC", slate: "#8080FF", deepblue: "#4040A6",
  deepteal: "#1A9999", forest: "#339933", violetpurple: "#8C4099", raspberry: "#B24D66", firebrick: "#B22121",
  yellow: "#FFFF00", hotpink: "#FF0080", marine: "#0080FF", orange: "#FF8000", purple: "#BF00BF",
  cyan: "#00FFFF", magenta: "#FF00FF", deepsalmon: "#FF8080", brightorange: "#FFB233", lightmagenta: "#FF33CC",
  tv_blue: "#4D4DFF", gold: "#FFD123", black: "#000000", lightpink: "#FFBFDE", paleyellow: "#FFFF80",
  palecyan: "#CCFFFF", lightblue: "#BFBFFF", bluewhite: "#D9D9FF", aquamarine: "#80FFFF", lightorange: "#FFCC80",
  palegreen: "#A6E5A6", pink: "#FFA6D9", salmon: "#FF9999", lightteal: "#66B2B2", green: "#00FF00",
  red: "#FF0000", tv_green: "#33FF33", tv_red: "#FF3333", blue: "#0000FF", white: "#FFFFFF",
};

// The colours astra3_core.py uses when nothing has been saved.
const DEFAULT_PALETTE = {
  chains: ["grey80", "grey60", "grey40", "brown", "wheat", "dirtyviolet", "sand", "grey90"],
  ligands: ["yellow", "hotpink", "marine", "orange", "purple", "cyan", "magenta", "deepsalmon", "black"],
  ions: ["lightpink", "paleyellow", "palecyan", "lightblue", "bluewhite", "aquamarine", "lightorange", "wheat"],
  termini: { enabled: true, n: "green", c: "red" },
  arrows: {
    reference: ["#FF8000", "#FF66B3"],
    comparisons: [["#00FFFF", "#FFFF00"], ["#3399FF", "#99FF33"], ["#FF66FF", "#FFBF33"], ["#66FFB3", "#CC80FF"], ["#FF8C66", "#80E6FF"]],
  },
};

// The default terminus arrow colours by name, for tooltips.
const ARROW_NAMES = {
  "#FF8000": "orange", "#FF66B3": "pink", "#00FFFF": "cyan", "#FFFF00": "bright yellow", "#3399FF": "azure",
  "#99FF33": "lime", "#FF66FF": "magenta", "#FFBF33": "amber", "#66FFB3": "mint", "#CC80FF": "lilac",
  "#FF8C66": "coral", "#80E6FF": "ice",
};

// Presets follow the defaults: neutral chains so ligands and termini stand
// out, vivid ligands, pastel ions, strong termini.
const PALETTE_PRESETS = {
  chains: [
    { label: "Neutral", colors: ["grey90", "grey80", "grey70", "grey60", "grey50", "grey40", "grey30", "wheat", "sand", "brown", "chocolate", "dirtyviolet"] },
    { label: "Strong", colors: ["skyblue", "slate", "deepblue", "deepteal", "forest", "violetpurple", "raspberry", "firebrick"] },
  ],
  ligands: [
    { label: "Vivid", colors: ["yellow", "hotpink", "marine", "orange", "purple", "cyan", "magenta", "deepsalmon", "brightorange", "lightmagenta", "tv_blue", "gold", "black"] },
  ],
  ions: [
    { label: "Pastel", colors: ["lightpink", "paleyellow", "palecyan", "lightblue", "bluewhite", "aquamarine", "lightorange", "wheat", "palegreen", "pink", "salmon", "lightteal"] },
  ],
  termini: [
    { label: "Strong", colors: ["green", "red", "tv_green", "tv_red", "blue", "marine", "orange", "yellow", "magenta", "cyan", "purple", "white"] },
  ],
  arrows: [
    { label: "Bright", colors: Object.keys(ARROW_NAMES) },
  ],
};

const PALETTE_MAX_COLORS = 24;

const paletteHex = (color) => PALETTE_HEX[color] || color;
const paletteName = (color) => ARROW_NAMES[color] || color;
const samePalette = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function PaletteChip({ color, selected, onClick, label, size = 34 }) {
  return (
    <Tooltip text={paletteName(color)}>
      <button onClick={onClick} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        <span style={{
          width: size, height: size, borderRadius: size > 30 ? 9 : 7, background: paletteHex(color),
          border: "1.5px solid var(--line-1)", transition: "box-shadow 120ms ease",
          boxShadow: selected ? "0 0 0 2px var(--bg-1), 0 0 0 4px var(--accent)" : "none",
        }} />
        {label && <span className="mono" style={{ fontSize: 10, color: selected ? "var(--accent-bright)" : "var(--text-2)" }}>{label}</span>}
      </button>
    </Tooltip>
  );
}

function PaletteEditor({ color, presets, onPick, onMove, onRemove, canMoveLeft, canMoveRight, canRemove, removeLabel = "Remove" }) {
  const hex = paletteHex(color);
  const moveButton = (dir, enabled) => (
    <button onClick={() => onMove(dir)} disabled={!enabled} className="astra-iconbtn" title={dir < 0 ? "Move earlier" : "Move later"}
      style={{ display: "flex", padding: 5, background: "none", border: "1px solid var(--line-1)", borderRadius: "var(--radius-sm)", color: "var(--text-1)", cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.4 }}>
      <Icon name="chevronRight" size={14} style={dir < 0 ? { transform: "rotate(180deg)" } : undefined} />
    </button>
  );
  return (
    <div className="astra-modal-in" style={{ marginTop: 14, padding: 14, background: "var(--bg-2)", borderRadius: "var(--radius-md)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Tooltip text="Open color wheel" align="left">
          <input type="color" value={hex.toLowerCase()} onChange={(e) => onPick(e.target.value.toUpperCase())}
            style={{ width: 34, height: 34, padding: 0, border: "1.5px solid var(--line-1)", borderRadius: "var(--radius-sm)", background: "none", cursor: "pointer", flexShrink: 0 }} />
        </Tooltip>
        <HexColorInput value={hex} onCommit={onPick} width={104} />
        {(PALETTE_HEX[color] || ARROW_NAMES[color]) && <span className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>{paletteName(color)}</span>}
        <div style={{ flex: 1 }} />
        {onMove && moveButton(-1, canMoveLeft)}
        {onMove && moveButton(1, canMoveRight)}
        {onRemove && <Button variant="danger" size="sm" icon="trash" onClick={onRemove} disabled={!canRemove}>{removeLabel}</Button>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {presets.map((group) => (
          <div key={group.label}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{group.label}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {group.colors.map((c) => (
                <Tooltip key={c} text={paletteName(c)} align="left">
                  <button onClick={() => onPick(c)} style={{
                    width: 22, height: 22, borderRadius: 6, background: paletteHex(c), cursor: "pointer",
                    border: color === c ? "2px solid var(--text-0)" : "1.5px solid var(--line-1)",
                  }} />
                </Tooltip>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaletteSection({ title, desc, colors, presets, selected, setSelected, onChange, isDefault, onReset, children }) {
  const pick = (index, color) => onChange(colors.map((c, i) => (i === index ? color : c)));
  const move = (index, dir) => {
    const next = [...colors];
    [next[index], next[index + dir]] = [next[index + dir], next[index]];
    onChange(next);
    setSelected(index + dir);
  };
  const remove = (index) => {
    onChange(colors.filter((_, i) => i !== index));
    setSelected(null);
  };
  const add = () => {
    const suggested = presets.flatMap((g) => g.colors).find((c) => !colors.includes(c)) || colors[colors.length - 1];
    onChange([...colors, suggested]);
    setSelected(colors.length);
  };
  return (
    <Card style={{ padding: 22, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <SectionLabel style={{ marginBottom: 4 }}>{title}</SectionLabel>
        <Button variant="ghost" size="sm" onClick={onReset} disabled={isDefault}>Reset</Button>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-1)", marginBottom: 14 }}>{desc}</div>
      {children || (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          {colors.map((c, i) => (
            <PaletteChip key={i} color={c} label={String(i + 1)} selected={selected === i}
              onClick={() => setSelected(selected === i ? null : i)} />
          ))}
          {colors.length < PALETTE_MAX_COLORS && (
            <Tooltip text="Add a color">
              <button onClick={add} className="astra-iconbtn" style={{
                width: 34, height: 34, borderRadius: 9, border: "1.5px dashed var(--line-1)", background: "none",
                color: "var(--text-1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}><Icon name="plus" size={15} /></button>
            </Tooltip>
          )}
        </div>
      )}
      {!children && selected !== null && selected < colors.length && (
        <PaletteEditor color={colors[selected]} presets={presets} onPick={(c) => pick(selected, c)}
          onMove={(dir) => move(selected, dir)} canMoveLeft={selected > 0} canMoveRight={selected < colors.length - 1}
          onRemove={() => remove(selected)} canRemove={colors.length > 1} />
      )}
    </Card>
  );
}

function ArrowPaletteSection({ arrows, selectedKey, select, onChange, isDefault, onReset }) {
  const pairs = [["Reference", arrows.reference], ...arrows.comparisons.map((pair, i) => [`Comparison ${i + 1}`, pair])];
  const keyOf = (pairIndex, end) => `${pairIndex}:${end}`;
  const [pairIndex, end] = selectedKey ? selectedKey.split(":").map(Number) : [null, null];
  const setColor = (pi, endIndex, color) => {
    const swap = (pair) => pair.map((c, i) => (i === endIndex ? color : c));
    onChange(pi === 0
      ? { ...arrows, reference: swap(arrows.reference) }
      : { ...arrows, comparisons: arrows.comparisons.map((pair, j) => (j === pi - 1 ? swap(pair) : pair)) });
  };
  const addPair = () => {
    const defaults = DEFAULT_PALETTE.arrows.comparisons;
    onChange({ ...arrows, comparisons: [...arrows.comparisons, defaults[arrows.comparisons.length % defaults.length]] });
  };
  const removePair = (pi) => {
    onChange({ ...arrows, comparisons: arrows.comparisons.filter((_, j) => j !== pi - 1) });
    select(null);
  };
  return (
    <Card style={{ padding: "18px 22px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <SectionLabel style={{ marginBottom: 4 }}>Termini arrows</SectionLabel>
        <Button variant="ghost" size="sm" onClick={onReset} disabled={isDefault}>Reset</Button>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-1)", marginBottom: 14 }}>
        TERMINI close-ups. The reference keeps its pair in every close-up; comparisons take the numbered pairs in order.
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end" }}>
        {pairs.map(([label, pair], pi) => (
          <div key={pi} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
            <div style={{ display: "flex", gap: 6 }}>
              {pair.map((c, endIndex) => (
                <PaletteChip key={endIndex} size={26} color={c} label={endIndex === 0 ? "N" : "C"} selected={selectedKey === keyOf(pi, endIndex)}
                  onClick={() => select(selectedKey === keyOf(pi, endIndex) ? null : keyOf(pi, endIndex))} />
              ))}
            </div>
          </div>
        ))}
        {arrows.comparisons.length < 12 && (
          <Tooltip text="Add a comparison pair">
            <button onClick={addPair} className="astra-iconbtn" style={{
              width: 26, height: 26, marginBottom: 19, borderRadius: 7, border: "1.5px dashed var(--line-1)", background: "none",
              color: "var(--text-1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}><Icon name="plus" size={13} /></button>
          </Tooltip>
        )}
      </div>
      {selectedKey && pairIndex < pairs.length && (
        <PaletteEditor color={pairs[pairIndex][1][end]} presets={PALETTE_PRESETS.arrows} onPick={(c) => setColor(pairIndex, end, c)}
          onRemove={pairIndex > 0 ? () => removePair(pairIndex) : undefined} canRemove={arrows.comparisons.length > 1}
          removeLabel="Remove pair" />
      )}
    </Card>
  );
}

function PalettePage() {
  const toast = useToast();
  const [palette, setPalette] = useState(null);
  const [selected, setSelected] = useState({ group: null, index: null });
  const [savedFlash, setSavedFlash] = useState(false);
  const saveTimer = useRef(null);
  const flashTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = window.astra3Native?.getPalette ? await window.astra3Native.getPalette().catch(() => null) : null;
      // A palette saved before arrow colours existed has none; it gets the defaults.
      if (!cancelled) setPalette(saved ? { ...saved, arrows: saved.arrows || DEFAULT_PALETTE.arrows } : DEFAULT_PALETTE);
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => () => { clearTimeout(saveTimer.current); clearTimeout(flashTimer.current); }, []);

  // Saved shortly after each change. A palette equal to the defaults removes
  // the file, so Astra3 goes back to its built-in colours.
  const update = (next) => {
    setPalette(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!window.astra3Native?.setPalette) return;
      try {
        await window.astra3Native.setPalette(samePalette(next, DEFAULT_PALETTE) ? null : next);
        setSavedFlash(true);
        clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setSavedFlash(false), 1600);
      } catch (e) {
        toast.push({ tone: "error", title: "Palette not saved", message: String(e?.message || e) });
      }
    }, 300);
  };

  if (!palette) return <PageScroll />;

  const selectFor = (group) => ({
    selected: selected.group === group ? selected.index : null,
    setSelected: (index) => setSelected({ group: index === null ? null : group, index }),
  });
  const listSection = (group, title, desc) => (
    <PaletteSection title={title} desc={desc} colors={palette[group]} presets={PALETTE_PRESETS[group]} {...selectFor(group)}
      onChange={(colors) => update({ ...palette, [group]: colors })}
      isDefault={samePalette(palette[group], DEFAULT_PALETTE[group])}
      onReset={() => { update({ ...palette, [group]: DEFAULT_PALETTE[group] }); setSelected({ group: null, index: null }); }} />
  );
  const termini = palette.termini;
  const terminusKey = selected.group === "termini" ? selected.index : null;
  const setTermini = (patch) => update({ ...palette, termini: { ...termini, ...patch } });

  return (
    <PageScroll>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "28px 32px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <span style={{ flex: 1, fontSize: 12, color: "var(--text-1)" }}>
            Colors are used in order and repeat. Click a color to change it. Changes apply from the next run, in PyMOL and ChimeraX.
          </span>
          <span style={{ fontSize: 11.5, color: "var(--sage)", opacity: savedFlash ? 1 : 0, transition: "opacity 200ms ease", display: "flex", alignItems: "center", gap: 4 }}>
            <Icon name="check" size={13} />Saved
          </span>
          <Button variant="secondary" size="sm" icon="refresh" disabled={samePalette(palette, DEFAULT_PALETTE)}
            onClick={() => { update(DEFAULT_PALETTE); setSelected({ group: null, index: null }); }}>Restore defaults</Button>
        </div>

        {listSection("chains", "Protein chains", "Single-structure and BATCH runs. OVERLAY and TERMINI color by structure.")}
        {listSection("ligands", "Ligands", "One color per ligand type.")}
        {listSection("ions", "Ions", "One color per ion type.")}

        <PaletteSection title="Termini" desc="The N- and C-terminal residues of every protein chain."
          colors={[termini.n, termini.c]} presets={PALETTE_PRESETS.termini} selected={terminusKey}
          setSelected={() => {}} onChange={() => {}}
          isDefault={samePalette(termini, DEFAULT_PALETTE.termini)}
          onReset={() => { update({ ...palette, termini: DEFAULT_PALETTE.termini }); setSelected({ group: null, index: null }); }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", gap: 18, opacity: termini.enabled ? 1 : 0.4, pointerEvents: termini.enabled ? "auto" : "none" }}>
              {[["n", "N-terminus"], ["c", "C-terminus"]].map(([key, label]) => (
                <PaletteChip key={key} color={termini[key]} label={label} selected={terminusKey === key}
                  onClick={() => setSelected(terminusKey === key ? { group: null, index: null } : { group: "termini", index: key })} />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12.5 }}>Color termini</span>
              <Toggle checked={termini.enabled} onChange={(v) => { setTermini({ enabled: v }); if (!v) setSelected({ group: null, index: null }); }} />
            </div>
          </div>
          {termini.enabled && terminusKey && (
            <PaletteEditor color={termini[terminusKey]} presets={PALETTE_PRESETS.termini}
              onPick={(c) => setTermini({ [terminusKey]: c })} />
          )}
        </PaletteSection>

        <ArrowPaletteSection arrows={palette.arrows}
          selectedKey={selected.group === "arrows" ? selected.index : null}
          select={(key) => setSelected(key === null ? { group: null, index: null } : { group: "arrows", index: key })}
          onChange={(arrows) => update({ ...palette, arrows })}
          isDefault={samePalette(palette.arrows, DEFAULT_PALETTE.arrows)}
          onReset={() => { update({ ...palette, arrows: DEFAULT_PALETTE.arrows }); setSelected({ group: null, index: null }); }} />
      </div>
    </PageScroll>
  );
}

/* ============================================================
   ADVANCED CONSOLE PAGE
   ============================================================ */
function ConsolePage() {
  const { consoleLog, runAstraCommand, isBusy, prompt, answerPrompt, addHistoryEntry, setCompletionPulse, cancelRequestedRef } = useApp();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false); // true only while THIS page's own command is running
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const lockedByOther = isBusy && !busy && !prompt; // another page's run with nothing to answer
  const inputRef = useRef(null);
  // Astra3 starts when the console opens, so the first command typed runs
  // rather than only launching it. A command typed during the launch waits
  // for it to finish.
  useEffect(() => {
    const native = window.astra3Native;
    if (!native || !native.pymolStart || !native.pymolIsRunning) return;
    native.pymolIsRunning()
      .then((running) => (running ? null : native.pymolStart()))
      .catch(() => {});
  }, []);

  const submit = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    if (prompt) {
      // A pending prompt, from this console or another page, is answered by
      // typing here and pressing Enter.
      setHistory((h) => [text, ...h]);
      setHistIdx(-1);
      setInput("");
      answerPrompt(text);
      return;
    }
    if (isBusy) return; // another page's run with nothing to answer
    const cmd = text;
    setHistory((h) => [cmd, ...h]);
    setHistIdx(-1);
    setInput("");
    setBusy(true);
    try {
      const consoleStartedAt = Date.now();
      const result = await runAstraCommand(cmd, { originPage: "console" });
      // Runs from the console are recorded in History like any other, so their
      // reports and sessions can be opened in the app. Only when the run saved a
      // session or report: helper commands such as -help have nothing to open.
      if (result?.cancelled || cancelRequestedRef.current) {
        // A cancelled run has usually saved a session already (it is written before
        // rendering), so it would pass the check below. Nothing is kept from it.
        await discardRunOutput(result?.lines, null, null, consoleStartedAt);
      } else if (result?.sessionPath || result?.reportPath) {
        // The structure ID is the first bare token; the rest are flags. Falls back
        // to the whole command so the entry always has a label.
        const id = cmd.split(/\s+/).find((t) => t && !t.startsWith("-"));
        // The same glow and chime as other pages. Fired here rather than in
        // runAstraCommand, since only this caller knows a structure was produced.
        setCompletionPulse(Math.random());
        addHistoryEntry({
          kind: "single",
          label: (id || cmd).toUpperCase(),
          status: "complete",
          meta: "via Advanced Console",
          sessionPath: result.sessionPath || null,
          reportPath: result.reportPath || null,
        });
      }
    } catch (e) {
      // runAstraCommand has already logged the error and traceback to the console.
    } finally { setBusy(false); inputRef.current?.focus(); }
  };

  // Cmd+F (Ctrl+F on Windows) opens a find bar over the console.
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findStatus, setFindStatus] = useState(null);
  const consoleBodyRef = useRef(null);
  useFindShortcut(() => setFindOpen(true));
  const closeFind = () => {
    setFindOpen(false);
    setFindQuery("");
    setFindStatus(null);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") submit();
    if (e.key === "ArrowUp") { e.preventDefault(); const ni = Math.min(histIdx + 1, history.length - 1); setHistIdx(ni); if (history[ni]) setInput(history[ni]); }
    if (e.key === "ArrowDown") { e.preventDefault(); const ni = Math.max(histIdx - 1, -1); setHistIdx(ni); setInput(ni === -1 ? "" : history[ni]); }
  };

  return (
    <PageScroll style={{ padding: "24px 32px 40px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        {/* Given room to breathe and kept on one line: wrapping the label
            turned the chip into a two-line block beside a one-line sentence. */}
        <Badge tone="violet" style={{ padding: "5px 12px", whiteSpace: "nowrap", flexShrink: 0 }}>Power users</Badge>
        <span style={{ fontSize: 12, color: "var(--text-1)" }}>Existing Astra3 command syntax works exactly as it does today. GUI actions also appear here, and vice versa.</span>
      </div>
      <div style={{ position: "relative" }}>
        <LiveConsole lines={consoleLog} height={480} title="astra3.py: interactive session" showCursor={!isBusy || !!prompt}
                     maxLines={Infinity} droppedBefore={consoleLog[0]?.n || 0} bodyRef={consoleBodyRef} followOutput={!findOpen} />
        {findOpen && (
          <ReadmeFindBar query={findQuery} setQuery={setFindQuery} status={findStatus} setStatus={setFindStatus}
            contentRef={consoleBodyRef} placeholder="Find in console…" arrows={false} autoFocus
            contentVersion={consoleLog[consoleLog.length - 1]?.n ?? consoleLog.length} onClose={closeFind}
            style={{ position: "absolute", top: 44, right: 14, zIndex: 5, marginBottom: 0, padding: 6, background: "var(--bg-2)",
                     border: "1px solid var(--line-1)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)" }} />
        )}
      </div>
      {lockedByOther && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "var(--amber)" }}>
          <Spinner size={12} />
          A GUI action is currently running. The console will unlock automatically when it finishes.
        </div>
      )}
      {prompt && !busy && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "var(--amber)" }}>
          <Icon name="alertTriangle" size={13} />
          A run started elsewhere is waiting for an answer. Type it below and press Enter.
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextInput ref={inputRef} mono placeholder={prompt ? "Type your answer (y, n, or a value)…" : (lockedByOther ? "Astra3 is busy…" : "Enter a PDB ID, OVERLAY, TERMINI, BATCH, -help...")} value={input}
            onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} disabled={lockedByOther} />
        </div>
        <Button variant="primary" onClick={submit} disabled={lockedByOther || !input.trim()}>{busy ? <Spinner size={13} /> : (prompt ? "Answer" : "Run")}</Button>
      </div>
    </PageScroll>
  );
}

/* ============================================================
   ROOT APP
   ============================================================ */

// Window-edge glow (astra-completion-glow in index.html) on each change of
// completionPulse, with an optional chime synthesised through Web Audio.
// Chromium starts an AudioContext suspended unless it is created during a
// user gesture, and a suspended context plays nothing, so one shared context
// is created lazily and resumed on the first click or key press and again
// before each chime.
let _sharedAudioCtx = null;
function getAudioContext() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!_sharedAudioCtx) {
    try { _sharedAudioCtx = new Ctor(); } catch { return null; }
  }
  return _sharedAudioCtx;
}
if (typeof window !== "undefined") {
  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  };
  // Passive + capture so this never interferes with real UI handling, and not
  // { once: true }: the context can be suspended again by the OS or by the
  // window losing focus, so every gesture gets a chance to revive it.
  window.addEventListener("pointerdown", unlock, { passive: true, capture: true });
  window.addEventListener("keydown", unlock, { passive: true, capture: true });
}

// Never throws: the chime must not be able to break a run.
function playCompletionChime() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const play = () => {
    try {
      // Scheduled a beat into the future rather than at currentTime: a
      // context that has just resumed can otherwise miss an envelope
      // scheduled at "now", producing silence.
      const now = ctx.currentTime + 0.04;
      [{ freq: 1046.5, start: 0 }, { freq: 1318.5, start: 0.09 }].forEach(({ freq, start }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(0.18, now + start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + start);
        osc.stop(now + start + 0.4);
      });
    } catch {
      // No audio device, or the context died; the glow still shows.
    }
  };
  // Not closed: the context is reused for the rest of the session.
  if (ctx.state === "suspended") ctx.resume().then(play).catch(() => {});
  else play();
}

function CompletionPulse() {
  const { completionPulse, settings } = useApp();
  const [active, setActive] = useState(false);
  const firstRenderRef = useRef(true);

  useEffect(() => {
    if (firstRenderRef.current) {
      // Don't glow on initial mount just because completionPulse's default
      // state (0) differs from... itself. Only real subsequent changes (a
      // real completion) should trigger this.
      firstRenderRef.current = false;
      return;
    }
    if (!completionPulse) return;
    setActive(true);
    const t = setTimeout(() => setActive(false), 2000); // matches astra-completion-glow's own duration
    if (settings.completionSound !== false) playCompletionChime();
    return () => clearTimeout(t);
  }, [completionPulse]);

  if (!active) return null;
  return (
    <div
      className="astra-completion-pulse"
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 500 }}
    />
  );
}

// Stars around the setup dialog, placed relative to the backdrop so they sit
// around the card rather than over it, with varied size, timing and shades
// of yellow.
const SETUP_STAR_COLORS = ["#FFD54A", "#FFF3C4", "#FFC93C", "#FDE9A0", "#FFE066", "#FFF6D8"];
const SETUP_STARS = [
  { top: "16%", left: "20%", size: 4, duration: 3.2, delay: 0 },
  { top: "26%", left: "80%", size: 3, duration: 2.6, delay: 0.6 },
  { top: "68%", left: "13%", size: 3.5, duration: 3.8, delay: 1.1 },
  { top: "78%", left: "84%", size: 4, duration: 2.9, delay: 0.3 },
  { top: "10%", left: "50%", size: 3, duration: 3.4, delay: 1.6 },
  { top: "88%", left: "48%", size: 3.5, duration: 2.7, delay: 0.9 },
  { top: "42%", left: "8%", size: 3, duration: 3.1, delay: 1.9 },
  { top: "40%", left: "92%", size: 4.5, duration: 2.4, delay: 0.4 },
  { top: "6%", left: "30%", size: 3, duration: 3.6, delay: 1.3 },
  { top: "6%", left: "70%", size: 3.5, duration: 2.9, delay: 0.7 },
  { top: "94%", left: "24%", size: 3, duration: 3.3, delay: 1.7 },
  { top: "94%", left: "72%", size: 4, duration: 2.5, delay: 1.0 },
];
function SetupStarField() {
  // One entrance duration for every star; each star's delay staggers when it
  // starts.
  const fadeInDuration = 1.1;
  return (
    <>
      {SETUP_STARS.map((s, i) => (
        <div key={i} className="astra-setup-star" style={{
          top: s.top, left: s.left, width: s.size, height: s.size,
          background: SETUP_STAR_COLORS[i % SETUP_STAR_COLORS.length],
          color: SETUP_STAR_COLORS[i % SETUP_STAR_COLORS.length],
          // Fade-in holds the star transparent through its delay (fill-mode both),
          // then the twinkle starts where the fade-in ends.
          animation: `astra-setup-star-in ${fadeInDuration}s ease-out ${s.delay}s both, astra-setup-star-twinkle ${s.duration}s ease-in-out ${s.delay + fadeInDuration}s infinite`,
        }} />
      ))}
    </>
  );
}

// Shown on every page except Settings while no analysis program is set up.
// isFirstLaunch decides the welcome text, and whether saving a path restarts
// the app (only when a saved path is being changed).
function PymolSetupDialog({ page, setPage }) {
  const { setupStatus, isElectron, updateSettings, platform, switchEngine, rememberEngineVersion } = useApp();
  const [dismissed, setDismissed] = useState(false);
  // Which program the location below is for. Either one is enough to start.
  const [engine, setEngine] = useState("pymol");
  const [pathInput, setPathInput] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [restarting, setRestarting] = useState(false);

  // Closing hides this occurrence only. setupStatus changes again whenever a
  // pre-flight check in runAstraCommand fails, which reopens the dialog.
  useEffect(() => { setDismissed(false); }, [setupStatus]);

  if (!isElectron || !setupStatus || page === "settings" || dismissed) return null;
  const { pymolOk, scriptOk, isFirstLaunch } = setupStatus;
  if (pymolOk && scriptOk) return null;

  if (!scriptOk) {
    return (
      <div className="astra-setup-backdrop">
        <SetupStarField />
        <div className="astra-modal-in" style={{ width: "min(420px, 90vw)", background: "var(--bg-1)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-lg)", padding: 28, textAlign: "center", position: "relative" }}>
          <button onClick={() => setDismissed(true)} title="Close" style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", padding: 4 }}>
            <Icon name="x" size={15} />
          </button>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <AstraLogo size={40} />
          </div>
          <p style={{ fontSize: 13.5, color: "var(--text-0)", lineHeight: 1.6, margin: 0 }}>
            astra3.py could not be located alongside this app. The install
            itself may be missing files; reinstalling Astra3 may fix this.
          </p>
        </div>
      </div>
    );
  }

  const pickEngine = (value) => {
    setEngine(value);
    setPathInput("");
    setValidationError(null);
  };

  const browse = async () => {
    const picked = engine === "pymol"
      ? await window.astra3Native.openPymolExecutableDialog()
      : await window.astra3Native.openChimeraxExecutableDialog();
    if (picked) { setPathInput(picked); setValidationError(null); }
  };

  const confirm = async () => {
    if (!pathInput.trim() || validating || restarting) return;
    setValidating(true);
    setValidationError(null);
    // Each location accepts only its own program: a PyMOL location must be
    // PyMOL, a ChimeraX location ChimeraX.
    const check = await checkEnginePath(engine, pathInput);
    if (check.error) {
      setValidating(false);
      setValidationError(check.error);
      return;
    }
    // The setters resolve a .app bundle or shortcut to the file they save and
    // return it, so Settings shows what is actually used.
    if (engine === "pymol") {
      const resolvedPath = await window.astra3Native.setPymolPath(pathInput);
      updateSettings({ pymolPath: resolvedPath });
    } else {
      await window.astra3Native.setChimeraxPath(pathInput);
      rememberEngineVersion("chimerax", check.version);
    }
    try {
      await switchEngine(engine);
    } catch (e) {
      setValidating(false);
      setValidationError(e.message);
      return;
    }
    if (isFirstLaunch) {
      setValidating(false);
      setDismissed(true);
    } else {
      setRestarting(true);
      await window.astra3Native.restartApp();
      // main.js quits this process once the relaunch is queued.
    }
  };

  const openReadme = () => {
    setDismissed(true);
    setPage("citation");
  };

  const chooseAstra3Engine = async () => {
    setValidationError(null);
    try {
      await switchEngine("astra3");
      setDismissed(true);
    } catch (e) {
      setValidationError(String(e.message || e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ""));
    }
  };

  const placeholder = engine === "pymol"
    ? (MAC_PYMOL_EXAMPLE)
    : (platform === "win32" ? "C:\\Program Files\\ChimeraX\\bin\\ChimeraX.exe" : "/Applications/ChimeraX.app");

  return (
    <div className="astra-setup-backdrop">
      <SetupStarField />
      <div className="astra-modal-in astra-setup-glow" style={{ width: "min(480px, 92vw)", background: "var(--bg-1)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-lg)", padding: 32, position: "relative" }}>
        {/* Small, unobtrusive close: dismissing is a secondary action. */}
        <button onClick={() => setDismissed(true)} title="Close" style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", padding: 4 }}>
          <Icon name="x" size={15} />
        </button>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <AstraLogo size={48} animated />
        </div>

        {isFirstLaunch ? (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>
              Welcome to Astra3
            </div>
            <p style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.6, textAlign: "center", margin: "0 0 8px" }}>
              Connect PyMOL or ChimeraX, or start now with the Astra3 Engine.
            </p>
            <p style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.6, textAlign: "center", margin: "0 0 18px" }}>
              Astra3 runs its analysis inside PyMOL or UCSF ChimeraX when
              either is installed, or in its own engine.
            </p>
          </>
        ) : (
          <div style={{ fontSize: 13.5, color: "var(--text-0)", textAlign: "center", lineHeight: 1.6, margin: "0 0 18px" }}>
            Neither PyMOL nor ChimeraX could be found. Select either installation, or use the Astra3 Engine.
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <SegmentedControl
            value={engine}
            onChange={pickEngine}
            disabled={validating || restarting}
            options={[{ value: "pymol", label: "PyMOL" }, { value: "chimerax", label: "ChimeraX" }]}
          />
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextInput
              mono icon="cube" placeholder={placeholder}
              value={pathInput}
              onChange={(e) => { setPathInput(e.target.value); setValidationError(null); }}
            />
          </div>
          <Button variant="secondary" onClick={browse}>Browse</Button>
        </div>

        {validationError && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, color: "var(--coral)", fontSize: 12 }}>
            <Icon name="alertTriangle" size={13} style={{ flexShrink: 0 }} />
            {validationError}
          </div>
        )}

        <Button variant="primary" size="lg" onClick={confirm} disabled={validating || restarting || !pathInput.trim()} style={{ width: "100%", marginTop: 16 }}>
          {restarting ? <><Spinner size={14} />Restarting Astra3…</> : validating ? <><Spinner size={14} />Checking…</> : "Confirm"}
        </Button>

        {setupStatus.available?.astra3 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 12px", color: "var(--text-2)", fontSize: 11 }}>
              <span style={{ flex: 1, height: 1, background: "var(--line-0)" }} />or<span style={{ flex: 1, height: 1, background: "var(--line-0)" }} />
            </div>
            <Button variant="secondary" size="lg" onClick={chooseAstra3Engine} disabled={validating || restarting} style={{ width: "100%" }}>
              <AstraLogo size={16} />Use Astra3 Engine
            </Button>
            <p style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.55, textAlign: "center", margin: "8px 0 0" }}>
              Nothing else to install. The same measurements and images, with
              every session saved for both PyMOL and ChimeraX.
            </p>
          </>
        )}

        <div style={{ textAlign: "center", marginTop: 18 }}>
          <button onClick={openReadme} style={{ background: "none", border: "none", color: "var(--text-2)", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
            README Document
          </button>
        </div>
      </div>
    </div>
  );
}

// At launch, says once when the chosen engine was not found and the other
// one is used instead. Rendered inside AstraApp's tree because useToast()
// needs ToastProvider as an ancestor, and AppProvider (where setupStatus
// lives) sits outside it.
function PymolVerifiedToast() {
  const { setupStatus, isElectron } = useApp();
  const toast = useToast();
  const shownRef = useRef(false);

  useEffect(() => {
    if (!isElectron || !setupStatus) return;
    const { pymolOk, scriptOk, isFirstLaunch } = setupStatus;
    if (pymolOk && scriptOk && !isFirstLaunch && !shownRef.current) {
      shownRef.current = true;
      // The engine in use is shown in the top bar; a notice is only worth
      // showing when the chosen engine was missing and the other is used.
      if (setupStatus.fallbackFrom) {
        toast.push({
          tone: "neutral",
          title: `${ENGINE_NAMES[setupStatus.fallbackFrom]} not found`,
          message: `Analyses run with ${ENGINE_NAMES[setupStatus.engine || "pymol"]}.`,
        });
      }
    }
    if (!pymolOk) shownRef.current = false; // allow it to fire again after a real recovery
  }, [setupStatus, isElectron]);

  return null;
}

// Contains a render failure to the page that caused it. Every page stays
// mounted, and an error reaching the root would unmount the whole window.
class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error(`Astra3: error rendering the ${this.props.pageId} page`, error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 40, maxWidth: 680, margin: "0 auto" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-0)", marginBottom: 8 }}>
          This page ran into a problem
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-1)", lineHeight: 1.7, marginBottom: 16 }}>
          The rest of Astra3 is still working, and your analyses and files are
          unaffected. You can switch to another tab, or try this page again.
        </div>
        <div className="mono" style={{
          fontSize: 11, color: "var(--text-2)", background: "var(--bg-2)",
          border: "1px solid var(--line-0)", borderRadius: "var(--radius-sm)",
          padding: 12, marginBottom: 16, whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {String(this.state.error?.message || this.state.error)}
        </div>
        <Button variant="secondary" icon="refresh" onClick={() => this.setState({ error: null })}>
          Try again
        </Button>
      </div>
    );
  }
}

// On Windows, ChimeraX draws images and saves sessions through its windowed
// program, whose window can appear briefly once per ChimeraX start.
// astra3_chimerax_scene.py prints a line just before starting it, and the
// notice explains the window.
function ChimeraxWindowNotice() {
  const { bridge, platform } = useApp();
  const toast = useToast();
  const pushRef = useRef(toast.push);
  pushRef.current = toast.push;

  useEffect(() => {
    if (platform !== "win32" || !bridge || typeof bridge.on !== "function") return undefined;
    return bridge.on("log-line", ({ text }) => {
      if (!/^(> )?Starting ChimeraX in the background/.test(stripAnsi(String(text || "")).trim())) return;
      pushRef.current({
        tone: "neutral",
        title: "That window was ChimeraX",
        message: "If a window appeared just now, it was ChimeraX starting in the background to draw the images and save the session.",
        duration: 8000,
      });
    });
  }, [bridge, platform]);

  return null;
}

function OutputLocationNotice() {
  const { outputNotice, setOutputNotice } = useApp();
  const toast = useToast();
  useEffect(() => {
    if (!outputNotice) return;
    toast.push({ tone: "warning", title: outputNotice.title, message: outputNotice.message, duration: 15000 });
    setOutputNotice(null);
  }, [outputNotice]);
  return null;
}

function AstraApp() {
  const [page, setPage] = useState("home");
  const [collapsed, setCollapsed] = useState(false);
  const [zoomFactor, setZoomFactor] = useState(1);

  // Electron keeps the zoom across restarts; read it so the displayed
  // percentage matches.
  useEffect(() => {
    if (typeof window !== "undefined" && window.astra3Native?.getZoomFactor) {
      window.astra3Native.getZoomFactor()
        .then((f) => setZoomFactor(f))
        // Keep 100% if the read fails.
        .catch(() => {});
    }
  }, []);

  const zoomIn = useCallback(async () => {
    if (!window.astra3Native?.zoomIn) return;
    setZoomFactor(await window.astra3Native.zoomIn());
  }, []);
  const zoomOut = useCallback(async () => {
    if (!window.astra3Native?.zoomOut) return;
    setZoomFactor(await window.astra3Native.zoomOut());
  }, []);
  const zoomReset = useCallback(async () => {
    if (!window.astra3Native?.zoomReset) return;
    setZoomFactor(await window.astra3Native.zoomReset());
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (!e.metaKey && !e.ctrlKey) return; // Cmd on macOS, Ctrl elsewhere
      // Cmd/Ctrl +, -, 0. "=" is the unshifted key for "+".
      if (e.key === "=" || e.key === "+") { e.preventDefault(); zoomIn(); return; }
      if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomOut(); return; }
      if (e.key === "0") { e.preventDefault(); zoomReset(); return; }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= NAV_ITEMS.length) {
        e.preventDefault();
        setPage(NAV_ITEMS[n - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Every drop target already prevents the default, but a drop that lands just
  // outside one reaches the document, where Chromium navigates the window to
  // the dropped file.
  useEffect(() => {
    const preventDefault = (e) => e.preventDefault();
    document.addEventListener("dragover", preventDefault);
    document.addEventListener("drop", preventDefault);
    return () => {
      document.removeEventListener("dragover", preventDefault);
      document.removeEventListener("drop", preventDefault);
    };
  }, []);

  const pages = {
    home: <HomePage setPage={setPage} />,
    single: <SingleStructurePage setPage={setPage} />,
    overlay: <OverlayPage setPage={setPage} />,
    termini: <TerminiPage setPage={setPage} />,
    batch: <BatchPage setPage={setPage} />,
    related: <RelatedPage setPage={setPage} />,
    import: <ImportPage setPage={setPage} />,
    reports: <ReportsPage setPage={setPage} />,
    viewer: <ViewerPage />,
    summary: <SummaryPage setPage={setPage} />,
    history: <HistoryPage setPage={setPage} />,
    settings: <SettingsPage />,
    console: <ConsolePage />,
    palette: <PalettePage />,
    citation: <CitationPage />,
  };

  return (
    <AppProvider>
      <ToastProvider>
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
          <PymolSetupDialog page={page} setPage={setPage} />
          <PymolVerifiedToast />
          <ChimeraxWindowNotice />
          <OutputLocationNotice />
          <CompletionPulse />
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <NavRail page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <TopBar page={page} setPage={setPage} zoomFactor={zoomFactor} zoomIn={zoomIn} zoomOut={zoomOut} zoomReset={zoomReset} />
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
              {/* Every page stays mounted, hidden with display:none, so leaving a page
                  mid-run keeps its console output and any pending y/n prompt. */}
              {Object.entries(pages).map(([id, element]) => (
                <div key={id} style={{ display: page === id ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
                  <PageActiveContext.Provider value={page === id}>
                    <PageErrorBoundary pageId={id}>{element}</PageErrorBoundary>
                  </PageActiveContext.Provider>
                </div>
              ))}
            </div>
          </div>
          </div>
        </div>
      </ToastProvider>
    </AppProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<AstraApp />);
