import { site } from "@/lib/site";

export type Project = {
  name: string;
  description: string;
  href: string;
  // Shown as a rubber stamp across the sheet, e.g. "Under construction".
  status?: string;
  // A drawing made for this project; otherwise it takes a stock one.
  drawing?: keyof typeof featured;
};

// Line drawings for the sheets, in white ink on a 320 × 190 drawing area.
// Sheets without a drawing of their own take these in turn, so neighbouring
// blueprints differ.
const drawings = [
  // Ground floor plan: double walls, door swings, windows and a stair.
  <g key="plan">
    <path d="M24 22h196v136H24z M30 28h184v124H30z" />
    <path d="M118 28v48 M118 96v56 M30 98h50 M98 98h20 M118 70h96" />
    <path d="M80 98a18 18 0 0 1 18-18 M80 98h18v-18" />
    <path d="M118 76a20 20 0 0 0 20 20 M118 96h20" />
    <path d="M150 22v6 M162 22v6 M174 22v6 M150 25h24 M24 54h6 M24 72h6 M27 54v18" />
    <path d="M160 108h44v38h-44z M160 114h44 M160 120h44 M160 126h44 M160 132h44 M160 138h44 M168 140l30-28" />
    <path d="M24 10h196 M24 6v8 M220 6v8 M232 22v136 M228 22h8 M228 158h8" />
    <text x="108" y="8">12 400</text>
    <text x="236" y="94" transform="rotate(90 236 94)">8 600</text>
    <text x="52" y="66">LIVING</text>
    <text x="150" y="54">KITCHEN</text>
    <text x="44" y="130">STUDY</text>
    <path d="M260 40v100 M250 50h20 M250 130h20" strokeDasharray="4 3" />
    <circle cx="260" cy="40" r="6" />
    <text x="257" y="43">A</text>
    <circle cx="260" cy="140" r="6" />
    <text x="257" y="143">A</text>
  </g>,
  // Front elevation with window grid, door and level markers.
  <g key="elevation">
    <path d="M14 160h292" />
    <path d="M40 160V70l80-44 80 44v90 M200 160V94h80v66" />
    <path d="M62 86h22v26H62z M73 86v26 M156 86h22v26h-22z M167 86v26 M62 126h22v26H62z M156 126h22v26h-22z" />
    <path d="M106 112h28v48h-28z M120 112v48 M100 112l20-12 20 12" />
    <path d="M216 108h48v22h-48z M240 108v22 M216 140h48" />
    <path d="M110 46h20v14h-20z" />
    <path d="M292 160V26 M288 160h8 M288 70h8 M288 26h8" />
    <path d="M14 70h22 M14 26h96" strokeDasharray="5 3" />
    <text x="16" y="66">FFL +3.000</text>
    <text x="16" y="22">RIDGE +6.800</text>
    <text x="226" y="176">FRONT ELEVATION</text>
  </g>,
  // A machined bracket: centre lines, bolt circle, section hatching.
  <g key="part">
    <circle cx="110" cy="95" r="58" />
    <circle cx="110" cy="95" r="24" />
    <circle cx="110" cy="45" r="6" />
    <circle cx="160" cy="95" r="6" />
    <circle cx="110" cy="145" r="6" />
    <circle cx="60" cy="95" r="6" />
    <circle cx="110" cy="95" r="50" strokeDasharray="3 3" />
    <path d="M40 95h140 M110 25v140" strokeDasharray="12 3 2 3" />
    <path d="M210 37h70v116h-70z" />
    <path d="M210 71h70 M210 119h70" />
    <path d="M210 37l34 34 M226 37l34 34 M242 37l34 34 M258 37l22 22 M210 53l18 18 M210 119l34 34 M226 119l34 34 M242 119l34 34 M258 119l22 22 M210 135l18 18" />
    <path d="M200 95h90" strokeDasharray="12 3 2 3" />
    <path d="M128 77l40-38h30" />
    <text x="170" y="36">Ø 48 THRU</text>
    <text x="214" y="172">SECTION A–A</text>
  </g>,
];

// Drawings made for particular projects.
const featured = {
  // A classical library: the portico's front elevation, with a plan of the
  // reading room and its book stacks alongside.
  library: (
    <g>
      <path d="M8 170h228" />
      <path d="M40 170v-8h170v8 M46 162v-6h158v6 M52 156v-6h146v6 M56 150v-6h138v6" />
      {[70, 92, 114, 136, 158, 180].map((x) => (
        <path
          key={x}
          d={`M${x - 7} 144v-6h14v6 M${x - 5} 138V80h10v58 M${x - 2} 82v54 M${x + 2} 82v54 M${x - 7} 80v-6h14v6`}
        />
      ))}
      <path d="M52 74V62h146v12z M48 62v-4h154v4" />
      <path d="M48 58l77-30 77 30 M62 55l63-24 63 24z" />
      <circle cx="125" cy="46" r="5" />
      <path d="M120 46h10 M125 41v10" />
      <text x="125" y="71" textAnchor="middle" style={{ fontSize: 8, letterSpacing: "0.35em" }}>
        LIBRARY
      </text>
      <path d="M118 144v-30a7 7 0 0 1 14 0v30 M125 107v37" />
      <path d="M77 98h8v26h-8z M77 111h8 M99 98h8v26h-8z M99 111h8 M143 98h8v26h-8z M143 111h8 M165 98h8v26h-8z M165 111h8" />
      <path d="M24 28v142 M20 28h8 M20 170h8" />
      <text x="20" y="112" transform="rotate(-90 20 112)">14 200</text>
      <text x="125" y="184" textAnchor="middle">WEST ELEVATION</text>
      <path d="M246 34h66v116h-66z M246 108h18 M276 108h36" />
      {[42, 52, 62, 72, 82, 92].map((y) => (
        <path key={y} d={`M252 ${y}h20v4h-20z M286 ${y}h20v4h-20z`} />
      ))}
      <path d="M262 122h34v12h-34z" />
      {[268, 279, 290].map((x) => (
        <path key={x} d={`M${x - 2} 119h4 M${x - 2} 137h4`} />
      ))}
      <path d="M264 150v-6a6 6 0 0 1 12 0v6" />
      <text x="279" y="163" textAnchor="middle">READING ROOM</text>
      <text x="279" y="172" textAnchor="middle">+ STACKS</text>
    </g>
  ),
};

export default function Blueprint({ project, index, total }: { project: Project; index: number; total: number }) {
  const external = project.href.startsWith("http");
  const sheet = (n: number) => String(n).padStart(2, "0");
  return (
    <a
      href={project.href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="blueprint"
    >
      {/* The sheet of blue paper, pinned down (see globals.css). */}
      <span className="blueprint-sheet">
        <span className="blueprint-frame">
          <svg
            aria-hidden
            viewBox="0 0 320 190"
            className="blueprint-drawing"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {project.drawing ? featured[project.drawing] : drawings[index % drawings.length]}
          </svg>
          <span className="blueprint-footer">
            <span className="blueprint-notes">
              <span className="blueprint-label">Notes</span>
              {project.description}
            </span>
            <span className="blueprint-title">
              <span className="blueprint-cell blueprint-name">
                <span className="blueprint-label">Project</span>
                <h2>{project.name}</h2>
              </span>
              <span className="blueprint-cell blueprint-end" aria-hidden>
                <svg viewBox="0 0 16 14" className="blueprint-revision">
                  <path d="M8 1.5 14.5 12.5h-13z" fill="none" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </span>
              <span className="blueprint-cell blueprint-last">
                <span className="blueprint-label">Sheet</span>
                {sheet(index + 1)} / {sheet(total)}
              </span>
              <span className="blueprint-cell blueprint-last">
                <span className="blueprint-label">Drawn</span>
                {site.name}
              </span>
              <span className="blueprint-cell blueprint-last blueprint-end">
                <span className="blueprint-label">Scale</span>
                1:100
              </span>
            </span>
          </span>
        </span>
      </span>
      {project.status && <span className="blueprint-stamp">{project.status}</span>}
    </a>
  );
}
