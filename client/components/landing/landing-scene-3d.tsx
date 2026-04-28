"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  type MotionValue,
} from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

interface LandingScene3DProps {
  progress: MotionValue<number>;
  activeChapter: number;
  primaryCtaHref: string;
  secondaryCtaHref: string;
  secondaryCtaLabel: string;
}

type MovieStage = "intro" | "entering" | "files" | "timeline" | "cta";

interface DemoCase {
  id: string;
  title: string;
  section: string;
  tone: string;
  color: string;
  events: Array<{
    date: string;
    title: string;
    detail: string;
  }>;
}

const demoCases: DemoCase[] = [
  {
    id: "fraud",
    title: "State vs Rohit Mehta",
    section: "IPC 420",
    tone: "Fraud and inducement",
    color: "#7f2c25",
    events: [
      {
        date: "01 May",
        title: "Complaint registered",
        detail: "A payment dispute becomes a criminal cheating allegation.",
      },
      {
        date: "08 May",
        title: "Statements recorded",
        detail: "Parties describe contract terms and alleged misrepresentation.",
      },
      {
        date: "18 May",
        title: "Evidence prepared",
        detail: "Receipts, messages, and witness notes are arranged for review.",
      },
      {
        date: "26 May",
        title: "Arguments framed",
        detail: "Both sides test intent, reliance, and loss before the AI court.",
      },
    ],
  },
  {
    id: "property",
    title: "Asha Verma vs MetroBuild",
    section: "Civil dispute",
    tone: "Possession and title",
    color: "#243b5a",
    events: [
      {
        date: "03 Jun",
        title: "Suit filed",
        detail: "The plaintiff claims delayed handover and disputed possession.",
      },
      {
        date: "12 Jun",
        title: "Parties reviewed",
        detail: "Builder, buyer, and association roles are separated.",
      },
      {
        date: "19 Jun",
        title: "Documents grouped",
        detail: "Agreement clauses and notices become timeline anchors.",
      },
      {
        date: "28 Jun",
        title: "Relief tested",
        detail: "The simulation weighs damages, possession, and injunction scope.",
      },
    ],
  },
  {
    id: "witness",
    title: "State vs Karan S.",
    section: "Witness-led trial",
    tone: "Evidence and testimony",
    color: "#5b4321",
    events: [
      {
        date: "09 Jul",
        title: "Incident mapped",
        detail: "Facts are ordered into witness moments and disputed facts.",
      },
      {
        date: "16 Jul",
        title: "Witness examined",
        detail: "The AI witness gives context under direct questioning.",
      },
      {
        date: "23 Jul",
        title: "Cross prepared",
        detail: "Contradictions are marked for counter-questions.",
      },
      {
        date: "30 Jul",
        title: "Verdict analysis",
        detail: "The court-style analysis explains credibility and burden.",
      },
    ],
  },
];

export function LandingScene3D({
  progress,
  activeChapter,
  primaryCtaHref,
  secondaryCtaHref,
  secondaryCtaLabel,
}: LandingScene3DProps) {
  const [hasEnteredRoom, setHasEnteredRoom] = useState(false);
  const [isDoorAnimating, setIsDoorAnimating] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState(demoCases[0].id);
  const [timelineProgress, setTimelineProgress] = useState(0);
  const selectedCase =
    demoCases.find((demoCase) => demoCase.id === selectedCaseId) ??
    demoCases[0];

  const enterRoom = () => {
    if (hasEnteredRoom || isDoorAnimating) return;
    setIsDoorAnimating(true);
    window.setTimeout(() => {
      setHasEnteredRoom(true);
      setIsDoorAnimating(false);
    }, 900);
  };

  const selectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
  };

  useEffect(() => {
    if (activeChapter > 0) {
      setHasEnteredRoom(true);
      setIsDoorAnimating(false);
    } else if (activeChapter === 0) {
      setHasEnteredRoom(false);
    }
  }, [activeChapter]);

  useMotionValueEvent(progress, "change", (latest) => {
    if (activeChapter < 3) {
      setTimelineProgress(0);
      return;
    }

    const start = 0.52;
    const end = 0.84;
    const nextProgress = THREE.MathUtils.clamp(
      (latest - start) / (end - start),
      0,
      1,
    );
    setTimelineProgress(nextProgress);
  });

  const stage = useMemo<MovieStage>(() => {
    if (!hasEnteredRoom && activeChapter === 0) return "intro";
    if (isDoorAnimating) return "entering";
    if (activeChapter >= 4) return "cta";
    if (activeChapter >= 3) return "timeline";
    return "files";
  }, [activeChapter, hasEnteredRoom, isDoorAnimating]);

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#07080c]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_28%,rgba(197,161,90,0.22),transparent_24%),radial-gradient(circle_at_74%_72%,rgba(37,99,235,0.14),transparent_34%),linear-gradient(135deg,#07080c_0%,#11151d_48%,#08090d_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,8,12,0.99)_0%,rgba(7,8,12,0.92)_35%,rgba(7,8,12,0.34)_66%,rgba(7,8,12,0.56)_100%)] max-lg:bg-[linear-gradient(180deg,rgba(7,8,12,0.86)_0%,rgba(7,8,12,0.76)_52%,rgba(7,8,12,0.97)_100%)]" />

        <div className="absolute inset-y-0 right-0 w-[58vw] min-w-[620px] max-lg:w-full max-lg:min-w-0">
          <Canvas
            shadows
            dpr={[1, 1.6]}
            camera={{ position: [0, 1.3, 8], fov: 38 }}
            gl={{ antialias: true, alpha: true }}
          >
            <color attach="background" args={["#07080c"]} />
            <fog attach="fog" args={["#07080c", 7, 18]} />
            <ambientLight intensity={0.7} />
            <directionalLight
              castShadow
              intensity={2.2}
              position={[2.5, 5, 4]}
            />
            <pointLight
              intensity={25}
              position={[-1.5, 2.7, 2.6]}
              color="#d9ae61"
            />
            <pointLight
              intensity={7}
              position={[3.3, 1.4, 2.5]}
              color="#6bb7ff"
            />
            <MovieCamera stage={stage} />
            <MovieSet
              stage={stage}
              selectedCase={selectedCase}
              timelineProgress={timelineProgress}
              onDoorClick={enterRoom}
              onCaseClick={selectCase}
            />
          </Canvas>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-40 bg-linear-to-t from-[#07080c] to-transparent" />
        <div className="sr-only">Current scroll chapter {activeChapter + 1}</div>
      </div>

      <MovieOverlay
        stage={stage}
        selectedCase={selectedCase}
        timelineProgress={timelineProgress}
        primaryCtaHref={primaryCtaHref}
        secondaryCtaHref={secondaryCtaHref}
        secondaryCtaLabel={secondaryCtaLabel}
        onDoorClick={enterRoom}
        onCaseSelect={selectCase}
        onTimelineScroll={setTimelineProgress}
        onShowCta={() =>
          document
            .getElementById("chapter-5")
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
        onReset={() => {
          setTimelineProgress(0);
          setHasEnteredRoom(false);
          setIsDoorAnimating(false);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </>
  );
}

function MovieCamera({ stage }: { stage: MovieStage }) {
  const targets: Record<MovieStage, [number, number, number]> = {
    intro: [0.28, 1.4, 8.2],
    entering: [0, 1.55, 3.2],
    files: [0.4, 1.75, 5.7],
    timeline: [0.7, 1.95, 6.2],
    cta: [0.15, 1.7, 5.2],
  };

  const lookAtTargets: Record<MovieStage, [number, number, number]> = {
    intro: [0.28, 1.55, 0.02],
    entering: [0, 0.45, -1.2],
    files: [0, 0.45, -1.2],
    timeline: [0, 0.45, -1.2],
    cta: [0, 0.45, -1.2],
  };

  useFrame(({ camera }) => {
    const target = targets[stage];
    const lookAtTarget = lookAtTargets[stage];
    camera.position.lerp(new THREE.Vector3(...target), 0.055);
    camera.lookAt(...lookAtTarget);
  });

  return null;
}

interface MovieSetProps {
  stage: MovieStage;
  selectedCase: DemoCase;
  timelineProgress: number;
  onDoorClick: () => void;
  onCaseClick: (caseId: string) => void;
}

function MovieSet({
  stage,
  selectedCase,
  timelineProgress,
  onDoorClick,
  onCaseClick,
}: MovieSetProps) {
  const groupRef = useRef<THREE.Group>(null);
  const doorOpen = stage !== "intro";
  const fileMode = stage === "files" || stage === "timeline";
  const ctaMode = stage === "cta";

  useFrame(() => {
    if (!groupRef.current) return;
    const zTarget = stage === "intro" ? 0 : stage === "entering" ? 0.8 : 1.7;
    groupRef.current.position.z = THREE.MathUtils.lerp(
      groupRef.current.position.z,
      zTarget,
      0.04,
    );
  });

  return (
    <group ref={groupRef} position={[0, -0.5, 0]}>
      <Room />
      <Door open={doorOpen} onClick={onDoorClick} />
      <Table visible={fileMode || ctaMode} />
      <CaseFileStack
        visible={fileMode}
        spotlighted={stage === "files"}
        selectedCaseId={selectedCase.id}
        onCaseClick={onCaseClick}
      />
      <Timeline
        visible={stage === "timeline" || ctaMode}
        selectedCase={selectedCase}
        progress={timelineProgress}
      />
      <Courtroom visible={ctaMode} />
    </group>
  );
}

function Room() {
  return (
    <group>
      <mesh receiveShadow position={[0, -0.05, -1.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 11]} />
        <meshStandardMaterial color="#1b1110" roughness={0.82} />
      </mesh>
      <mesh receiveShadow position={[0, 2.2, -4.4]}>
        <boxGeometry args={[12, 5.2, 0.18]} />
        <meshStandardMaterial color="#151923" roughness={0.78} />
      </mesh>
      <mesh position={[0, 2.15, -4.26]}>
        <boxGeometry args={[7.2, 0.08, 0.08]} />
        <meshStandardMaterial color="#7b5b28" metalness={0.3} roughness={0.4} />
      </mesh>
    </group>
  );
}

function Door({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  const doorRootRef = useRef<THREE.Group>(null);
  const pivotRef = useRef<THREE.Group>(null);
  const handleRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (doorRootRef.current) {
      doorRootRef.current.rotation.y = THREE.MathUtils.lerp(
        doorRootRef.current.rotation.y,
        open ? 0 : 0.08,
        0.06,
      );
    }

    if (!pivotRef.current) return;
    const target = open ? -0.96 : 0;
    pivotRef.current.rotation.y = THREE.MathUtils.lerp(
      pivotRef.current.rotation.y,
      target,
      0.065,
    );

    if (!handleRef.current) return;
    handleRef.current.position.z =
      0.17 + Math.sin(clock.elapsedTime * 3.4) * (open ? 0.004 : 0.01);
  });

  return (
    <group ref={doorRootRef} position={[0, 1.85, 0]}>
      <mesh position={[0, 0, -0.1]}>
        <boxGeometry args={[2.8, 4.3, 0.16]} />
        <meshStandardMaterial color="#121722" roughness={0.7} />
      </mesh>
      <group ref={pivotRef} position={[-0.98, 0, 0.02]}>
        <group position={[0.98, 0, 0]} onClick={onClick}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1.96, 3.85, 0.18]} />
            <meshStandardMaterial color="#3f2519" roughness={0.48} />
          </mesh>
          <mesh position={[0, 0.75, 0.105]}>
            <boxGeometry args={[1.22, 0.72, 0.045]} />
            <meshStandardMaterial color="#211614" roughness={0.55} />
          </mesh>
          <mesh position={[0, -0.85, 0.105]}>
            <boxGeometry args={[1.22, 0.88, 0.045]} />
            <meshStandardMaterial color="#211614" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.05, 0.13]}>
            <boxGeometry args={[0.76, 0.24, 0.045]} />
            <meshStandardMaterial color="#c5a15a" metalness={0.65} roughness={0.28} />
          </mesh>
          <mesh position={[0.71, -0.18, 0.16]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.06, 0.06, 0.22, 24]} />
            <meshStandardMaterial color="#c5a15a" metalness={0.72} roughness={0.25} />
          </mesh>
          <mesh
            ref={handleRef}
            position={[0.85, -0.18, 0.17]}
            rotation={[Math.PI / 2, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.035, 0.035, 0.48, 20]} />
            <meshStandardMaterial color="#9d7934" metalness={0.6} roughness={0.28} />
          </mesh>
        </group>
      </group>
      <mesh position={[0, -2.05, 0.12]}>
        <boxGeometry args={[3.6, 0.12, 1.2]} />
        <meshStandardMaterial color="#2a1a12" roughness={0.68} />
      </mesh>
    </group>
  );
}

function Table({ visible }: { visible: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.y = THREE.MathUtils.lerp(
      groupRef.current.position.y,
      visible ? 0 : -1.2,
      0.08,
    );
  });

  return (
    <group ref={groupRef} position={[0, -1.2, -2.35]}>
      <mesh castShadow receiveShadow position={[0, 0.55, 0]}>
        <boxGeometry args={[4.7, 0.28, 2.2]} />
        <meshStandardMaterial color="#352116" roughness={0.56} />
      </mesh>
      {[-1.85, 1.85].map((x) =>
        [-0.72, 0.72].map((z) => (
          <mesh key={`${x}-${z}`} castShadow position={[x, -0.25, z]}>
            <boxGeometry args={[0.16, 1.38, 0.16]} />
            <meshStandardMaterial color="#25150e" roughness={0.62} />
          </mesh>
        )),
      )}
    </group>
  );
}

function CaseFileStack({
  visible,
  spotlighted,
  selectedCaseId,
  onCaseClick,
}: {
  visible: boolean;
  spotlighted: boolean;
  selectedCaseId: string;
  onCaseClick: (caseId: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.visible = visible;
    groupRef.current.position.y = THREE.MathUtils.lerp(
      groupRef.current.position.y,
      visible ? 0.22 : -0.55,
      0.08,
    );
    groupRef.current.rotation.z = THREE.MathUtils.lerp(
      groupRef.current.rotation.z,
      spotlighted ? Math.sin(clock.elapsedTime * 0.5) * 0.02 : 0,
      0.06,
    );
  });

  return (
    <group ref={groupRef} position={[0, -0.55, -2.35]}>
      {demoCases.map((demoCase, index) => {
        const x = (index - 1) * 1.18;
        const isSelected = selectedCaseId === demoCase.id;
        return (
          <group
            key={demoCase.id}
            position={[
              x,
              0.58 + index * 0.05 + (isSelected ? 0.06 : 0),
              isSelected ? 0.14 : 0,
            ]}
            rotation={[
              -0.38 + (isSelected ? 0.07 : 0),
              0,
              (index - 1) * (spotlighted ? 0.16 : 0.09),
            ]}
            onClick={() => onCaseClick(demoCase.id)}
          >
            <mesh castShadow receiveShadow scale={isSelected ? 1.11 : 1}>
              <boxGeometry args={[1.02, 0.08, 1.38]} />
              <meshStandardMaterial color={demoCase.color} roughness={0.72} />
            </mesh>
            <mesh position={[-0.26, 0.06, 0.56]} scale={isSelected ? 1.11 : 1}>
              <boxGeometry args={[0.34, 0.035, 0.2]} />
              <meshStandardMaterial color="#c5a15a" roughness={0.42} />
            </mesh>
            <mesh position={[0, 0.073, -0.12]} scale={isSelected ? 1.11 : 1}>
              <boxGeometry args={[0.78, 0.018, 0.08]} />
              <meshStandardMaterial color="#f1e6d2" roughness={0.7} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Timeline({
  visible,
  selectedCase,
  progress,
}: {
  visible: boolean;
  selectedCase: DemoCase;
  progress: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.visible = visible;
    groupRef.current.position.y = THREE.MathUtils.lerp(
      groupRef.current.position.y,
      visible ? 1.12 : 0.15,
      0.08,
    );
    groupRef.current.rotation.x = THREE.MathUtils.lerp(
      groupRef.current.rotation.x,
      visible ? -0.06 : -0.18,
      0.08,
    );
  });

  return (
    <group ref={groupRef} position={[0, 0.15, -2.6]}>
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 4.25, 20]} />
        <meshStandardMaterial
          color="#c5a15a"
          emissive="#5d4215"
          emissiveIntensity={0.4 + progress * 0.25}
        />
      </mesh>
      {selectedCase.events.map((event, index) => {
        const nodeProgress = THREE.MathUtils.clamp(
          progress * selectedCase.events.length - index,
          0,
          1,
        );
        const reveal = nodeProgress > 0;
        const x = -1.8 + index * 1.2;
        return (
          <group
            key={event.title}
            position={[x, -0.55 + nodeProgress * 0.55, reveal ? 0.03 : -0.08]}
            rotation={[-0.12 + nodeProgress * 0.12, 0, 0]}
            scale={0.84 + nodeProgress * 0.16}
          >
            <mesh castShadow position={[0, 0, 0]}>
              <sphereGeometry args={[0.09, 24, 24]} />
              <meshStandardMaterial
                color={reveal ? "#d4a84b" : "#4a4d56"}
                emissive={reveal ? "#7b5619" : "#000000"}
                emissiveIntensity={reveal ? 0.5 : 0}
              />
            </mesh>
            <mesh castShadow position={[0, 0.43, 0]} rotation={[-0.16, 0, 0]}>
              <boxGeometry args={[0.72, 0.42, 0.04]} />
              <meshStandardMaterial color={selectedCase.color} roughness={0.72} />
            </mesh>
            <mesh position={[0, 0.44, 0.026]} rotation={[-0.16, 0, 0]}>
              <boxGeometry args={[0.52, 0.035, 0.018]} />
              <meshStandardMaterial color="#f4ead9" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Courtroom({ visible }: { visible: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.visible = visible;
    groupRef.current.position.y = THREE.MathUtils.lerp(
      groupRef.current.position.y,
      visible ? 0.1 : -1,
      0.08,
    );
  });

  return (
    <group ref={groupRef} position={[0, -1, -2.65]}>
      <mesh castShadow receiveShadow position={[0, 0.95, -0.25]}>
        <boxGeometry args={[3.2, 0.62, 0.42]} />
        <meshStandardMaterial color="#171b24" roughness={0.64} />
      </mesh>
      <mesh castShadow position={[0, 1.55, -0.36]}>
        <boxGeometry args={[1.18, 0.82, 0.32]} />
        <meshStandardMaterial color="#3b2418" roughness={0.54} />
      </mesh>
      <mesh position={[0, 2.15, -0.18]}>
        <boxGeometry args={[0.82, 0.4, 0.045]} />
        <meshStandardMaterial color="#c5a15a" emissive="#6d4a14" emissiveIntensity={0.34} />
      </mesh>
      <mesh castShadow position={[-1.35, 0.52, 0.42]}>
        <boxGeometry args={[0.9, 0.1, 0.12]} />
        <meshStandardMaterial color="#7b5b28" roughness={0.42} />
      </mesh>
      <mesh castShadow position={[1.35, 0.52, 0.42]}>
        <boxGeometry args={[0.9, 0.1, 0.12]} />
        <meshStandardMaterial color="#7b5b28" roughness={0.42} />
      </mesh>
    </group>
  );
}

interface MovieOverlayProps {
  stage: MovieStage;
  selectedCase: DemoCase;
  timelineProgress: number;
  primaryCtaHref: string;
  secondaryCtaHref: string;
  secondaryCtaLabel: string;
  onDoorClick: () => void;
  onCaseSelect: (caseId: string) => void;
  onTimelineScroll: (progress: number) => void;
  onShowCta: () => void;
  onReset: () => void;
}

function MovieOverlay({
  stage,
  selectedCase,
  timelineProgress,
  primaryCtaHref,
  secondaryCtaHref,
  secondaryCtaLabel,
  onDoorClick,
  onCaseSelect,
  onTimelineScroll,
  onShowCta,
  onReset,
}: MovieOverlayProps) {
  const showDoor = stage === "intro";
  const showFiles = stage === "files";
  const showTimeline = stage === "timeline";
  const showCta = stage === "cta";

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      <AnimatePresence mode="wait">
        {showDoor && (
          <motion.div
            key="door"
            className="pointer-events-auto absolute inset-0"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <button
              type="button"
              onClick={onDoorClick}
              aria-label="Click the 3D law firm door to enter the case room"
              className="absolute right-[17vw] top-1/2 h-[24rem] w-[11rem] -translate-y-1/2 rounded border border-transparent transition hover:border-[#c5a15a]/35 focus-visible:border-[#c5a15a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f5d891] max-lg:right-[3.5rem] max-lg:top-[44vh] max-lg:h-[21rem] max-lg:w-[9.5rem] max-lg:-translate-y-1/2"
            />
          </motion.div>
        )}

        {showFiles && (
          <motion.div
            key="files"
            className="pointer-events-auto absolute bottom-20 right-[7vw] w-[25rem] max-w-[calc(100vw-2rem)] rounded border border-stone-200/15 bg-[#07080c]/70 p-4 backdrop-blur-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-[#c5a15a]">
              Choose a case file
            </p>
            <div className="grid gap-2">
              {demoCases.map((demoCase) => (
                <button
                  key={demoCase.id}
                  type="button"
                  onClick={() => onCaseSelect(demoCase.id)}
                  className="rounded border border-stone-200/15 bg-stone-950/65 px-4 py-3 text-left transition hover:border-[#c5a15a]/65 hover:bg-stone-900/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c5a15a]"
                >
                  <span className="block text-sm font-semibold text-stone-50">
                    {demoCase.title}
                  </span>
                  <span className="mt-1 block text-xs text-stone-400">
                    {demoCase.section} · {demoCase.tone}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {showTimeline && (
          <motion.div
            key="timeline"
            className="pointer-events-auto absolute bottom-16 right-[6vw] flex max-h-[58vh] w-[27rem] max-w-[calc(100vw-2rem)] flex-col rounded border border-stone-200/15 bg-[#07080c]/76 backdrop-blur-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="border-b border-stone-200/10 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#c5a15a]">
                Timeline
              </p>
              <h3 className="mt-2 text-lg font-semibold text-stone-50">
                {selectedCase.title}
              </h3>
            </div>
            <div
              className="overflow-y-auto p-4"
              onScroll={(event) => {
                const element = event.currentTarget;
                const max = element.scrollHeight - element.clientHeight;
                onTimelineScroll(max > 0 ? element.scrollTop / max : 1);
              }}
            >
              <div className="space-y-4 pb-24">
                {selectedCase.events.map((event) => (
                  <article
                    key={event.title}
                    className="border-l border-[#c5a15a]/45 bg-stone-950/55 px-4 py-3"
                  >
                    <p className="font-mono text-xs uppercase tracking-[0.14em] text-stone-500">
                      {event.date}
                    </p>
                    <h4 className="mt-1 text-sm font-semibold text-stone-50">
                      {event.title}
                    </h4>
                    <p className="mt-1 text-sm leading-6 text-stone-300">
                      {event.detail}
                    </p>
                  </article>
                ))}
                <button
                  type="button"
                  onClick={onShowCta}
                  className="w-full rounded border border-[#c5a15a]/55 bg-[#c5a15a] px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-[#111827] transition hover:bg-[#e0bd6b]"
                >
                  Continue to courtroom
                </button>
              </div>
            </div>
            <div
              className="h-1 origin-left bg-[#c5a15a]"
              style={{ transform: `scaleX(${Math.max(0.08, timelineProgress)})` }}
            />
          </motion.div>
        )}

        {showCta && (
          <motion.div
            key="cta"
            className="pointer-events-auto absolute bottom-16 right-[7vw] w-[26rem] max-w-[calc(100vw-2rem)] rounded border border-[#c5a15a]/35 bg-[#07080c]/78 p-5 backdrop-blur-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#c5a15a]">
              Ready for AI Courtroom
            </p>
            <h3 className="mt-3 text-2xl font-semibold text-stone-50">
              Step into the simulation
            </h3>
            <p className="mt-3 text-sm leading-6 text-stone-300">
              Use generated case files, prepared timelines, witnesses, and AI
              counter-arguments inside the courtroom.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <a
                href={primaryCtaHref}
                className="inline-flex min-h-11 items-center justify-center rounded border border-[#d8bc78] bg-[#c5a15a] px-4 text-sm font-semibold uppercase tracking-[0.1em] text-[#111827]"
              >
                Get started
              </a>
              <a
                href={secondaryCtaHref}
                className="inline-flex min-h-11 items-center justify-center rounded border border-stone-200/25 px-4 text-sm font-semibold uppercase tracking-[0.1em] text-stone-50"
              >
                {secondaryCtaLabel}
              </a>
            </div>
            <button
              type="button"
              onClick={onReset}
              className="mt-4 text-sm text-stone-400 underline-offset-4 hover:text-stone-100 hover:underline"
            >
              Replay landing movie
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
