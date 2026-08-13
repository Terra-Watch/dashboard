"use client";

import { useEffect, useRef, useState, type ElementType, type ComponentPropsWithoutRef } from "react";

type RevealProps<T extends ElementType> = { as?: T } & ComponentPropsWithoutRef<T>;

export function Reveal<T extends ElementType = "div">({ as, className = "", ...props }: RevealProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || !("IntersectionObserver" in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { threshold: 0.12 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <Tag ref={ref} className={`${className} landing-reveal ${visible ? "landing-reveal-visible" : ""}`} {...props} />;
}
