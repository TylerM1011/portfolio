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
  // A website: a desktop wireframe (nav, a hero with this site's road and
  // sign gantry, a row of cards, footer), and the same page laid out for a
  // phone alongside.
  website: (
    <g>
      <path d="M14 10h212 M14 6v8 M226 6v8" />
      <text x="120" y="8" textAnchor="middle">1440</text>
      <path d="M14 18h212v148H14z M14 30h212" />
      <circle cx="21" cy="24" r="2" />
      <circle cx="28" cy="24" r="2" />
      <circle cx="35" cy="24" r="2" />
      <path d="M48 21h150v6H48z" />
      <path d="M14 42h212 M20 34h18v4H20z M150 36h12 M168 36h12 M186 36h12 M204 36h14" />
      <path d="M14 104h212 M18 66h204" strokeDasharray="4 3" />
      <path d="M70 104l34-28 M170 104l-34-28 M120 99v-5 M120 88v-4 M120 80v-3" />
      <path d="M86 98V74 M154 98V74 M84 74h72 M92 66h22v8H92z M126 66h22v8h-22z" />
      <text x="20" y="54">HERO / 3D SCENE</text>
      {[22, 91, 160].map((x) => (
        <path key={x} d={`M${x} 112h58v34h-58z M${x} 132h58 M${x} 112l58 20 M${x + 58} 112l-58 20 M${x + 4} 138h30 M${x + 4} 142h20`} />
      ))}
      <path d="M14 152h212 M22 159h40 M170 159h48" />
      <text x="120" y="180" textAnchor="middle">DESKTOP</text>
      <path d="M232 95h12 M240 92l4 3-4 3" strokeDasharray="3 2" />
      <path d="M254 30h42a6 6 0 0 1 6 6v108a6 6 0 0 1-6 6h-42a6 6 0 0 1-6-6V36a6 6 0 0 1 6-6z M268 35h14 M268 146h14" />
      <path d="M248 44h54 M254 38h10 M290 37h6 M290 39.5h6 M290 42h6 M248 76h54 M252 58h46" />
      <path d="M262 76l11-18 M288 76l-11-18" />
      <path d="M254 82h42v16h-42z M254 102h42v16h-42z M254 122h42v16h-42z" />
      <path d="M248 158h54 M248 154v8 M302 154v8" />
      <text x="275" y="170" textAnchor="middle">390</text>
      <text x="275" y="180" textAnchor="middle">MOBILE</text>
    </g>
  ),
  // A set of polyhedral dice: a large d20 face-on, with a d6, d4, d8 and
  // d10 drawn alongside, hidden edges dashed.
  dice: (
    <g>
      {/* d20: hexagonal outline, front face, and the edges fanning out. */}
      <path d="M90 30l50.2 29v58L90 146l-50.2-29V59z" />
      <path d="M90 62l28 46H62z" />
      <path d="M90 30v32 M39.8 59L90 62 M140.2 59L90 62 M39.8 59L62 108 M140.2 59L118 108 M39.8 117L62 108 M140.2 117L118 108 M90 146L62 108 M90 146l28-38" />
      <text x="90" y="96" textAnchor="middle" style={{ fontSize: 11 }}>20</text>
      <path d="M22 30v116 M18 30h8 M18 146h8" />
      <text x="18" y="96" transform="rotate(-90 18 96)">Ø 22</text>
      <text x="90" y="166" textAnchor="middle">D20 · ICOSAHEDRON</text>
      {/* d6: an isometric cube with its pips. */}
      <path d="M174 42l26-12 26 12-26 12z M174 42v30l26 12V54 M226 42v30l-26 12" />
      <circle cx="200" cy="42" r="2" />
      <circle cx="181" cy="54" r="1.8" />
      <circle cx="193" cy="72" r="1.8" />
      <circle cx="207" cy="56" r="1.8" />
      <circle cx="213" cy="63" r="1.8" />
      <circle cx="219" cy="70" r="1.8" />
      <text x="200" y="96" textAnchor="middle">D6</text>
      {/* d4: a tetrahedron, the back edge hidden. */}
      <path d="M270 26L242 76l22 12 36-14z M270 26l-6 62" />
      <path d="M242 76l58-2" strokeDasharray="3 2" />
      <text x="271" y="100" textAnchor="middle">D4</text>
      {/* d8: an octahedron, two faces showing. */}
      <path d="M200 108l24 26-24 30-24-30z M176 134h48" />
      <path d="M200 108l6 34 M176 134l30 8 M224 134l-18 8 M206 142l-6 22" strokeDasharray="3 2" />
      <text x="193" y="129" textAnchor="middle">8</text>
      <text x="200" y="178" textAnchor="middle">D8</text>
      {/* d10: a pentagonal trapezohedron, kite face forward. */}
      <path d="M270 110l24 28-2 10-22 18-22-18-2-10z" />
      <path d="M270 110l-12 32 12 8 12-8z M258 142l-12-4 M282 142l12-4 M270 150v16" />
      <text x="270" y="140" textAnchor="middle">0</text>
      <text x="270" y="178" textAnchor="middle">D10</text>
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
