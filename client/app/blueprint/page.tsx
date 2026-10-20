import type { Metadata } from "next";
import DocPage from "@/components/docs/doc-page";
import { K, Sec } from "@/components/docs/kit";
import { ACTS, ASSETS } from "@/lib/landing-cases";
import { roman } from "@/lib/utils";

export const metadata: Metadata = {
  title: "3D Asset Blueprint",
  description: "How the 3D landing experience is built: scroll choreography, asset register and models.",
  robots: { index: false }, // a developer reference, reached from the landing's Blueprint toggle
};

// What happens in each act of the landing scroll, in ACTS order.
const ACT_NOTES = [
  "Night exterior; the scene fades up from the loader with a slow push-in. Hover tilts the handle; click (or scroll) turns it, releases the lock and swings the door open while the camera walks through.",
  "The camera walks through the library, glancing left at the club chairs and right at the longcase clock, which shows the visitor’s real time.",
  "Desk close-up. Hover lifts a file and shows its brief. Choosing one stacks the other two at the right of the desk. Gate at 0.36.",
  "The seal breaks, the string snaps, the cover opens. The documents slide out and fan across the desk. Hover lifts, click inspects.",
  "The board rises from the floor. Documents fly to their pins. Scroll pans left to right across four stations while threads draw in.",
  "The final evidence drops in and a thread joins it to the case card. All threads glow, then the board sinks.",
  "The pocket doors part. The main red thread leaves the right edge of the board, drops to the floor and runs beside the runner toward the courtroom doors.",
  "The handles turn, the doors swing in, light floods the corridor, and the thread passes beneath the doors.",
  "Down the aisle to the bench. The judge raises the gavel and strikes once, then the final call to action appears.",
];

const FOLDERS: Record<string, string> = {
  environments: "Environments",
  furniture: "Furniture",
  props: "Props",
  case: "Case file",
  evidence: "Evidence",
  courtroom: "Courtroom",
  characters: "Characters",
  vfx: "Effects",
};

// Models built in code: [name, file in lib/three/models, builders, moving parts].
const MODELS: [string, string, string, string][] = [
  ["Entrance door, lever, escutcheon", "door.js", "buildDoor", "Lever turns, door swings"],
  ["Wooden pillar and carriage lantern", "exterior.js", "buildPillar · buildLantern", "Lantern light flickers"],
  ["Sash window", "exterior.js", "buildWindow", "None"],
  ["Law firm facade", "exterior.js", "buildFacade", "None"],
  ["Stone entrance steps", "exterior.js", "buildSteps", "None"],
  ["Office walls", "interior.js", "buildPanelledWall", "None"],
  ["Courtroom walls, windows, coffered ceiling", "courtroom-room.js", "buildCourtWall · buildCourtWindow · buildCourtCeiling", "None"],
  ["Bar rail, bar gate, aisle runner", "courtroom-room.js", "buildBarRail · buildBarGate · buildAisleRunner", "None"],
  ["Door name plaque", "furnishings.js", "buildNamePlaque", "None"],
  ["Office pocket doors", "furnishings.js", "buildPocketDoor", "Leaves slide apart"],
  ["Office rug", "furnishings.js", "buildRug", "None"],
  ["Side table and library table", "furnishings.js", "buildSideTable · buildLibraryTable", "None"],
  ["Inkwell and pen set", "furnishings.js", "buildInkwellSet", "None"],
  ["Hallway sconce and portrait frame", "furnishings.js", "buildSconce · buildPortraitFrame", "None (sconce shared by 10)"],
  ["Judge’s bench and chair", "furnishings.js", "buildJudgesBench · buildJudgesChair", "None"],
  ["Gallery bench", "furnishings.js", "buildGalleryBench", "None (10 instanced)"],
  ["Counsel table", "furnishings.js", "buildCounselTable", "None"],
  ["Court drapes", "furnishings.js", "buildDrapes", "None"],
  ["Longcase clock and pendulum", "furniture.js", "buildClockCase · buildPendulum", "Pendulum, hands"],
  ["Chesterfield club chair", "lounge.js", "buildClubChair", "None"],
  ["Crystal chandelier", "library.js", "buildChandelier", "None"],
  ["Bookcase and books", "library.js", "buildBookcase · bookGeometry", "None (books instanced)"],
  ["Banker’s lamp", "furniture.js", "buildBankerLamp", "Glow"],
  ["Oak desk", "office.js", "buildDesk", "None"],
  ["Chesterfield office chair", "office.js", "buildOfficeChair", "None"],
  ["Wax seal", "seal.js", "buildWaxSeal", "Two halves crack apart"],
  ["Investigation board frame", "office.js", "buildBoardFrame", "Board rises and sinks"],
  ["Courtroom doors and plaque", "courtroom.js", "buildCourtDoorLeaf · buildCourtPlaque", "Levers turn down, leaves swing"],
  ["Witness box", "courtroom.js", "buildWitnessStand", "None"],
  ["Stenographer’s desk and typewriter", "courtroom.js", "buildStenoDesk · buildTypewriter", "Keys, carriage, paper feed"],
  ["AI judge", "judge.js", "buildJudge", "Gavel arm, breathing"],
  ["Gavel and sound block", "gavel.js", "buildGavel", "Strike"],
];

const CODE: [string, string][] = [
  ["components/landing/landing-3d.tsx", "The page: loader, top bar, act copy, calls to action. Mounts the scene once."],
  ["lib/three/courtroom-experience.js", "mount(container, overlay, options): the three.js scene, camera path, gates and animation."],
  ["lib/three/models/*.js", "The procedural model builders below. Static parts are merged per material (merge.js)."],
  ["lib/landing-cases.ts", "The case files on the desk, the acts (ACTS) and the asset manifest (ASSETS)."],
  ["lib/three/loader-models.ts", "Models shown by the route loader while a page loads."],
];

const SECTIONS: [string, string][] = [
  ["scroll", "Scroll choreography"],
  ["register", "Asset register"],
  ["models", "Procedural models"],
  ["folder", "Model folder"],
  ["code", "Where the code lives"],
  ["swap", "Swapping in a model"],
  ["budget", "Performance budget"],
];

const CODE_TEXT = "font-data text-[13px] text-seal";
const TH = "text-[10.5px] font-bold tracking-[0.14em] text-ink-label uppercase";
const ROW = "grid gap-3.5 border-b border-ink/15 py-2.5 text-[14px]/[1.45] text-[#2a2018]";

function groups() {
  const byFolder = new Map<string, typeof ASSETS>();
  for (const asset of ASSETS) {
    const folder = asset.file.split("/")[0];
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), asset]);
  }
  return [...byFolder.entries()];
}

export default function BlueprintPage() {
  const folders = groups();
  return (
    <DocPage
      current="/blueprint"
      kicker="The workshop · Landing experience"
      title="3D ASSET BLUEPRINT"
      lede={`How the 3D landing is built. Every object is a named placeholder group; ${ASSETS.length} assets in all. Units are metres, +Y up, −Z into the building, with the origin at the entrance threshold.`}
      form={["Form B-3", "Blueprint of the chambers"]}
      label="3D asset blueprint"
      index={SECTIONS}
    >
      <Sec id="scroll" n={`${roman(1)}.`} title="Scroll choreography">
        <p className={K.p}>
          One progress value from 0 to 1 drives the camera path, the objects and the text. Wheel, keys and touch move a target value, and
          the camera eases toward it. Two gates stop progress until the visitor acts: the door (0) and the case choice (0.36). Progress also
          holds at 0.962 until the gavel has struck.
        </p>
        <ul className={K.defs}>
          {ACTS.map((act, i) => (
            <li key={act.n} className={K.defRow}>
              <span className={K.term}>
                <span className="font-display text-seal">{act.n}</span> {act.name}
                <span className="block font-data text-[12px] font-normal text-ink-label">
                  {act.a.toFixed(3)} – {Math.min(1, act.b).toFixed(3)}
                </span>
              </span>
              <span className="text-[15px]/[1.55] text-pretty text-[#2a2018]">{ACT_NOTES[i]}</span>
            </li>
          ))}
        </ul>
      </Sec>

      <Sec id="register" n={`${roman(2)}.`} title="Asset register">
        <p className={K.p}>
          The manifest in <span className={CODE_TEXT}>lib/landing-cases.ts</span>, by folder. Scroll a table sideways on narrow screens.
        </p>
        {folders.map(([folder, assets]) => (
          <div key={folder} className="flex flex-col gap-1">
            <h3 className="m-0 flex items-baseline gap-3 border-b-2 border-ink pb-1.5 font-display text-[19px] font-normal">
              {FOLDERS[folder] ?? folder}
              <span className="font-data text-[12px] text-ink-label">{assets.length} assets</span>
            </h3>
            <div className="overflow-x-auto">
              <div className="min-w-160">
                <div className={`${ROW} grid-cols-[200px_260px_1fr_120px] ${TH}`}>
                  <span>Object</span>
                  <span>File</span>
                  <span>Type</span>
                  <span>Model</span>
                </div>
                {assets.map((asset) => (
                  <div key={asset.id} className={`${ROW} grid-cols-[200px_260px_1fr_120px]`}>
                    <span className="font-bold">{asset.object}</span>
                    <span className={`${CODE_TEXT} break-all`}>{asset.file}</span>
                    <span>{asset.type}</span>
                    <span className={asset.src ? "text-green" : "text-ink-label"}>{asset.src ? "Production" : "Placeholder"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </Sec>

      <Sec id="models" n={`${roman(3)}.`} title="Procedural models">
        <p className={K.p}>
          Detailed props are built in code, with nothing to download, from <span className={CODE_TEXT}>lib/three/models/</span>. Static
          parts are merged into one mesh per material when the scene loads; moving parts stay separate.
        </p>
        <div className="overflow-x-auto">
          <div className="min-w-180">
            <div className={`${ROW} grid-cols-[220px_150px_1fr_200px] ${TH}`}>
              <span>Model</span>
              <span>File</span>
              <span>Builder</span>
              <span>Moving parts</span>
            </div>
            {MODELS.map(([name, file, builders, moves]) => (
              <div key={name} className={`${ROW} grid-cols-[220px_150px_1fr_200px]`}>
                <span className="font-bold">{name}</span>
                <span className={CODE_TEXT}>{file}</span>
                <span className={CODE_TEXT}>{builders}</span>
                <span>{moves}</span>
              </div>
            ))}
          </div>
        </div>
      </Sec>

      <Sec id="folder" n={`${roman(4)}.`} title="Model folder">
        <p className={K.p}>
          Where production models go once they exist. Put them in <span className={CODE_TEXT}>client/public/models/</span> and they are
          served from <span className={CODE_TEXT}>/models/…</span>.
        </p>
        <div className="flex flex-col gap-3 overflow-x-auto bg-ink px-6 py-5 font-data text-[13px]/[1.7] text-[#d8ccb4]">
          <span className="text-amber-hi">public/models/</span>
          {folders.map(([folder, assets]) => (
            <div key={folder} className="flex flex-col whitespace-nowrap">
              <span className="text-[#e0786c]">├── {folder}/</span>
              {assets.map((asset) => (
                <span key={asset.id} className="pl-7">
                  │ ├── {asset.file.split("/").pop()}
                </span>
              ))}
            </div>
          ))}
        </div>
      </Sec>

      <Sec id="code" n={`${roman(5)}.`} title="Where the code lives">
        <p className={K.p}>
          The scene is plain three.js, mounted once by the React page; the page shows the copy and the controls, and the scene reports its
          progress back.
        </p>
        <ul className={K.defs}>
          {CODE.map(([path, what]) => (
            <li key={path} className={K.defRow}>
              <span className={`${CODE_TEXT} break-all`}>{path}</span>
              <span className="text-[15px]/[1.55] text-pretty text-[#2a2018]">{what}</span>
            </li>
          ))}
        </ul>
      </Sec>

      <Sec id="swap" n={`${roman(6)}.`} title="Swapping in a model">
        <p className={K.p}>
          Export the model as glTF binary to the listed path, then set <span className={CODE_TEXT}>src</span> on its entry in{" "}
          <span className={CODE_TEXT}>ASSETS</span> (for example <span className={CODE_TEXT}>/models/props/x.glb</span>
          ). When the scene loads, it replaces the placeholder meshes inside that object’s group with the model. The group keeps its
          position and pivot, so the animation code does not change.
        </p>
        <p className={K.note}>
          The door plaque shows the signed-in advocate’s name, and AI COURTROOM for visitors. Turn on Blueprint in the landing’s top bar
          (developer mode) to see each asset’s outline and label in place.
        </p>
      </Sec>

      <Sec id="budget" n={`${roman(7)}.`} title="Performance budget">
        <p className={K.p}>
          Target 60 fps on integrated GPUs at 1.5× pixel ratio. The light count stays fixed and only intensities change by zone, so shaders
          never recompile. Zones outside the camera’s range are hidden. Books, pins, balusters and benches are instanced. For production
          models, aim for under 250k triangles on screen, textures at 2k maximum in KTX2, Draco-compressed meshes, and about 12 MB in total.
        </p>
      </Sec>
    </DocPage>
  );
}
