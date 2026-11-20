import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Expand, X } from "lucide-react";

export const CardImageSource = createContext<{
  getImage: (id: string) => Promise<string | undefined>;
} | null>(null);
export function CardImage({
  imageId,
  data,
  alt,
  expandable = true,
}: {
  imageId?: string;
  data?: string;
  alt: string;
  expandable?: boolean;
}) {
  const source = useContext(CardImageSource);
  const wrapper = useRef<HTMLSpanElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState<{ id: string; data: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const src = data ?? (loaded?.id === imageId ? loaded?.data : undefined);
  useEffect(() => {
    if (!wrapper.current || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(wrapper.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || data || !imageId || !source) return;
    let active = true;
    setError("");
    source
      .getImage(imageId)
      .then((data) => {
        if (!active) return;
        if (data) setLoaded({ id: imageId, data });
        else setError("Image unavailable");
      })
      .catch(() => {
        if (active) setError("Image unavailable");
      });
    return () => {
      active = false;
    };
  }, [visible, data, imageId, source, retry]);
  if (!imageId && !data) return null;
  return (
    <span className="card-image" ref={wrapper}>
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setError("Image could not be displayed")}
        />
      ) : (
        <span className="image-placeholder">{error || "Loading image…"}</span>
      )}
      {error ? (
        <button
          type="button"
          className="image-zoom"
          onClick={(event) => {
            event.stopPropagation();
            setRetry((value) => value + 1);
          }}
        >
          Retry image
        </button>
      ) : expandable ? (
        <button
          type="button"
          className="image-zoom"
          disabled={!src}
          aria-label={`Enlarge image: ${alt}`}
          onClick={(event) => {
            event.stopPropagation();
            dialog.current?.showModal();
          }}
        >
          <Expand size={16} aria-hidden="true" />
        </button>
      ) : null}
      {createPortal(
        <dialog
          ref={dialog}
          className="image-dialog"
          aria-label="Enlarged card image"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="button secondary"
            aria-label="Close image"
            autoFocus
            onClick={() => dialog.current?.close()}
          >
            <X />
          </button>
          {src && <img src={src} alt={alt} />}
        </dialog>,
        document.body,
      )}
    </span>
  );
}
