"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { gsap } from "gsap";
import { User } from "@/types";
import {
  Phone,
  Calendar,
  FileText,
  CheckCircle,
  Clock,
  Pencil,
  User as UserIcon,
  Mail,
  Gavel,
  MapPin,
} from "lucide-react";
import ProfileEditSheet from "@/components/profile-edit-sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface ProfileBentoCardProps {
  color?: string;
  title?: string;
  value?: string | number | React.ReactNode;
  icon?: React.ReactNode;
  label?: string;
  span?: string;
}

export interface ProfileBentoProps {
  user: User;
  caseStats: {
    total: number;
    active: number;
    completed: number;
  };
  enableStars?: boolean;
  enableSpotlight?: boolean;
  enableBorderGlow?: boolean;
  disableAnimations?: boolean;
  spotlightRadius?: number;
  particleCount?: number;
  enableTilt?: boolean;
  glowColor?: string;
  clickEffect?: boolean;
  enableMagnetism?: boolean;
  onRefreshUser?: () => Promise<void>;
}

const DEFAULT_PARTICLE_COUNT = 8;
const DEFAULT_SPOTLIGHT_RADIUS = 300;
const DEFAULT_GLOW_COLOR = "59, 130, 246"; // Blue color
const MOBILE_BREAKPOINT = 768;

const createParticleElement = (
  x: number,
  y: number,
  color: string = DEFAULT_GLOW_COLOR
): HTMLDivElement => {
  const el = document.createElement("div");
  el.className = "particle";
  el.style.cssText = `
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(${color}, 1);
    box-shadow: 0 0 6px rgba(${color}, 0.6);
    pointer-events: none;
    z-index: 100;
    left: ${x}px;
    top: ${y}px;
  `;
  return el;
};

const calculateSpotlightValues = (radius: number) => ({
  proximity: radius * 0.5,
  fadeDistance: radius * 0.75,
});

const updateCardGlowProperties = (
  card: HTMLElement,
  mouseX: number,
  mouseY: number,
  glow: number,
  radius: number
) => {
  const rect = card.getBoundingClientRect();
  const relativeX = ((mouseX - rect.left) / rect.width) * 100;
  const relativeY = ((mouseY - rect.top) / rect.height) * 100;

  card.style.setProperty("--glow-x", `${relativeX}%`);
  card.style.setProperty("--glow-y", `${relativeY}%`);
  card.style.setProperty("--glow-intensity", glow.toString());
  card.style.setProperty("--glow-radius", `${radius}px`);
};

const ParticleCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  disableAnimations?: boolean;
  style?: React.CSSProperties;
  particleCount?: number;
  glowColor?: string;
  enableTilt?: boolean;
  clickEffect?: boolean;
  enableMagnetism?: boolean;
}> = ({
  children,
  className = "",
  disableAnimations = false,
  style,
  particleCount = DEFAULT_PARTICLE_COUNT,
  glowColor = DEFAULT_GLOW_COLOR,
  enableTilt = true,
  clickEffect = false,
  enableMagnetism = false,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<HTMLDivElement[]>([]);
  const timeoutsRef = useRef<number[]>([]);
  const isHoveredRef = useRef(false);
  const memoizedParticles = useRef<HTMLDivElement[]>([]);
  const particlesInitialized = useRef(false);
  const magnetismAnimationRef = useRef<gsap.core.Tween | null>(null);

  const initializeParticles = useCallback(() => {
    if (particlesInitialized.current || !cardRef.current) return;

    const { width, height } = cardRef.current.getBoundingClientRect();
    memoizedParticles.current = Array.from({ length: particleCount }, () =>
      createParticleElement(
        Math.random() * width,
        Math.random() * height,
        glowColor
      )
    );
    particlesInitialized.current = true;
  }, [particleCount, glowColor]);

  const clearAllParticles = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    magnetismAnimationRef.current?.kill();

    particlesRef.current.forEach((particle) => {
      gsap.to(particle, {
        scale: 0,
        opacity: 0,
        duration: 0.3,
        ease: "back.in(1.7)",
        onComplete: () => {
          particle.parentNode?.removeChild(particle);
        },
      });
    });
    particlesRef.current = [];
  }, []);

  const animateParticles = useCallback(() => {
    if (!cardRef.current || !isHoveredRef.current) return;

    if (!particlesInitialized.current) {
      initializeParticles();
    }

    memoizedParticles.current.forEach((particle, index) => {
      const timeoutId = window.setTimeout(() => {
        if (!isHoveredRef.current || !cardRef.current) return;

        const clone = particle.cloneNode(true) as HTMLDivElement;
        cardRef.current.appendChild(clone);
        particlesRef.current.push(clone);

        gsap.fromTo(
          clone,
          { scale: 0, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.7)" }
        );

        gsap.to(clone, {
          x: (Math.random() - 0.5) * 100,
          y: (Math.random() - 0.5) * 100,
          rotation: Math.random() * 360,
          duration: 2 + Math.random() * 2,
          ease: "none",
          repeat: -1,
          yoyo: true,
        });

        gsap.to(clone, {
          opacity: 0.3,
          duration: 1.5,
          ease: "power2.inOut",
          repeat: -1,
          yoyo: true,
        });
      }, index * 100);

      timeoutsRef.current.push(timeoutId);
    });
  }, [initializeParticles]);

  useEffect(() => {
    if (disableAnimations || !cardRef.current) return;

    const element = cardRef.current;

    const handleMouseEnter = () => {
      isHoveredRef.current = true;
      animateParticles();

      if (enableTilt) {
        gsap.to(element, {
          rotateX: 5,
          rotateY: 5,
          duration: 0.3,
          ease: "power2.out",
          transformPerspective: 1000,
        });
      }
    };

    const handleMouseLeave = () => {
      isHoveredRef.current = false;
      clearAllParticles();

      if (enableTilt) {
        gsap.to(element, {
          rotateX: 0,
          rotateY: 0,
          duration: 0.3,
          ease: "power2.out",
        });
      }

      if (enableMagnetism) {
        gsap.to(element, {
          x: 0,
          y: 0,
          duration: 0.3,
          ease: "power2.out",
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!enableTilt && !enableMagnetism) return;

      const rect = element.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      if (enableTilt) {
        const rotateX = ((y - centerY) / centerY) * -5;
        const rotateY = ((x - centerX) / centerX) * 5;

        gsap.to(element, {
          rotateX,
          rotateY,
          duration: 0.1,
          ease: "power2.out",
          transformPerspective: 1000,
        });
      }

      if (enableMagnetism) {
        const magnetX = (x - centerX) * 0.03;
        const magnetY = (y - centerY) * 0.03;

        magnetismAnimationRef.current = gsap.to(element, {
          x: magnetX,
          y: magnetY,
          duration: 0.3,
          ease: "power2.out",
        });
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (!clickEffect) return;

      const rect = element.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const maxDistance = Math.max(
        Math.hypot(x, y),
        Math.hypot(x - rect.width, y),
        Math.hypot(x, y - rect.height),
        Math.hypot(x - rect.width, y - rect.height)
      );

      const ripple = document.createElement("div");
      ripple.style.cssText = `
        position: absolute;
        width: ${maxDistance * 2}px;
        height: ${maxDistance * 2}px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(${glowColor}, 0.4) 0%, rgba(${glowColor}, 0.2) 30%, transparent 70%);
        left: ${x - maxDistance}px;
        top: ${y - maxDistance}px;
        pointer-events: none;
        z-index: 1000;
      `;

      element.appendChild(ripple);

      gsap.fromTo(
        ripple,
        {
          scale: 0,
          opacity: 1,
        },
        {
          scale: 1,
          opacity: 0,
          duration: 0.8,
          ease: "power2.out",
          onComplete: () => ripple.remove(),
        }
      );
    };

    element.addEventListener("mouseenter", handleMouseEnter);
    element.addEventListener("mouseleave", handleMouseLeave);
    element.addEventListener("mousemove", handleMouseMove);
    element.addEventListener("click", handleClick);

    return () => {
      isHoveredRef.current = false;
      element.removeEventListener("mouseenter", handleMouseEnter);
      element.removeEventListener("mouseleave", handleMouseLeave);
      element.removeEventListener("mousemove", handleMouseMove);
      element.removeEventListener("click", handleClick);
      clearAllParticles();
    };
  }, [
    animateParticles,
    clearAllParticles,
    disableAnimations,
    enableTilt,
    enableMagnetism,
    clickEffect,
    glowColor,
  ]);

  return (
    <div
      ref={cardRef}
      className={`${className} relative overflow-hidden`}
      style={{ ...style, position: "relative", overflow: "hidden" }}
    >
      {children}
    </div>
  );
};

const GlobalSpotlight: React.FC<{
  gridRef: React.RefObject<HTMLDivElement | null>;
  disableAnimations?: boolean;
  enabled?: boolean;
  spotlightRadius?: number;
  glowColor?: string;
}> = ({
  gridRef,
  disableAnimations = false,
  enabled = true,
  spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS,
  glowColor = DEFAULT_GLOW_COLOR,
}) => {
  const spotlightRef = useRef<HTMLDivElement | null>(null);
  const isInsideSection = useRef(false);

  useEffect(() => {
    if (disableAnimations || !gridRef?.current || !enabled) return;

    const spotlight = document.createElement("div");
    spotlight.className = "global-spotlight";
    spotlight.style.cssText = `
      position: fixed;
      width: 600px;
      height: 600px;
      border-radius: 50%;
      pointer-events: none;
      background: radial-gradient(circle,
        rgba(${glowColor}, 0.12) 0%,
        rgba(${glowColor}, 0.06) 15%,
        rgba(${glowColor}, 0.03) 25%,
        rgba(${glowColor}, 0.015) 40%,
        rgba(${glowColor}, 0.008) 65%,
        transparent 70%
      );
      z-index: 200;
      opacity: 0;
      transform: translate(-50%, -50%);
      mix-blend-mode: screen;
    `;
    document.body.appendChild(spotlight);
    spotlightRef.current = spotlight;

    const handleMouseMove = (e: MouseEvent) => {
      if (!spotlightRef.current || !gridRef.current) return;

      const section = gridRef.current.closest(".bento-section");
      const rect = section?.getBoundingClientRect();
      const mouseInside =
        rect &&
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      isInsideSection.current = mouseInside || false;
      const cards = gridRef.current.querySelectorAll(".bento-card");

      if (!mouseInside) {
        gsap.to(spotlightRef.current, {
          opacity: 0,
          duration: 0.3,
          ease: "power2.out",
        });
        cards.forEach((card) => {
          (card as HTMLElement).style.setProperty("--glow-intensity", "0");
        });
        return;
      }

      const { proximity, fadeDistance } =
        calculateSpotlightValues(spotlightRadius);
      let minDistance = Infinity;

      cards.forEach((card) => {
        const cardElement = card as HTMLElement;
        const cardRect = cardElement.getBoundingClientRect();
        const centerX = cardRect.left + cardRect.width / 2;
        const centerY = cardRect.top + cardRect.height / 2;
        const distance =
          Math.hypot(e.clientX - centerX, e.clientY - centerY) -
          Math.max(cardRect.width, cardRect.height) / 2;
        const effectiveDistance = Math.max(0, distance);

        minDistance = Math.min(minDistance, effectiveDistance);

        let glowIntensity = 0;
        if (effectiveDistance <= proximity) {
          glowIntensity = 1;
        } else if (effectiveDistance <= fadeDistance) {
          glowIntensity =
            (fadeDistance - effectiveDistance) / (fadeDistance - proximity);
        }

        updateCardGlowProperties(
          cardElement,
          e.clientX,
          e.clientY,
          glowIntensity,
          spotlightRadius
        );
      });

      gsap.to(spotlightRef.current, {
        left: e.clientX,
        top: e.clientY,
        duration: 0.1,
        ease: "power2.out",
      });

      const targetOpacity =
        minDistance <= proximity
          ? 0.6
          : minDistance <= fadeDistance
          ? ((fadeDistance - minDistance) / (fadeDistance - proximity)) * 0.6
          : 0;

      gsap.to(spotlightRef.current, {
        opacity: targetOpacity,
        duration: targetOpacity > 0 ? 0.2 : 0.5,
        ease: "power2.out",
      });
    };

    const handleMouseLeave = () => {
      isInsideSection.current = false;
      gridRef.current?.querySelectorAll(".bento-card").forEach((card) => {
        (card as HTMLElement).style.setProperty("--glow-intensity", "0");
      });
      if (spotlightRef.current) {
        gsap.to(spotlightRef.current, {
          opacity: 0,
          duration: 0.3,
          ease: "power2.out",
        });
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      spotlightRef.current?.parentNode?.removeChild(spotlightRef.current);
    };
  }, [gridRef, disableAnimations, enabled, spotlightRadius, glowColor]);

  return null;
};

const useMobileDetection = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () =>
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
};

const ProfileBento: React.FC<ProfileBentoProps> = ({
  user,
  caseStats,
  enableStars = true,
  enableSpotlight = true,
  enableBorderGlow = true,
  disableAnimations = false,
  spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS,
  particleCount = DEFAULT_PARTICLE_COUNT,
  enableTilt = true,
  glowColor = DEFAULT_GLOW_COLOR,
  clickEffect = true,
  enableMagnetism = true,
  onRefreshUser,
}) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const isMobile = useMobileDetection();
  const shouldDisableAnimations = disableAnimations || isMobile;

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return "Not set";
    return new Date(date).toLocaleDateString("en-GB");
  };

  const getInitials = () => {
    const first = user.first_name?.[0] || "";
    const last = user.last_name?.[0] || "";
    return (first + last).toUpperCase() || "?";
  };

  // Personal info cards (left side)
  const personalCards: ProfileBentoCardProps[] = [
    {
      title: "Phone",
      value: user.phone_number || "Not set",
      icon: <Phone className="w-5 h-5" />,
      label: "Contact",
    },
    {
      title: "Date of Birth",
      value: formatDate(user.date_of_birth),
      icon: <Calendar className="w-5 h-5" />,
      label: "Personal",
    },
    {
      title: "Gender",
      value: user.gender?.replace(/-/g, " ") || "Not set",
      icon: <UserIcon className="w-5 h-5" />,
      label: "Identity",
    },
  ];

  // Case info cards (right side)
  const caseCards: ProfileBentoCardProps[] = [
    {
      title: "Total Cases",
      value: caseStats.total,
      icon: <FileText className="w-5 h-5" />,
      label: "Cases",
    },
    {
      title: "Active",
      value: caseStats.active,
      icon: <Clock className="w-5 h-5" />,
      label: "In Progress",
    },
    {
      title: "Completed",
      value: caseStats.completed,
      icon: <CheckCircle className="w-5 h-5" />,
      label: "Done",
    },
  ];

  return (
    <>
      <style>
        {`
          .bento-section {
            --glow-x: 50%;
            --glow-y: 50%;
            --glow-intensity: 0;
            --glow-radius: 200px;
            --glow-color: ${glowColor};
          }
          
          .bento-card--glow::after {
            content: '';
            position: absolute;
            inset: 0;
            padding: 1px;
            background: radial-gradient(var(--glow-radius) circle at var(--glow-x) var(--glow-y),
                rgba(${glowColor}, calc(var(--glow-intensity) * 0.6)) 0%,
                rgba(${glowColor}, calc(var(--glow-intensity) * 0.3)) 30%,
                transparent 60%);
            border-radius: inherit;
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            mask-composite: exclude;
            pointer-events: none;
            opacity: 1;
            transition: opacity 0.3s ease;
            z-index: 1;
          }
          
          .bento-card--glow:hover {
            box-shadow: 0 4px 20px rgba(59, 130, 246, 0.15), 0 0 30px rgba(${glowColor}, 0.1);
          }
        `}
      </style>

      {enableSpotlight && (
        <GlobalSpotlight
          gridRef={gridRef}
          disableAnimations={shouldDisableAnimations}
          enabled={enableSpotlight}
          spotlightRadius={spotlightRadius}
          glowColor={glowColor}
        />
      )}

      <div className="bento-section w-full select-none relative" ref={gridRef}>
        {/* Row 1: Profile Section Header */}
        <div className="flex items-start gap-4 mb-3">
          <div className="flex-1 grid grid-cols-4 gap-2">
            {/* Profile Photo Card */}
            <ParticleCard
              className="bento-card flex items-center justify-center p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 min-h-[100px] overflow-hidden transition-all duration-300 ease-in-out hover:-translate-y-0.5 bento-card--glow"
              style={
                {
                  "--glow-x": "50%",
                  "--glow-y": "50%",
                  "--glow-intensity": "0",
                  "--glow-radius": "200px",
                } as React.CSSProperties
              }
              disableAnimations={shouldDisableAnimations}
              particleCount={particleCount}
              glowColor={glowColor}
              enableTilt={enableTilt}
              clickEffect={clickEffect}
              enableMagnetism={enableMagnetism}
            >
              <Avatar className="w-16 h-16 border-2 border-zinc-300 dark:border-zinc-600">
                <AvatarImage
                  src={user.profile_photo_url || undefined}
                  alt={user.first_name}
                />
                <AvatarFallback className="bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-xl font-medium">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
            </ParticleCard>

            {/* Name and Nickname Card with Edit Button */}
            <ParticleCard
              className="bento-card col-span-2 flex flex-col justify-center p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 min-h-[100px] overflow-hidden transition-all duration-300 ease-in-out hover:-translate-y-0.5 bento-card--glow relative"
              style={
                {
                  "--glow-x": "50%",
                  "--glow-y": "50%",
                  "--glow-intensity": "0",
                  "--glow-radius": "200px",
                } as React.CSSProperties
              }
              disableAnimations={shouldDisableAnimations}
              particleCount={particleCount}
              glowColor={glowColor}
              enableTilt={enableTilt}
              clickEffect={clickEffect}
              enableMagnetism={enableMagnetism}
            >
              <ProfileEditSheet>
                <button className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 text-[10px] bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors">
                  <Pencil className="w-2.5 h-2.5" />
                  Edit Profile
                </button>
              </ProfileEditSheet>
              <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">
                {user.first_name} {user.last_name}
              </h3>
              {user.nickname && (
                <p className="text-sm text-zinc-400 mt-1">{user.nickname}</p>
              )}
            </ParticleCard>

            {/* Empty space for label positioning */}
            <div className="flex items-center justify-start pl-4">
              <div className="flex flex-col items-start">
                <span className="text-2xl font-bold text-zinc-700 dark:text-zinc-200">
                  Profile
                </span>
                <svg
                  className="w-8 h-8 text-zinc-400 -mt-1 -ml-2 rotate-200"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M7 17L17 7M17 7H7M17 7V17" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Phone, Email, Total Cases */}
        <div className="grid grid-cols-4 gap-2 mb-2">
          {/* Phone */}
          <ParticleCard
            className="bento-card flex flex-col justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 min-h-[100px] overflow-hidden transition-all duration-300 ease-in-out hover:-translate-y-0.5 bento-card--glow"
            style={
              {
                "--glow-x": "50%",
                "--glow-y": "50%",
                "--glow-intensity": "0",
                "--glow-radius": "200px",
              } as React.CSSProperties
            }
            disableAnimations={shouldDisableAnimations}
            particleCount={particleCount}
            glowColor={glowColor}
            enableTilt={enableTilt}
            clickEffect={clickEffect}
            enableMagnetism={enableMagnetism}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">
                Contact
              </span>
              <Phone className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="mt-auto">
              <h3 className="font-medium text-sm text-zinc-400">Phone</h3>
              <p className="text-base font-semibold text-zinc-900 dark:text-white mt-1">
                {user.phone_number || "Not set"}
              </p>
            </div>
          </ParticleCard>

          {/* Email */}
          <ParticleCard
            className="bento-card flex flex-col justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 min-h-[100px] overflow-hidden transition-all duration-300 ease-in-out hover:-translate-y-0.5 bento-card--glow"
            style={
              {
                "--glow-x": "50%",
                "--glow-y": "50%",
                "--glow-intensity": "0",
                "--glow-radius": "200px",
              } as React.CSSProperties
            }
            disableAnimations={shouldDisableAnimations}
            particleCount={particleCount}
            glowColor={glowColor}
            enableTilt={enableTilt}
            clickEffect={clickEffect}
            enableMagnetism={enableMagnetism}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">
                Email
              </span>
              <Mail className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="mt-auto">
              <h3 className="font-medium text-sm text-zinc-400">Email</h3>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white mt-1 truncate">
                {user.email}
              </p>
            </div>
          </ParticleCard>

          {/* Location */}
          <ParticleCard
            className="bento-card flex flex-col justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 min-h-[100px] overflow-hidden transition-all duration-300 ease-in-out hover:-translate-y-0.5 bento-card--glow"
            style={
              {
                "--glow-x": "50%",
                "--glow-y": "50%",
                "--glow-intensity": "0",
                "--glow-radius": "200px",
              } as React.CSSProperties
            }
            disableAnimations={shouldDisableAnimations}
            particleCount={particleCount}
            glowColor={glowColor}
            enableTilt={enableTilt}
            clickEffect={clickEffect}
            enableMagnetism={enableMagnetism}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">
                Location
              </span>
              <MapPin className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="mt-auto">
              <h3 className="font-medium text-sm text-zinc-400">City</h3>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white mt-1 truncate">
                {user.city
                  ? `${user.city}${user.country ? `, ${user.country}` : ""}`
                  : "Not set"}
              </p>
            </div>
          </ParticleCard>

          {/* Total Cases - spans 2 columns with Case Summary label */}
          <div className="col-span-2 flex gap-2">
            <ParticleCard
              className="bento-card flex-1 flex flex-col justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 min-h-[100px] overflow-hidden transition-all duration-300 ease-in-out hover:-translate-y-0.5 bento-card--glow"
              style={
                {
                  "--glow-x": "50%",
                  "--glow-y": "50%",
                  "--glow-intensity": "0",
                  "--glow-radius": "200px",
                } as React.CSSProperties
              }
              disableAnimations={shouldDisableAnimations}
              particleCount={particleCount}
              glowColor={glowColor}
              enableTilt={enableTilt}
              clickEffect={clickEffect}
              enableMagnetism={enableMagnetism}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">
                  Cases
                </span>
                <Gavel className="w-4 h-4 text-zinc-500" />
              </div>
              <div className="mt-auto">
                <h3 className="font-medium text-sm text-zinc-400">
                  Total Cases
                </h3>
                <p className="text-3xl font-bold text-zinc-900 dark:text-white mt-1">
                  {caseStats.total}
                </p>
              </div>
            </ParticleCard>

            {/* Case Summary Label */}
            <div className="flex items-start justify-start pt-2 min-w-[100px]">
              <div className="flex flex-col items-start">
                <span className="text-lg font-bold text-zinc-700 dark:text-zinc-200">
                  Case
                </span>
                <span className="text-lg font-bold text-zinc-700 dark:text-zinc-200 -mt-1">
                  Summary
                </span>
                <svg
                  className="w-6 h-6 text-zinc-400 -mt-1 -ml-1 rotate-200"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M7 17L17 7M17 7H7M17 7V17" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: DOB, Gender, Active Cases, Completed Cases */}
        <div className="grid grid-cols-4 gap-2">
          {/* Date of Birth */}
          <ParticleCard
            className="bento-card flex flex-col justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 min-h-[100px] overflow-hidden transition-all duration-300 ease-in-out hover:-translate-y-0.5 bento-card--glow"
            style={
              {
                "--glow-x": "50%",
                "--glow-y": "50%",
                "--glow-intensity": "0",
                "--glow-radius": "200px",
              } as React.CSSProperties
            }
            disableAnimations={shouldDisableAnimations}
            particleCount={particleCount}
            glowColor={glowColor}
            enableTilt={enableTilt}
            clickEffect={clickEffect}
            enableMagnetism={enableMagnetism}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">
                Personal
              </span>
              <Calendar className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="mt-auto">
              <h3 className="font-medium text-sm text-zinc-400">
                Date of Birth
              </h3>
              <p className="text-base font-semibold text-zinc-900 dark:text-white mt-1">
                {formatDate(user.date_of_birth)}
              </p>
            </div>
          </ParticleCard>

          {/* Gender */}
          <ParticleCard
            className="bento-card flex flex-col justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 min-h-[100px] overflow-hidden transition-all duration-300 ease-in-out hover:-translate-y-0.5 bento-card--glow"
            style={
              {
                "--glow-x": "50%",
                "--glow-y": "50%",
                "--glow-intensity": "0",
                "--glow-radius": "200px",
              } as React.CSSProperties
            }
            disableAnimations={shouldDisableAnimations}
            particleCount={particleCount}
            glowColor={glowColor}
            enableTilt={enableTilt}
            clickEffect={clickEffect}
            enableMagnetism={enableMagnetism}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">
                Identity
              </span>
              <UserIcon className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="mt-auto">
              <h3 className="font-medium text-sm text-zinc-400">Gender</h3>
              <p className="text-base font-semibold text-zinc-900 dark:text-white mt-1 capitalize">
                {user.gender?.replace(/-/g, " ") || "Not set"}
              </p>
            </div>
          </ParticleCard>

          {/* Active Cases */}
          <ParticleCard
            className="bento-card flex flex-col justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 min-h-[100px] overflow-hidden transition-all duration-300 ease-in-out hover:-translate-y-0.5 bento-card--glow"
            style={
              {
                "--glow-x": "50%",
                "--glow-y": "50%",
                "--glow-intensity": "0",
                "--glow-radius": "200px",
              } as React.CSSProperties
            }
            disableAnimations={shouldDisableAnimations}
            particleCount={particleCount}
            glowColor={glowColor}
            enableTilt={enableTilt}
            clickEffect={clickEffect}
            enableMagnetism={enableMagnetism}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">
                In Progress
              </span>
              <Clock className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="mt-auto">
              <h3 className="font-medium text-sm text-zinc-400">
                Active Cases
              </h3>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">
                {caseStats.active}
              </p>
            </div>
          </ParticleCard>

          {/* Completed Cases */}
          <ParticleCard
            className="bento-card flex flex-col justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 min-h-[100px] overflow-hidden transition-all duration-300 ease-in-out hover:-translate-y-0.5 bento-card--glow"
            style={
              {
                "--glow-x": "50%",
                "--glow-y": "50%",
                "--glow-intensity": "0",
                "--glow-radius": "200px",
              } as React.CSSProperties
            }
            disableAnimations={shouldDisableAnimations}
            particleCount={particleCount}
            glowColor={glowColor}
            enableTilt={enableTilt}
            clickEffect={clickEffect}
            enableMagnetism={enableMagnetism}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">
                Completed
              </span>
              <CheckCircle className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="mt-auto">
              <h3 className="font-medium text-sm text-zinc-400">Resolved</h3>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">
                {caseStats.completed}
              </p>
            </div>
          </ParticleCard>
        </div>
      </div>
    </>
  );
};

export default ProfileBento;
