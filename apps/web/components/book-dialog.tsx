"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { ApiError, messageFromError } from "@/lib/api";
import {
  BOOK_STATUSES,
  STATUS_LABELS,
  type Book,
  type BookInput,
  type BookStatus,
  type FieldErrors,
} from "@/lib/types";

interface BookDialogProps {
  book: Book | null;
  onClose: () => void;
  onSave: (input: BookInput) => Promise<void>;
}

function normalizeTags(value: string) {
  const unique = new Map<string, string>();
  for (const rawTag of value.split(",")) {
    const tag = rawTag.trim().replace(/\s+/g, " ");
    const key = tag.toLocaleLowerCase();
    if (tag && !unique.has(key)) unique.set(key, tag);
  }
  return [...unique.values()];
}

function validate(values: BookInput) {
  const errors: FieldErrors = {};
  if (!values.title) errors.title = "Enter a title.";
  if (!values.author) errors.author = "Enter an author.";
  if (values.tags.length > 8) errors.tags = "Use no more than 8 tags.";
  const longTag = values.tags.find((tag) => tag.length > 30);
  if (longTag) errors.tags = `“${longTag}” is longer than 30 characters.`;
  return errors;
}

export function BookDialog({ book, onClose, onSave }: BookDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(book?.title ?? "");
  const [author, setAuthor] = useState(book?.author ?? "");
  const [tags, setTags] = useState(book?.tags.join(", ") ?? "");
  const [status, setStatus] = useState<BookStatus>(book?.status ?? "want-to-read");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function focusFirstInvalidField() {
    window.requestAnimationFrame(() => {
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
    });
  }

  function closeDialog() {
    if (!saving) dialogRef.current?.close();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: BookInput = {
      title: title.trim(),
      author: author.trim(),
      tags: normalizeTags(tags),
      status,
    };
    const errors = validate(input);
    setFieldErrors(errors);
    setFormError("");
    if (Object.keys(errors).length > 0) {
      focusFirstInvalidField();
      return;
    }

    setSaving(true);
    try {
      await onSave(input);
      dialogRef.current?.close();
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        setFieldErrors(error.fields);
        focusFirstInvalidField();
      }
      setFormError(messageFromError(error, "This book could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      aria-labelledby="book-dialog-title"
      className="dialog"
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
        <div className="dialog__heading">
          <div>
            <p className="eyebrow">{book ? "Refine this entry" : "A new story awaits"}</p>
            <h2 id="book-dialog-title">{book ? "Edit book" : "Add a book"}</h2>
          </div>
          <button
            aria-label="Close dialog"
            className="dialog__close"
            disabled={saving}
            onClick={closeDialog}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <form className="dialog__form" onSubmit={handleSubmit} noValidate ref={formRef}>
          <label className="field">
            <span className="field__label">Title</span>
            <input
              aria-describedby={fieldErrors.title ? "book-title-error" : undefined}
              aria-invalid={Boolean(fieldErrors.title)}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              ref={titleRef}
              required
              type="text"
              value={title}
            />
            {fieldErrors.title && (
              <span className="field__error" id="book-title-error">
                {fieldErrors.title}
              </span>
            )}
          </label>

          <label className="field">
            <span className="field__label">Author</span>
            <input
              aria-describedby={fieldErrors.author ? "book-author-error" : undefined}
              aria-invalid={Boolean(fieldErrors.author)}
              maxLength={120}
              onChange={(event) => setAuthor(event.target.value)}
              required
              type="text"
              value={author}
            />
            {fieldErrors.author && (
              <span className="field__error" id="book-author-error">
                {fieldErrors.author}
              </span>
            )}
          </label>

          <label className="field">
            <span className="field__label">Tags</span>
            <input
              aria-describedby={fieldErrors.tags ? "book-tags-error" : "book-tags-hint"}
              aria-invalid={Boolean(fieldErrors.tags)}
              onChange={(event) => setTags(event.target.value)}
              placeholder="fiction, translated, favorite"
              type="text"
              value={tags}
            />
            {fieldErrors.tags ? (
              <span className="field__error" id="book-tags-error">
                {fieldErrors.tags}
              </span>
            ) : (
              <span className="field__hint" id="book-tags-hint">
                Separate up to 8 tags with commas.
              </span>
            )}
          </label>

          <label className="field">
            <span className="field__label">Reading status</span>
            <select
              onChange={(event) => setStatus(event.target.value as BookStatus)}
              value={status}
            >
              {BOOK_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </label>

          {formError && (
            <div className="notice notice--error" role="alert">
              {formError}
            </div>
          )}

          <div className="dialog__actions">
            <button
              className="button button--secondary"
              disabled={saving}
              onClick={closeDialog}
              type="button"
            >
              Cancel
            </button>
            <button className="button button--primary" disabled={saving} type="submit">
              {saving ? "Saving…" : book ? "Save changes" : "Add to library"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
