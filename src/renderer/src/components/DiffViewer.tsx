import type { DiffRegion } from '../../../shared/types';

export type DiffViewMode = 'side-by-side' | 'overlay' | 'highlight' | 'regions';

interface Props {
  mode: DiffViewMode;
  beforeUrl: string | null;
  afterUrl: string | null;
  diffUrl: string | null;
  overlayOpacity: number;
  regions: DiffRegion[];
  showRegions: boolean;
  width: number;
  height: number;
}

function ImagePane({ src, alt, regions, showBoxes, intrinsic }: {
  src: string;
  alt: string;
  regions: DiffRegion[];
  showBoxes: boolean;
  intrinsic: { width: number; height: number };
}) {
  return (
    <div className="diff-viewport">
      <img src={src} alt={alt} className="diff-viewer-img" draggable={false} />
      {showBoxes && regions.length > 0 && (
        <svg className="diff-region-svg" viewBox={`0 0 ${intrinsic.width} ${intrinsic.height}`} preserveAspectRatio="xMidYMid meet">
          {regions.map((r, i) => (
            <rect
              key={i}
              x={r.x}
              y={r.y}
              width={r.width}
              height={r.height}
              className="diff-region-rect"
            />
          ))}
        </svg>
      )}
    </div>
  );
}

export default function DiffViewer({
  mode, beforeUrl, afterUrl, diffUrl, overlayOpacity, regions, showRegions, width, height,
}: Props) {
  const intrinsic = { width: width || 1280, height: height || 720 };

  if (mode === 'side-by-side' && beforeUrl && afterUrl) {
    return (
      <div className="diff-viewer-split">
        <ImagePane src={beforeUrl} alt="Before" regions={[]} showBoxes={false} intrinsic={intrinsic} />
        <ImagePane src={afterUrl} alt="After" regions={[]} showBoxes={false} intrinsic={intrinsic} />
      </div>
    );
  }

  if (mode === 'overlay' && beforeUrl && afterUrl) {
    return (
      <div className="diff-viewport diff-viewport-overlay">
        <img src={afterUrl} alt="After" className="diff-viewer-img" draggable={false} />
        <img
          src={beforeUrl}
          alt="Before overlay"
          className="diff-viewer-img diff-overlay-before"
          style={{ opacity: overlayOpacity }}
          draggable={false}
        />
      </div>
    );
  }

  if (mode === 'highlight' && diffUrl) {
    return <ImagePane src={diffUrl} alt="Diff highlight" regions={[]} showBoxes={false} intrinsic={intrinsic} />;
  }

  if (mode === 'regions' && afterUrl) {
    return (
      <ImagePane
        src={afterUrl}
        alt="Changed regions"
        regions={regions}
        showBoxes={showRegions}
        intrinsic={intrinsic}
      />
    );
  }

  return <div className="diff-viewer-placeholder"><span>No image loaded for this view.</span></div>;
}
