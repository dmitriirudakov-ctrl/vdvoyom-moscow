export function CityScene({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      className={compact ? "city-scene compact" : "city-scene"}
      viewBox="0 0 480 300"
      role="img"
      aria-label="Иллюстрация прогулки по Москве: деревья, дома и извилистый маршрут"
    >
      <defs>
        <pattern id="paper" width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="2" r=".5" fill="#6c7968" opacity=".09" />
        </pattern>
      </defs>
      <path
        d="M28 244C-6 183 40 105 124 82S259 26 345 61s148 79 102 146-164 80-248 68S65 300 28 244"
        fill="#e9eddf"
      />
      <path
        d="M10 222c66-58 94 18 157-18s45-69 109-47 73 77 191 4"
        fill="none"
        stroke="#accbd1"
        strokeWidth="31"
      />
      <path
        d="M62 158c42-74 105-16 114 15s-28 61 22 74 90-77 115-110 72-17 88 8"
        fill="none"
        stroke="#fffdf2"
        strokeWidth="21"
      />
      <path
        d="M62 158c42-74 105-16 114 15s-28 61 22 74 90-77 115-110 72-17 88 8"
        fill="none"
        stroke="#809a78"
        strokeWidth="2"
        strokeDasharray="4 7"
      />
      <g stroke="#34564b" strokeWidth="2" strokeLinejoin="round">
        <path d="M166 111V63h54v48" fill="#e8b491" />
        <path d="m160 63 33-24 33 24Z" fill="#ba7054" />
        <path d="M181 111V89q12-16 24 0v22" fill="#faf3dc" />
        <path d="M176 69h6v9h-6zm28 0h6v9h-6z" fill="#fff4da" />
        <path d="M245 96V43h32v53" fill="#e4ce96" />
        <path d="m242 43 19-16 19 16Z" fill="#34564b" />
        <path d="M259 28V17m-5 6h10" />
        <circle cx="261" cy="57" r="6" fill="#fff7e5" />
        <path d="M249 96V78h8v18m8 0V78h8v18" fill="#fff4da" />
        <path d="M330 218v-46h58v46" fill="#edbb94" />
        <path d="m325 172 34-18 35 18Z" fill="#658573" />
        <path
          d="M341 181h8v12h-8zm20 0h8v12h-8zm-1 37v-16h12v16"
          fill="#fff5df"
        />
        <path d="M102 227v-41h44v41" fill="#ead9ae" />
        <path d="m98 186 26-19 26 19Z" fill="#c77c61" />
        <path d="M113 197h7v11h-7zm16 0h7v11h-7z" fill="#fdf7df" />
      </g>
      {[
        [80, 99],
        [118, 69],
        [317, 64],
        [394, 106],
        [403, 230],
        [270, 248],
        [61, 235],
        [221, 184],
      ].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <path d="M0 12v20" stroke="#496c55" strokeWidth="3" />
          <ellipse
            cy="0"
            rx={i % 2 ? 13 : 17}
            ry="22"
            fill={i % 2 ? "#c4cba0" : "#739375"}
          />
          <path
            d="m0 4-5-6M0 11l6-8"
            fill="none"
            stroke="#48694e"
            strokeWidth="1.5"
          />
        </g>
      ))}
      <g transform="translate(298 132)">
        <circle r="18" fill="#fffdf2" />
        <path
          d="M0 12S-11 2-11-5a11 11 0 0 1 22 0C11 2 0 12 0 12"
          fill="#cf795f"
        />
        <circle cy="-4" r="4" fill="#fff7e6" />
      </g>
      <path
        d="m183 258 8-8 7 8m-7-8v17"
        stroke="#72876a"
        fill="none"
        strokeWidth="2"
      />
      <rect width="480" height="300" fill="url(#paper)" />
    </svg>
  );
}
