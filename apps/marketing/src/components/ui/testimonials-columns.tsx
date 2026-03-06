"use client";

import React from "react";
import { motion } from "framer-motion";

export interface Testimonial {
  text: string;
  image: string;
  name: string;
  role: string;
}

export const TestimonialsColumn = (props: {
  className?: string;
  testimonials: Testimonial[];
  duration?: number;
}) => {
  return (
    <div className={props.className}>
      <motion.div
        animate={{
          translateY: "-50%",
        }}
        transition={{
          duration: props.duration || 10,
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop",
        }}
        className="flex flex-col gap-6 pb-6"
        style={{ backgroundColor: "var(--neram-bg)" }}
      >
        {[
          ...new Array(2).fill(0).map((_, index) => (
            <React.Fragment key={index}>
              {props.testimonials.map(({ text, image, name, role }, i) => (
                <div
                  className="p-10 rounded-3xl border max-w-xs w-full"
                  key={i}
                  style={{
                    backgroundColor: "var(--neram-card)",
                    borderColor: "var(--neram-border)",
                    boxShadow: "0 4px 30px rgba(232, 160, 32, 0.08)",
                  }}
                >
                  <div style={{ color: "var(--neram-text-muted)" }}>{text}</div>
                  <div className="flex items-center gap-2 mt-5">
                    <img
                      width={40}
                      height={40}
                      src={image}
                      alt={name}
                      className="h-10 w-10 rounded-full object-cover"
                      style={{ border: "2px solid var(--neram-gold)" }}
                    />
                    <div className="flex flex-col">
                      <div
                        className="font-medium tracking-tight leading-5"
                        style={{ color: "var(--neram-text)" }}
                      >
                        {name}
                      </div>
                      <div
                        className="leading-5 tracking-tight"
                        style={{ color: "var(--neram-gold)", opacity: 0.8 }}
                      >
                        {role}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </React.Fragment>
          )),
        ]}
      </motion.div>
    </div>
  );
};
