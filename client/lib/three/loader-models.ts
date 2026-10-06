import type * as Three from "three";

type T = typeof Three;
/* eslint-disable @typescript-eslint/no-explicit-any -- the model builders are untyped design JS */
type Builders = Record<string, (THREE: T, opts?: object) => any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface Built {
  obj: Three.Object3D;
  /** Per-frame animation, given seconds since start. */
  tick?: (t: number) => void;
}

export interface LoaderModel {
  key: string;
  name: string;
  where: string;
  load: () => Promise<unknown>;
  build: (THREE: T, M: Builders) => Built;
}

// Objects from the landing scene, shown by the route loader (model-loader.js).
export const LOADER_MODELS: LoaderModel[] = [
  {
    key: "gavel",
    name: "Gavel and sound block",
    where: "the judge’s bench",
    load: () => import("./models/gavel.js"),
    build: (THREE, M) => {
      const { gavel, block } = M.buildGavel(THREE);
      const g = new THREE.Group();
      block.position.set(0.05, 0, 0);
      g.add(block);
      gavel.rotation.set(-0.062, -2.2, 0);
      gavel.position.set(-0.02, 0.0145, 0.12);
      g.add(gavel);
      return { obj: g };
    },
  },
  {
    key: "inkwell",
    name: "Inkwell and pen set",
    where: "the chambers desk",
    load: () => import("./models/furnishings.js"),
    build: (THREE, M) => ({ obj: M.buildInkwellSet(THREE).set }),
  },
  {
    key: "typewriter",
    name: "Stenographer’s typewriter",
    where: "the court reporter’s desk",
    load: () => import("./models/courtroom.js"),
    build: (THREE, M) => {
      const TW = M.buildTypewriter(THREE);
      let x = 0.09,
        next = 0,
        key = -1,
        keyT = 0,
        ret = 0,
        from = 0;
      return {
        obj: TW.typewriter,
        tick: (t) => {
          if (!ret && t > next) {
            if (key >= 0) TW.keys.setMatrixAt(key, TW.keyBase[key]);
            key = (Math.random() * TW.keyBase.length) | 0;
            keyT = t;
            TW.keys.setMatrixAt(
              key,
              TW.keyBase[key]
                .clone()
                .premultiply(new THREE.Matrix4().makeTranslation(0, -0.0035, 0.0015)),
            );
            TW.keys.instanceMatrix.needsUpdate = true;
            x -= 0.0045;
            next = t + 0.07 + Math.random() * 0.12;
            if (x < -0.09) {
              ret = t;
              from = x;
            }
          }
          if (key >= 0 && t - keyT > 0.06) {
            TW.keys.setMatrixAt(key, TW.keyBase[key]);
            TW.keys.instanceMatrix.needsUpdate = true;
            key = -1;
          }
          if (ret) {
            const r = Math.min(1, (t - ret) / 0.4);
            TW.carriage.position.x = from + (0.09 - from) * r * r * (3 - 2 * r);
            if (r >= 1) {
              ret = 0;
              x = 0.09;
            }
          } else TW.carriage.position.x += (x - TW.carriage.position.x) * 0.5;
        },
      };
    },
  },
  {
    key: "lamp",
    name: "Banker’s lamp",
    where: "the law library",
    load: () => import("./models/furniture.js"),
    build: (THREE, M) => ({ obj: M.buildBankerLamp(THREE).lamp }),
  },
  {
    key: "clock",
    name: "Longcase clock",
    where: "the corridor",
    load: () => import("./models/furniture.js"),
    build: (THREE, M) => {
      const g = M.buildClockCase(THREE).clock;
      const dial = new THREE.Mesh(
        new THREE.CylinderGeometry(0.21, 0.21, 0.02, 48).rotateX(Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: "#efe6d3", roughness: 0.6 }),
      );
      dial.position.set(0, 2.06, 0.215);
      g.add(dial);
      const p = M.buildPendulum(THREE);
      p.position.set(0, 1.62, 0.04);
      g.add(p);
      return { obj: g, tick: (t) => (p.rotation.z = Math.cos(t * Math.PI) * 0.12) };
    },
  },
  {
    key: "seal",
    name: "Wax seal",
    where: "the sealed case files",
    load: () => import("./models/seal.js"),
    build: (THREE, M) => {
      const W = M.buildWaxSeal(THREE);
      return {
        obj: W.seal,
        tick: (t) => {
          const b = (Math.sin(t * 1.11) + 1) / 2,
            e = b * b * (3 - 2 * b);
          W.halfA.position.set(0.005 * e, 0.0045 * e, 0);
          W.halfB.position.set(-0.005 * e, 0.0045 * e, 0);
          W.halfA.rotation.z = -0.14 * e;
          W.halfB.rotation.z = 0.14 * e;
        },
      };
    },
  },
  {
    key: "plaque",
    name: "Door name plaque",
    where: "the chambers door",
    load: () => import("./models/furnishings.js"),
    build: (THREE, M) => ({ obj: M.buildNamePlaque(THREE).plaque }),
  },
  {
    key: "chair",
    name: "Judge’s chair",
    where: "the bench",
    load: () => import("./models/furnishings.js"),
    build: (THREE, M) => ({ obj: M.buildJudgesChair(THREE).chair }),
  },
  {
    key: "stand",
    name: "Witness stand",
    where: "the courtroom",
    load: () => import("./models/courtroom.js"),
    build: (THREE, M) => ({ obj: M.buildWitnessStand(THREE).stand }),
  },
  {
    key: "lantern",
    name: "Street lantern",
    where: "the court steps",
    load: () => import("./models/exterior.js"),
    build: (THREE, M) => ({ obj: M.buildLantern(THREE).lantern }),
  },
  {
    key: "club",
    name: "Club chair",
    where: "the barristers’ lounge",
    load: () => import("./models/lounge.js"),
    build: (THREE, M) => ({ obj: M.buildClubChair(THREE).chair }),
  },
  {
    key: "sconce",
    name: "Wall sconce",
    where: "the panelled corridor",
    load: () => import("./models/furnishings.js"),
    build: (THREE, M) => ({ obj: M.buildSconce(THREE).sconce }),
  },
];

const LAST_KEY = "courtLoaderLast";

/** A random model, never the same one twice in a row. */
export function pickLoaderModel(): LoaderModel {
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_KEY);
  } catch {
    /* storage unavailable */
  }
  const pool = LOADER_MODELS.filter((m) => m.key !== last);
  const model = pool[(Math.random() * pool.length) | 0];
  try {
    localStorage.setItem(LAST_KEY, model.key);
  } catch {
    /* storage unavailable */
  }
  return model;
}

export type { Builders };
