"use client";

import React, { useRef, useEffect, useState } from "react";
import { gsap } from "gsap";

interface MenuItemData {
  link: string;
  text: string;
  image?: string;
}

interface FlowingMenuProps {
  items?: MenuItemData[];
  speed?: number;
  textColor?: string;
  bgColor?: string;
  marqueeBgColor?: string;
  marqueeTextColor?: string;
  borderColor?: string;
}

interface MenuItemProps extends MenuItemData {
  speed: number;
  textColor: string;
  marqueeBgColor: string;
  marqueeTextColor: string;
  borderColor: string;
  isFirst: boolean;
}

const FlowingMenu: React.FC<FlowingMenuProps> = ({
  items = [],
  speed = 15,
  textColor = "#000",
  bgColor = "transparent",
  marqueeBgColor = "#2563eb",
  marqueeTextColor = "#fff",
  borderColor = "#e5e7eb",
}) => {
  return (
    <div
      className="w-full h-full overflow-hidden"
      style={{ backgroundColor: bgColor }}
    >
      <nav className="flex flex-col h-full m-0 p-0">
        {items.map((item, idx) => (
          <MenuItem
            key={idx}
            {...item}
            speed={speed}
            textColor={textColor}
            marqueeBgColor={marqueeBgColor}
            marqueeTextColor={marqueeTextColor}
            borderColor={borderColor}
            isFirst={idx === 0}
          />
        ))}
      </nav>
    </div>
  );
};

const MenuItem: React.FC<MenuItemProps> = ({
  link,
  text,
  image,
  speed,
  textColor,
  marqueeBgColor,
  marqueeTextColor,
  borderColor,
  isFirst,
}) => {
  const itemRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const marqueeInnerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<gsap.core.Tween | null>(null);
  const [repetitions, setRepetitions] = useState(4);

  const animationDefaults = { duration: 0.6, ease: "expo" };

  const findClosestEdge = (
    mouseX: number,
    mouseY: number,
    width: number,
    height: number
  ): "top" | "bottom" => {
    const topEdgeDist = Math.pow(mouseX - width / 2, 2) + Math.pow(mouseY, 2);
    const bottomEdgeDist =
      Math.pow(mouseX - width / 2, 2) + Math.pow(mouseY - height, 2);
    return topEdgeDist < bottomEdgeDist ? "top" : "bottom";
  };

  useEffect(() => {
    const calculateRepetitions = () => {
      if (!marqueeInnerRef.current) return;
      const marqueeContent = marqueeInnerRef.current.querySelector(
        ".marquee-part"
      ) as HTMLElement;
      if (!marqueeContent) return;
      const contentWidth = marqueeContent.offsetWidth;
      // Guard against division by zero or very small widths
      if (contentWidth <= 0 || !isFinite(contentWidth)) return;
      const viewportWidth = window.innerWidth || 1920;
      const needed = Math.ceil(viewportWidth / contentWidth) + 2;
      // Ensure we have a reasonable number of repetitions (between 2 and 10 for performance)
      const safeRepetitions = Math.min(10, Math.max(2, needed));
      if (isFinite(safeRepetitions) && safeRepetitions > 0) {
        setRepetitions(safeRepetitions);
      }
    };

    // Use requestAnimationFrame for faster initialization
    const rafId = requestAnimationFrame(calculateRepetitions);
    window.addEventListener("resize", calculateRepetitions);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", calculateRepetitions);
    };
  }, [text, image]);

  useEffect(() => {
    const setupMarquee = () => {
      if (!marqueeInnerRef.current) return;
      const marqueeContent = marqueeInnerRef.current.querySelector(
        ".marquee-part"
      ) as HTMLElement;
      if (!marqueeContent) return;
      const contentWidth = marqueeContent.offsetWidth;
      if (contentWidth === 0) return;

      if (animationRef.current) {
        animationRef.current.kill();
      }

      animationRef.current = gsap.to(marqueeInnerRef.current, {
        x: -contentWidth,
        duration: speed,
        ease: "none",
        repeat: -1,
      });
    };

    // Use requestAnimationFrame for faster initialization
    const rafId = requestAnimationFrame(setupMarquee);
    return () => {
      cancelAnimationFrame(rafId);
      if (animationRef.current) {
        animationRef.current.kill();
      }
    };
  }, [text, image, repetitions, speed]);

  const handleMouseEnter = (ev: React.MouseEvent<HTMLDivElement>) => {
    if (!itemRef.current || !marqueeRef.current || !marqueeInnerRef.current)
      return;
    const rect = itemRef.current.getBoundingClientRect();
    const edge = findClosestEdge(
      ev.clientX - rect.left,
      ev.clientY - rect.top,
      rect.width,
      rect.height
    );

    gsap
      .timeline({ defaults: animationDefaults })
      .set(marqueeRef.current, { y: edge === "top" ? "-101%" : "101%" }, 0)
      .set(marqueeInnerRef.current, { y: edge === "top" ? "101%" : "-101%" }, 0)
      .to([marqueeRef.current, marqueeInnerRef.current], { y: "0%" }, 0);
  };

  const handleMouseLeave = (ev: React.MouseEvent<HTMLDivElement>) => {
    if (!itemRef.current || !marqueeRef.current || !marqueeInnerRef.current)
      return;
    const rect = itemRef.current.getBoundingClientRect();
    const edge = findClosestEdge(
      ev.clientX - rect.left,
      ev.clientY - rect.top,
      rect.width,
      rect.height
    );

    gsap
      .timeline({ defaults: animationDefaults })
      .to(marqueeRef.current, { y: edge === "top" ? "-101%" : "101%" }, 0)
      .to(marqueeInnerRef.current, { y: edge === "top" ? "101%" : "-101%" }, 0);
  };

  return (
    <div
      className="flex-1 relative overflow-hidden text-center w-full cursor-pointer"
      ref={itemRef}
      style={{ borderTop: isFirst ? "none" : `1px solid ${borderColor}` }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => {
        window.location.href = link;
      }}
    >
      <a
        className="flex items-center justify-center w-full h-full relative uppercase no-underline font-semibold text-[3vh] md:text-[4vh]"
        href={link}
        style={{ color: textColor }}
        onClick={(e) => e.stopPropagation()}
      >
        {text}
      </a>
      <div
        className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none translate-y-[101%]"
        ref={marqueeRef}
        style={{ backgroundColor: marqueeBgColor }}
      >
        <div
          className="h-full w-fit flex pointer-events-none"
          ref={marqueeInnerRef}
        >
          {[...Array(repetitions)].map((_, idx) => (
            <div
              className="marquee-part flex items-center shrink-0 pointer-events-none"
              key={idx}
              style={{ color: marqueeTextColor }}
            >
              <span className="whitespace-nowrap uppercase font-normal text-[3vh] md:text-[4vh] leading-none px-[1vw]">
                {text}
              </span>
              {image && (
                <div
                  className="w-[100px] md:w-[150px] h-[4vh] md:h-[5vh] my-[1em] mx-[2vw] py-[0.5em] rounded-[25px] bg-cover bg-center"
                  style={{ backgroundImage: `url(${image})` }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FlowingMenu;
