/** Jeu d'icônes SVG sobres (stroke, 1.75) réutilisables — remplacent les emojis. */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: p.className ?? "h-4 w-4",
});

export const IconEdit = (p: P) => (<svg {...base(p)}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>);
export const IconEye = (p: P) => (<svg {...base(p)}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></svg>);
export const IconDownload = (p: P) => (<svg {...base(p)}><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" /></svg>);
export const IconUpload = (p: P) => (<svg {...base(p)}><path d="M12 21V9m0 0l-4 4m4-4l4 4M5 3h14" /></svg>);
export const IconSend = (p: P) => (<svg {...base(p)}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>);
export const IconReceipt = (p: P) => (<svg {...base(p)}><path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1-2-1z" /><path d="M9 8h6M9 12h6" /></svg>);
export const IconFile = (p: P) => (<svg {...base(p)}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>);
export const IconFolder = (p: P) => (<svg {...base(p)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>);
export const IconRefresh = (p: P) => (<svg {...base(p)}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>);
export const IconCheck = (p: P) => (<svg {...base(p)}><path d="M20 6L9 17l-5-5" /></svg>);
export const IconX = (p: P) => (<svg {...base(p)}><path d="M18 6L6 18M6 6l12 12" /></svg>);
export const IconAlert = (p: P) => (<svg {...base(p)}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4m0 4h.01" /></svg>);
export const IconSearch = (p: P) => (<svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>);
export const IconCalendar = (p: P) => (<svg {...base(p)}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>);
export const IconLink = (p: P) => (<svg {...base(p)}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>);
export const IconCamera = (p: P) => (<svg {...base(p)}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>);
export const IconPrint = (p: P) => (<svg {...base(p)}><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></svg>);
export const IconPin = (p: P) => (<svg {...base(p)}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>);
export const IconUser = (p: P) => (<svg {...base(p)}><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="7" r="4" /></svg>);
export const IconEuro = (p: P) => (<svg {...base(p)}><path d="M18 7a6 6 0 1 0 0 10" /><path d="M4 10h9M4 14h7" /></svg>);
export const IconBox = (p: P) => (<svg {...base(p)}><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>);
export const IconPaperclip = (p: P) => (<svg {...base(p)}><path d="M21 12.5 12.5 21a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" /></svg>);
export const IconBank = (p: P) => (<svg {...base(p)}><path d="M3 10l9-6 9 6" /><path d="M4 10v9M20 10v9M8 10v9M12 10v9M16 10v9M2 21h20" /></svg>);
export const IconBulb = (p: P) => (<svg {...base(p)}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.2 1 2.5h6c0-1.3.3-1.8 1-2.5A6 6 0 0 0 12 3z" /></svg>);
export const IconBolt = (p: P) => (<svg {...base(p)}><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" /></svg>);
export const IconWrench = (p: P) => (<svg {...base(p)}><path d="M14.7 6.3a4 4 0 0 1-5.3 5.3L4 17v3h3l5.4-5.4a4 4 0 0 1 5.3-5.3l-2.6 2.6-2-2 2.6-2.6z" /></svg>);
export const IconArrowUpRight = (p: P) => (<svg {...base(p)}><path d="M7 17L17 7M8 7h9v9" /></svg>);
export const IconArrowDownRight = (p: P) => (<svg {...base(p)}><path d="M7 7l10 10M17 8v9H8" /></svg>);
export const IconArrowsUpDown = (p: P) => (<svg {...base(p)}><path d="M7 4v16M7 4L3 8M7 4l4 4M17 20V4M17 20l-4-4M17 20l4-4" /></svg>);
export const IconRobot = (p: P) => (<svg {...base(p)}><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M12 4v4M9 14h.01M15 14h.01" /><circle cx="12" cy="3" r="1" /></svg>);
