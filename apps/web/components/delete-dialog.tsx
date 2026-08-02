"use client";

import { useEffect, useRef, useState } from "react";

import { messageFromError } from "@/lib/api";
import type { Book } from "@/lib/types";

interface DeleteDialogProps {
  book: Book;
  onClose: () => void;
  onConfirm: (book: Book) => Promise<void>;
}

export function DeleteDialog({ book, onClose, onConfirm }: DeleteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function closeDialog() {
    if (!deleting) dialogRef.current?.close();
  }

  async function removeBook() {
    if (!book) return;
    setDeleting(true);
    setError("");
    try {
      await onConfirm(book);
      dialogRef.current?.close();
    } catch (removeError) {
      setError(messageFromError(removeError, "This book could not be deleted."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <dialog
      aria-describedby="delete-dialog-description"
      aria-labelledby="delete-dialog-title"
      className="dialog dialog--small"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <div className="dialog__surface">
        <div className="delete-symbol" aria-hidden="true">
          ×
        </div>
        <div className="dialog__heading dialog__heading--delete">
          <div>
            <p className="eyebrow">Remove from your shelves</p>
            <h2 id="delete-dialog-title">Delete this book?</h2>
          </div>
        </div>
        <p className="dialog__description" id="delete-dialog-description">
          <strong>{book.title}</strong> will be permanently removed from your
          collection. This cannot be undone.
        </p>

        {error && (
          <div className="notice notice--error" role="alert">
            {error}
          </div>
        )}

        <div className="dialog__actions">
          <button
            className="button button--secondary"
            disabled={deleting}
            onClick={closeDialog}
            ref={cancelRef}
            type="button"
          >
            Keep book
          </button>
          <button
            className="button button--danger"
            disabled={deleting}
            onClick={() => void removeBook()}
            type="button"
          >
            {deleting ? "Deleting…" : "Delete book"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
