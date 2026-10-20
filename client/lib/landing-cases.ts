// Landing data, generated from the design handoff's courtroom-data.js. The case copy is draft
// placeholder content: original fictional cases (no film names, characters or signature details).

export interface LandingCase {
  id: string;
  title: string;
  /** The question the case turns on. */
  q: string;
  area: string;
  docket: string;
  court: string;
  difficulty: string;
  duration: string;
  closing: string;
  summary: string;
  inspired: string;
  cover: { bg: string; ink: string; accent: string };
  timeline: { t: string; d: string }[];
  board: { t: string; d: string }[];
  final: { label: string; lines: string[] };
  /** Documents in the 3D case file: kind → [title, caption]. */
  docs: Record<string, [string, string]>;
}

export interface LandingAct {
  n: string;
  name: string;
  /** Scroll progress where the act starts and ends (0–1). */
  a: number;
  b: number;
}

/** A placeholder model in the 3D scene. Set `src` to a .glb URL to swap in a production model. */
export interface LandingAsset {
  id: string;
  object: string;
  file: string;
  type: string;
  src?: string;
}

/** Always one of the three files on the desk. */
const FIXED_CASE: LandingCase = {
  id: "snowwhite",
  timeline: [
    {
      t: "DAY 0 · 23:40",
      d: "Queen seen leaving the castle alone",
    },
    {
      t: "DAY 0 · 23:55",
      d: "Dwarfs gather at Blackthorn Pass",
    },
    {
      t: "DAY 1 · 00:00",
      d: "Queen goes over the cliff",
    },
    {
      t: "DAY 1 · 00:20",
      d: "Snow White still at the village mela",
    },
    {
      t: "DAYS 1–9",
      d: "River searched. No body found",
    },
    {
      t: "DAY 12",
      d: "Royal cloak found, dry and folded",
    },
  ],
  inspired: "Based on the Brothers Grimm fairy tale",
  title: "State v. Snow White",
  q: "Did she conspire to kill the Queen?",
  area: "Criminal Law",
  docket: "Sessions Case No. 413 of 2026",
  court: "IN THE COURT OF THE SESSIONS JUDGE",
  difficulty: "Advanced",
  duration: "≈ 60 min trial",
  closing: "NO BODY. ONE APPROVER. YOUR MOVE.",
  summary:
    "Snow White is charged under Sections 61(2) and 103 of the Bharatiya Nyaya Sanhita. The prosecution says she persuaded the Seven Dwarfs to push the Queen off Blackthorn Cliff. She says the dwarfs acted alone.",
  cover: {
    bg: "#b08d58",
    ink: "#2a1b0e",
    accent: "#7a2a1f",
  },
  board: [
    {
      t: "The initial incident",
      d: "Blackthorn Cliff, midnight. The Queen goes over the edge. The Seven Dwarfs are arrested at the scene.",
    },
    {
      t: "Witness testimony",
      d: "One of the seven has turned approver. He testifies that Snow White planned it and promised them the castle.",
    },
    {
      t: "Contradicting evidence",
      d: "Snow White was seen at a village mela two kilometres away. No message from her to the dwarfs was ever found.",
    },
    {
      t: "The critical discovery",
      d: "The river below was searched for nine days. No body was ever found.",
    },
  ],
  final: {
    label: "Search panchnama",
    lines: ["DAY 1   RIVER DRAGGED · NO BODY", "DAY 9   SEARCH CLOSED · NO BODY", "DAY 12  ROYAL CLOAK FOUND · DRY, FOLDED"],
  },
  docs: {
    police: [
      "First Information Report",
      "FIR No. 0413/2026 under s. 173 BNSS. Seven accused detained at Blackthorn Cliff. One has sought pardon as an approver.",
    ],
    photo: ["Evidence Photograph", "Cliff edge, Blackthorn Pass"],
    tag: ["Material Object", "M.O. 2 · Torn royal sash"],
    witness: ["Approver’s Statement", "“She told us the castle would be ours once the Queen was gone.” — Approver D."],
    transcript: ["Examination of Accused", "Q: Did you ask the dwarfs to harm the Queen?  A: I never asked anyone to hurt her."],
    news: ["The Enchanted Times", "QUEEN LOST AT BLACKTHORN CLIFF"],
    note: ["Handwritten Note", "Where is the body?"],
    notice: ["Charge Sheet", "Charges under ss. 61(2) and 103 BNS"],
  },
};

const CASE_POOL: LandingCase[] = [
  {
    id: "alibi",
    timeline: [
      {
        t: "14 NOV · 20:10",
        d: "Rohan seen near the Kulkarni orchard",
      },
      {
        t: "14 NOV · 23:30",
        d: "Rohan’s phone goes silent",
      },
      {
        t: "15 NOV · 07:00",
        d: "Kulkarnis take the early train to Belagavi",
      },
      {
        t: "15 NOV · 19:00",
        d: "Wedding, lodge, temple: every receipt kept",
      },
      {
        t: "16 NOV · 02:00",
        d: "Orchard beds dug and replanted overnight",
      },
      {
        t: "21 NOV",
        d: "Rohan’s scooter found in the canal",
      },
    ],
    inspired: "",
    title: "State v. Mohan Kulkarni",
    q: "Where was the family on 14 November?",
    area: "Criminal Law",
    docket: "Sessions Case No. 118 of 2026",
    court: "IN THE COURT OF THE SESSIONS JUDGE",
    difficulty: "Advanced",
    duration: "≈ 60 min trial",
    closing: "RECEIPTS CAN LIE. CAN YOU PROVE IT?",
    summary:
      "A minister’s nephew vanished on the night of 14 November. Hardware-shop owner Mohan Kulkarni and his family say they were at a cousin’s wedding in Belagavi. Every bill, ticket and witness agrees with them. The police say that is exactly the problem.",
    cover: {
      bg: "#5a1e1a",
      ink: "#ead9b8",
      accent: "#c9a45c",
    },
    board: [
      {
        t: "The initial incident",
        d: "Night of 14 November. Rohan Pai, 19, is last seen near the Kulkarni orchard. His scooter is later found in the canal.",
      },
      {
        t: "Witness testimony",
        d: "The wedding caterer, a lodge clerk and a ticket inspector all place the Kulkarnis in Belagavi that night.",
      },
      {
        t: "Contradicting evidence",
        d: "Every receipt the family kept is dated 15 November. None of them proves where they were on the 14th.",
      },
      {
        t: "The critical discovery",
        d: "The orchard beds were dug and replanted on the night of the 16th. No one has dug there since.",
      },
    ],
    final: {
      label: "Orchard labour register",
      lines: ["NOV 15  FAMILY AWAY · NO WORK LOGGED", "NOV 16  BEDS DUG · NIGHT WORK · NO NAMES", "NOV 17  REGISTER · PAGE MISSING"],
    },
    docs: {
      police: ["Missing Person FIR", "FIR No. 0118/2026 under s. 173 BNSS. Rohan Pai, 19, missing since the night of 14 November."],
      photo: ["Evidence Photograph", "Scooter recovered from the canal"],
      tag: ["Material Object", "M.O. 5 · Mobile phone SIM"],
      witness: ["Witness Statement", "“All four of them ate at the second sitting. I served them myself.” — Wedding caterer"],
      transcript: [
        "Examination of Accused",
        "Q: Where were you on the night of 14 November?  A: At my cousin’s wedding in Belagavi, with my family.",
      ],
      news: ["The Konkan Herald", "MINISTER’S NEPHEW STILL MISSING"],
      note: ["Handwritten Note", "Why keep every receipt?"],
      notice: ["Charge Sheet", "Charges under ss. 103 and 238 BNS"],
    },
  },
  {
    id: "ransom",
    timeline: [
      {
        t: "20:30",
        d: "Seth Dinanath’s grandson kidnapped",
      },
      {
        t: "21:04",
        d: "Ransom call crosses to the chawl line",
      },
      {
        t: "21:19",
        d: "Housemates ring the family: ₹2 crore",
      },
      {
        t: "22:15",
        d: "Real ransom paid to the kidnapper",
      },
      {
        t: "22:40",
        d: "Kidnapper calls to confirm",
      },
      {
        t: "23:30",
        d: "Three men held at the bridge with newspaper",
      },
    ],
    inspired: "",
    title: "State v. Manoj, Iqbal and Harish",
    q: "Who does the ransom belong to?",
    area: "Criminal Law",
    docket: "Sessions Case No. 207 of 2026",
    court: "IN THE COURT OF THE SESSIONS JUDGE",
    difficulty: "Foundational",
    duration: "≈ 40 min trial",
    closing: "THE MONEY WAS NEVER THEIRS. WAS THE CRIME?",
    summary:
      "Three broke housemates took a wrong-number call from a kidnapper demanding ₹1 crore. Instead of calling the police, they rang the family themselves and asked for double.",
    cover: {
      bg: "#2d3a33",
      ink: "#e3d6b6",
      accent: "#b08a4a",
    },
    board: [
      {
        t: "The initial incident",
        d: "A crossed line in a Mumbai chawl. A kidnapper’s ransom call reaches the housemates’ telephone by mistake.",
      },
      {
        t: "Witness testimony",
        d: "The victim’s grandfather says a second caller demanded ₹2 crore and a meeting at the bridge.",
      },
      {
        t: "Contradicting evidence",
        d: "Call records show the three had never met or spoken to the real kidnapper.",
      },
      {
        t: "The critical discovery",
        d: "The bag they collected held only newspaper. The real ransom had gone to the kidnapper an hour earlier.",
      },
    ],
    final: {
      label: "Telephone exchange log",
      lines: ["21:04  RANSOM CALL · CROSSED TO 2231", "21:19  2231 → VICTIM’S HOME · 6 MIN", "22:40  KIDNAPPER → VICTIM’S HOME · 2 MIN"],
    },
    docs: {
      police: [
        "First Information Report",
        "FIR No. 0207/2026 under s. 173 BNSS. Kidnapping for ransom. Three men detained at the bridge with a bag of newspaper.",
      ],
      photo: ["Evidence Photograph", "Bag recovered at the bridge"],
      tag: ["Material Object", "M.O. 3 · Rotary telephone"],
      witness: [
        "Witness Statement",
        "“A second man rang. He wanted twice as much and kept arguing with someone.” — Seth Dinanath, grandfather",
      ],
      transcript: ["Examination of Accused", "Q: Why did you call the family?  A: We only wanted to pay the rent."],
      news: ["Mumbai Evening Mirror", "RANSOM ROW: THREE HELD AT BRIDGE"],
      note: ["Handwritten Note", "Accomplices, or just opportunists?"],
      notice: ["Charge Sheet", "Charges under s. 308 BNS (Extortion)"],
    },
  },
  {
    id: "exam",
    timeline: [
      {
        t: "19:30",
        d: "Dean seals the new paper (v2)",
      },
      {
        t: "19:45",
        d: "Old draft (v1) left on the desk",
      },
      {
        t: "01:10",
        d: "Office window forced",
      },
      {
        t: "01:25",
        d: "Envelope opened. One student refuses to look",
      },
      {
        t: "02:00",
        d: "Photocopy torn up in the hostel",
      },
      {
        t: "09:00",
        d: "Exam held with paper v2",
      },
    ],
    inspired: "",
    title: "State v. Kabir, Neel and Tushar",
    q: "Is it a crime if they never used the paper?",
    area: "Criminal Law",
    docket: "C.C. No. 342 of 2026",
    court: "IN THE COURT OF THE JUDICIAL MAGISTRATE FIRST CLASS",
    difficulty: "Foundational",
    duration: "≈ 35 min trial",
    closing: "THEY OPENED IT. DID THEY USE IT?",
    summary:
      "Three final-year engineering students broke into the Dean’s office at night and opened the sealed exam envelope. One refused to look. The Dean wants them prosecuted. They say nothing was taken and nothing was used.",
    cover: {
      bg: "#22304a",
      ink: "#e3d6b6",
      accent: "#c9a45c",
    },
    board: [
      {
        t: "The initial incident",
        d: "Dean’s office, 1 a.m. The window latch is forced and the sealed exam envelope is found opened.",
      },
      {
        t: "Witness testimony",
        d: "The night watchman saw three students climb out of the window. One kept apologising.",
      },
      {
        t: "Contradicting evidence",
        d: "The paper was photocopied, but the copy was torn up in the hostel before the exam.",
      },
      {
        t: "The critical discovery",
        d: "The Dean had changed the paper that evening. The one they opened was an old draft.",
      },
    ],
    final: {
      label: "Exam cell dispatch register",
      lines: ["19:30  PAPER v2 SEALED · DEAN", "19:45  DRAFT v1 LEFT IN OFFICE", "01:10  OFFICE WINDOW · FORCED"],
    },
    docs: {
      police: ["Police Complaint", "Complaint by the Dean. Office window forced at night; sealed exam envelope opened."],
      photo: ["Evidence Photograph", "Dean’s office window"],
      tag: ["Material Object", "M.O. 1 · Opened exam envelope"],
      witness: ["Witness Statement", "“Three boys climbing out the window at one in the morning. One kept saying sorry.” — Night watchman"],
      transcript: [
        "Examination of Accused",
        "Q: Why did you refuse to look at the paper?  A: It felt wrong. I shut my eyes and waited outside.",
      ],
      news: ["Campus Times", "EXAM PAPER BREAK-IN AT INSTITUTE"],
      note: ["Handwritten Note", "Old draft or the real paper?"],
      notice: ["Charge Sheet", "Charges under s. 329 BNS (Criminal trespass)"],
    },
  },
];

export const ACTS: LandingAct[] = [
  {
    n: "I",
    name: "The Law Firm",
    a: 0,
    b: 0.08,
  },
  {
    n: "II",
    name: "The Office",
    a: 0.08,
    b: 0.3,
  },
  {
    n: "III",
    name: "The Pending Cases",
    a: 0.3,
    b: 0.46,
  },
  {
    n: "IV",
    name: "The Case Opens",
    a: 0.46,
    b: 0.585,
  },
  {
    n: "V",
    name: "Investigation Board",
    a: 0.585,
    b: 0.785,
  },
  {
    n: "VI",
    name: "The Final Connection",
    a: 0.785,
    b: 0.84,
  },
  {
    n: "VII",
    name: "Follow the Evidence",
    a: 0.84,
    b: 0.9,
  },
  {
    n: "VIII",
    name: "Courtroom Doors",
    a: 0.9,
    b: 0.945,
  },
  {
    n: "IX",
    name: "Court Is in Session",
    a: 0.945,
    b: 1.01,
  },
];

export const ASSETS: LandingAsset[] = [
  {
    id: "law_firm_facade",
    object: "Law firm facade",
    file: "environments/law_firm_facade.glb",
    type: "Environment",
  },
  {
    id: "entrance_steps",
    object: "Stone entrance steps",
    file: "environments/entrance_steps.glb",
    type: "Environment",
  },
  {
    id: "law_firm_entrance_door",
    object: "Law firm entrance door",
    file: "environments/law_firm_entrance_door.glb",
    type: "Environment / hero prop",
  },
  {
    id: "door_brass_handle",
    object: "Brass lever handle",
    file: "props/door_brass_handle.glb",
    type: "Prop",
  },
  {
    id: "door_lock_escutcheon",
    object: "Lock escutcheon",
    file: "props/door_lock_escutcheon.glb",
    type: "Prop",
  },
  {
    id: "brass_name_plaque",
    object: "Brass plaque “AI COURTROOM”",
    file: "props/brass_name_plaque.glb",
    type: "Prop",
  },
  {
    id: "brass_wall_lantern",
    object: "Brass carriage lantern ×2",
    file: "props/brass_wall_lantern.glb",
    type: "Prop",
  },
  {
    id: "wooden_pillar",
    object: "Fluted wooden pillar ×2",
    file: "environments/wooden_pillar.glb",
    type: "Environment",
  },
  {
    id: "facade_window",
    object: "Sash window ×4",
    file: "environments/facade_window.glb",
    type: "Environment",
  },
  {
    id: "door_light_spill",
    object: "Interior light spill",
    file: "vfx/door_light_spill (procedural)",
    type: "VFX",
  },
  {
    id: "law_office",
    object: "Law office shell",
    file: "environments/law_office.glb",
    type: "Environment",
  },
  {
    id: "office_pocket_doors",
    object: "Hidden pocket doors",
    file: "environments/office_pocket_doors.glb",
    type: "Environment",
  },
  {
    id: "law_bookshelf",
    object: "Law bookcase ×11",
    file: "furniture/law_bookshelf.glb",
    type: "Furniture",
  },
  {
    id: "law_books_set",
    object: "Law book set",
    file: "props/law_books_set.glb",
    type: "Prop (instanced)",
  },
  {
    id: "office_chandelier",
    object: "Two-tier crystal chandelier",
    file: "props/office_chandelier.glb",
    type: "Prop / light source",
  },
  {
    id: "leather_club_chair",
    object: "Chesterfield club chair ×2",
    file: "furniture/leather_club_chair.glb",
    type: "Furniture",
  },
  {
    id: "walnut_side_table",
    object: "Walnut side table",
    file: "furniture/walnut_side_table.glb",
    type: "Furniture",
  },
  {
    id: "library_table",
    object: "Library reading table",
    file: "furniture/library_table.glb",
    type: "Furniture",
  },
  {
    id: "antique_longcase_clock",
    object: "Antique longcase clock",
    file: "furniture/antique_longcase_clock.glb",
    type: "Furniture",
  },
  {
    id: "framed_certificate",
    object: "Wall display ×5 + calendar",
    file: "props/framed_certificate.glb",
    type: "Prop",
  },
  {
    id: "office_rug",
    object: "Persian rug",
    file: "props/office_rug.glb",
    type: "Prop",
  },
  {
    id: "oak_lawyer_desk",
    object: "Oak lawyer’s desk",
    file: "furniture/oak_lawyer_desk.glb",
    type: "Furniture",
  },
  {
    id: "leather_office_chair",
    object: "Leather office chair",
    file: "furniture/leather_office_chair.glb",
    type: "Furniture",
  },
  {
    id: "banker_lamp",
    object: "Banker’s lamp ×4",
    file: "props/banker_lamp.glb",
    type: "Prop",
  },
  {
    id: "inkwell_pen_set",
    object: "Inkwell & pen",
    file: "props/inkwell_pen_set.glb",
    type: "Prop",
  },
  {
    id: "paper_stack",
    object: "Paper stack ×3",
    file: "props/paper_stack.glb",
    type: "Prop",
  },
  {
    id: "case_file",
    object: "Case file ×3",
    file: "case/case_file.glb",
    type: "Prop",
  },
  {
    id: "wax_seal",
    object: "Red wax seal",
    file: "case/wax_seal.glb",
    type: "Prop",
  },
  {
    id: "case_string",
    object: "Red binding string",
    file: "case/case_string.glb",
    type: "Prop",
  },
  {
    id: "police_report",
    object: "Police / incident report",
    file: "evidence/police_report.glb",
    type: "Prop",
  },
  {
    id: "evidence_photo",
    object: "Crime-scene photograph",
    file: "evidence/evidence_photo.glb",
    type: "Prop",
  },
  {
    id: "evidence_tag",
    object: "Evidence tag",
    file: "evidence/evidence_tag.glb",
    type: "Prop",
  },
  {
    id: "witness_statement",
    object: "Witness statement",
    file: "evidence/witness_statement.glb",
    type: "Prop",
  },
  {
    id: "interview_transcript",
    object: "Interview transcript",
    file: "evidence/interview_transcript.glb",
    type: "Prop",
  },
  {
    id: "newspaper_clipping",
    object: "Newspaper clipping",
    file: "evidence/newspaper_clipping.glb",
    type: "Prop",
  },
  {
    id: "handwritten_note",
    object: "Handwritten note",
    file: "evidence/handwritten_note.glb",
    type: "Prop",
  },
  {
    id: "legal_notice",
    object: "Legal notice",
    file: "evidence/legal_notice.glb",
    type: "Prop",
  },
  {
    id: "critical_evidence",
    object: "Critical discovery",
    file: "evidence/critical_evidence.glb",
    type: "Prop",
  },
  {
    id: "investigation_board",
    object: "Investigation board",
    file: "case/investigation_board.glb",
    type: "Environment",
  },
  {
    id: "board_timeline_strip",
    object: "Timeline strip",
    file: "case/board_timeline_strip.glb",
    type: "Prop",
  },
  {
    id: "case_summary_card",
    object: "Central case card",
    file: "case/case_summary_card.glb",
    type: "Prop",
  },
  {
    id: "push_pin",
    object: "Push pin",
    file: "case/push_pin.glb",
    type: "Prop (instanced)",
  },
  {
    id: "red_thread",
    object: "Red thread",
    file: "procedural TubeGeometry",
    type: "VFX / geometry",
  },
  {
    id: "courtroom_hallway",
    object: "Courtroom corridor",
    file: "environments/courtroom_hallway.glb",
    type: "Environment",
  },
  {
    id: "hallway_runner",
    object: "Carpet runner",
    file: "props/hallway_runner.glb",
    type: "Prop",
  },
  {
    id: "wall_sconce",
    object: "Wall sconce ×10",
    file: "props/wall_sconce.glb",
    type: "Prop",
  },
  {
    id: "portrait_frame",
    object: "Portrait frame ×4",
    file: "props/portrait_frame.glb",
    type: "Prop",
  },
  {
    id: "courtroom_doors",
    object: "Courtroom double doors",
    file: "environments/courtroom_doors.glb",
    type: "Environment",
  },
  {
    id: "courtroom_door_handle",
    object: "Courtroom door lever ×2",
    file: "props/courtroom_door_handle.glb",
    type: "Prop",
  },
  {
    id: "courtroom_plaque",
    object: "Courtroom lintel plaque",
    file: "props/courtroom_plaque.glb",
    type: "Prop",
  },
  {
    id: "courtroom",
    object: "Courtroom shell",
    file: "environments/courtroom.glb",
    type: "Environment",
  },
  {
    id: "gallery_bench",
    object: "Gallery bench ×10",
    file: "courtroom/gallery_bench.glb",
    type: "Furniture",
  },
  {
    id: "bar_rail",
    object: "Bar rail & gate",
    file: "courtroom/bar_rail.glb",
    type: "Furniture",
  },
  {
    id: "counsel_table",
    object: "Counsel table ×2",
    file: "courtroom/counsel_table.glb",
    type: "Furniture",
  },
  {
    id: "witness_stand",
    object: "Witness box ×2",
    file: "courtroom/witness_stand.glb",
    type: "Furniture",
  },
  {
    id: "stenographer_desk",
    object: "Stenographer’s desk",
    file: "courtroom/stenographer_desk.glb",
    type: "Furniture",
  },
  {
    id: "stenographer_typewriter",
    object: "Typewriter",
    file: "props/stenographer_typewriter.glb",
    type: "Prop",
  },
  {
    id: "judges_bench",
    object: "Judge’s bench & dais",
    file: "courtroom/judges_bench.glb",
    type: "Furniture",
  },
  {
    id: "judges_chair",
    object: "Judge’s chair",
    file: "courtroom/judges_chair.glb",
    type: "Furniture",
  },
  {
    id: "ai_judge",
    object: "AI Judge (robed figure)",
    file: "characters/ai_judge.glb",
    type: "Character",
  },
  {
    id: "courtroom_gavel",
    object: "Gavel",
    file: "courtroom/courtroom_gavel.glb",
    type: "Prop",
  },
  {
    id: "sound_block",
    object: "Sound block",
    file: "courtroom/sound_block.glb",
    type: "Prop",
  },
  {
    id: "court_seal",
    object: "Brass court seal ×2",
    file: "courtroom/court_seal.glb",
    type: "Prop",
  },
  {
    id: "court_drapes",
    object: "Velvet drapes",
    file: "courtroom/court_drapes.glb",
    type: "Environment",
  },
  {
    id: "window_light_shaft",
    object: "Window light shafts",
    file: "vfx/window_light_shaft (procedural)",
    type: "VFX",
  },
];

const shuffle = <T>(arr: T[]) => {
  const o = arr.slice();
  for (let k = o.length - 1; k > 0; k--) {
    const r = Math.floor(Math.random() * (k + 1));
    [o[k], o[r]] = [o[r], o[k]];
  }
  return o;
};

let picked: LandingCase[] | null = null;

/**
 * The three files on the desk: the fixed case and two random ones, in random order, never the same
 * set twice in a row. Picked once per page load, so the 3D files and the page copy agree.
 */
export function pickCases(): LandingCase[] {
  if (picked) return picked;
  let last = "";
  try {
    last = localStorage.getItem("aiCourtroom-lastCases") || "";
  } catch {
    // Storage blocked: any order will do.
  }
  let order: LandingCase[];
  let tries = 0;
  do order = shuffle([FIXED_CASE, ...shuffle(CASE_POOL).slice(0, 2)]);
  while (order.map((c) => c.id).join(",") === last && ++tries < 12);
  try {
    localStorage.setItem("aiCourtroom-lastCases", order.map((c) => c.id).join(","));
  } catch {
    // Not remembered; the next visit may repeat the set.
  }
  return (picked = order);
}
