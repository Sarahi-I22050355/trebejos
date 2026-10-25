import { Link } from 'react-router-dom';

/**
 * Caballo (contorno del glifo ♞ de DejaVu Sans, licencia libre) con degradado cian → violeta.
 * El contorno va en unidades de fuente (2048/em): la transformación lo escala y voltea a un lienzo de 64×64.
 */
const KNIGHT_PATH = "M790 1254Q827 1277 827 1316Q827 1341 812.0 1369.5Q797 1398 797 1420Q797 1466 855 1496Q940 1415 947.5 1370.5Q955 1326 955 1313Q955 1266 921 1254H925Q925 1253 923 1253Q1459 913 1504 0H534Q521 56 521 114Q521 274 723.5 415.5Q926 557 926 670Q926 678 925 685Q859 518 742 518Q742 518 732 518Q642 372 539 372Q535 372 532 372L580 476L473 396Q359 424 332 507Q420 736 420 926Q420 953 418 979Q466 1088 565 1192Q568 1202 568 1211Q568 1239 545.5 1252.0Q523 1265 523 1300Q523 1337 543 1403Q647 1376 703 1254ZM533 999V983Q537 953 545 953H566Q635 953 635 1002Q635 1036 678 1084H672Q576 1084 539 1020ZM424 549V525Q424 496 452 496H462Q534 511 534 564L527 598Q465 598 424 549ZM922 1174 974 1085Q1349 816 1355 52H1432Q1387 902 922 1174Z";
const KNIGHT_TRANSFORM = "translate(-2.428 60.000) scale(0.03743 -0.03743)";

export function KnightMark({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="knight-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00F0FF" />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      <path fill="url(#knight-g)" transform={KNIGHT_TRANSFORM} d={KNIGHT_PATH} />
    </svg>
  );
}

export default function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-lg" aria-label="Trebejos, ir al inicio">
      <KnightMark className="h-8 w-8 drop-shadow-[0_0_10px_rgba(0,240,255,0.45)]" />
      <span className="text-gradient font-headline-sm text-headline-sm font-bold uppercase tracking-[0.12em]">
        Trebejos
      </span>
    </Link>
  );
}
