import React from "react";

export default function LoadingScreen({ message = "Your cart is ready to bring in more AOV" }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="loading-screen-bg fixed inset-0 z-[9999] flex flex-col items-center justify-center p-6 select-none animate-fadeIn"
    >
      {/* Central Floating Card with Ambient Glow */}
      <div className="relative flex flex-col items-center">
        {/* Soft Ambient Coral Glow Behind Card */}
        <div className="absolute -inset-6 bg-gradient-to-br from-[#FF7A59]/25 via-[#F95738]/20 to-[#FF9076]/20 rounded-[44px] blur-2xl pointer-events-none" />

        {/* Squircle Card Container */}
        <div className="relative w-36 h-36 sm:w-40 sm:h-40 rounded-[34px] bg-gradient-to-b from-[#FFFFFF] via-[#FFFBF9] to-[#FFF3EE] border border-[#FDDCD3]/80 shadow-[0_16px_40px_-10px_rgba(249,87,56,0.18)] flex items-center justify-center">
          <svg
            viewBox="0 0 120 120"
            className="w-24 h-24 sm:w-28 sm:h-28 drop-shadow-[0_4px_12px_rgba(234,61,29,0.16)]"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Basket Gradient */}
              <linearGradient id="ceBasketGrad" x1="40" y1="44" x2="80" y2="72" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#FA6445" />
                <stop offset="100%" stopColor="#EA3D1D" />
              </linearGradient>

              {/* Upward Growth Arrow Gradient */}
              <linearGradient id="ceArrowGrad" x1="60" y1="56" x2="90" y2="24" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#FF6848" />
                <stop offset="100%" stopColor="#DE2E0D" />
              </linearGradient>

              {/* Package 1 (Left) Gradient */}
              <linearGradient id="ceBox1Grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#FFA18D" />
                <stop offset="100%" stopColor="#F57E66" />
              </linearGradient>

              {/* Package 2 (Right) Gradient */}
              <linearGradient id="ceBox2Grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#FFB5A5" />
                <stop offset="100%" stopColor="#FA937D" />
              </linearGradient>

              {/* 3D Wheel Radial Shading */}
              <radialGradient id="ceWheelGrad" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#FFA693" />
                <stop offset="45%" stopColor="#F95738" />
                <stop offset="100%" stopColor="#B32309" />
              </radialGradient>
            </defs>

            {/* Wheel Contact Shadows on Card Base */}
            <ellipse cx="45" cy="85.5" rx="6.5" ry="2" fill="rgba(234, 61, 29, 0.2)" />
            <ellipse cx="73" cy="85.5" rx="6.5" ry="2" fill="rgba(234, 61, 29, 0.2)" />

            {/* Package Box 1 (Left, Tilted Backwards) */}
            <g transform="translate(39, 31) rotate(-8)">
              <rect width="18" height="18" rx="4" fill="url(#ceBox1Grad)" opacity="0.95" />
            </g>

            {/* Package Box 2 (Right, Tilted Forward) */}
            <g transform="translate(54, 33) rotate(5)">
              <rect width="17" height="17" rx="4" fill="url(#ceBox2Grad)" opacity="0.95" />
            </g>

            {/* Handle & Main Cart Frame */}
            <path
              d="M 23 40 H 31 L 40 68 H 76"
              stroke="#F95738"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Cart Basket Body */}
            <path
              d="M 36 44 H 82 C 83.5 44 84.5 45.3 84 46.8 L 78 65 C 77.5 66.5 76 67.5 74.5 67.5 H 41 C 39.5 67.5 38 66.5 37.5 65 L 34 46.8 C 33.5 45.3 34.5 44 36 44 Z"
              fill="url(#ceBasketGrad)"
            />

            {/* Two Rounded White Horizontal Slits on Cart Basket */}
            <rect x="47" y="52" width="22" height="3.5" rx="1.75" fill="#FFFFFF" opacity="0.95" />
            <rect x="50" y="58" width="16" height="3.5" rx="1.75" fill="#FFFFFF" opacity="0.95" />

            {/* Upward Growth Arrow (Representing AOV Elevation) */}
            <g>
              {/* Arrow Stem */}
              <path
                d="M 62 55 L 81 33"
                stroke="url(#ceArrowGrad)"
                strokeWidth="6"
                strokeLinecap="round"
              />
              {/* Arrowhead Geometry */}
              <polygon
                points="88,24 73,27 79,33"
                fill="#FA4B26"
              />
              <polygon
                points="88,24 79,33 85,39"
                fill="#D82908"
              />
            </g>

            {/* Spherical Left Wheel */}
            <circle cx="45" cy="79" r="6" fill="url(#ceWheelGrad)" />

            {/* Spherical Right Wheel */}
            <circle cx="73" cy="79" r="6" fill="url(#ceWheelGrad)" />
          </svg>
        </div>

        {/* Status Headline */}
        <h2 className="mt-8 text-base sm:text-lg font-bold text-[#18181B] tracking-tight text-center max-w-sm">
          {message}
        </h2>

        {/* Three Animated Pulsing Dots */}
        <div className="flex items-center gap-2 mt-4" aria-hidden="true">
          <span className="w-2.5 h-2.5 rounded-full animate-dot-1" />
          <span className="w-2 h-2 rounded-full animate-dot-2" />
          <span className="w-1.5 h-1.5 rounded-full animate-dot-3" />
        </div>
      </div>
    </div>
  );
}
