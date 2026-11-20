import { useState } from "react";
export function ImageUpload({
  onUpload,
}: {
  onUpload: (file: File) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="image-upload">
      <label className="field">
        <span>{busy ? "Processing image…" : "Add or replace image"}</span>
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              await onUpload(file);
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Could not process image.",
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <small>
        Images are resized to 800 pixels and compressed. Animated images become
        still images.
      </small>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
