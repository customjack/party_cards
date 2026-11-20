import { Crown, Eye, X } from "lucide-react";
import { useRef } from "react";
import type { BlackCard, WhiteCard } from "../domain/types";
import { cardsToPick } from "../domain/cardRules";
import { CardImage } from "./CardImage";

export function CardPreview({ card, kind, images }: {
  card: BlackCard | WhiteCard;
  kind: "black" | "white";
  images: Record<string, string>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pick = card.imageId ? (card as BlackCard).pick : cardsToPick(card.text);
  return (
    <>
      <button type="button" className="button secondary compact card-preview-button" onClick={() => dialog.current?.showModal()}>
        <Eye /> Preview card
      </button>
      <dialog ref={dialog} className="card-preview-dialog" aria-label="Card preview">
        <div className="card-preview-heading">
          <h2>Card preview</h2>
          <button type="button" className="button secondary compact" autoFocus onClick={() => dialog.current?.close()} aria-label="Close card preview"><X /></button>
        </div>
        <article className={kind === "black" ? "black-card" : "white-card"}>
          {kind === "black" && <small>PARTY CARDS · PICK {pick}</small>}
          <CardImage imageId={card.imageId} data={card.imageId ? images[card.imageId] : undefined} alt={card.imageAlt || card.text || "Card image"} />
          {kind === "black" ? (
            <>
              {card.text && <h1>{card.text.split("____").map((part, index, all) => <span key={index}>{part}{index < all.length - 1 && <u>________</u>}</span>)}</h1>}
              <footer><Crown /> Judge</footer>
            </>
          ) : (card as WhiteCard).blank ? <><small>BLANK CARD</small><textarea aria-label="Example response" placeholder="Write anything…" maxLength={180} /></> : card.text}
        </article>
      </dialog>
    </>
  );
}
