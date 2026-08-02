import type { Book, BookStatus } from "@/lib/types";
import { BOOK_STATUSES, STATUS_LABELS } from "@/lib/types";

interface BookCardProps {
  book: Book;
  statusBusy: boolean;
  onEdit: (book: Book) => void;
  onDelete: (book: Book) => void;
  onStatusChange: (book: Book, status: BookStatus) => void;
}

function coverIndex(book: Book) {
  const source = `${book.title}|${book.author}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 6;
}

function titleInitials(title: string) {
  return title
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toLocaleUpperCase();
}

export function BookCard({
  book,
  statusBusy,
  onEdit,
  onDelete,
  onStatusChange,
}: BookCardProps) {
  return (
    <article className="book-card">
      <div className={`book-cover book-cover--${coverIndex(book)}`} aria-hidden="true">
        <span className="book-cover__rule" />
        <span className="book-cover__initials">{titleInitials(book.title)}</span>
        <span className="book-cover__author">{book.author}</span>
      </div>

      <div className="book-card__body">
        <div className="book-card__heading">
          <h3>{book.title}</h3>
          <p>by {book.author}</p>
        </div>

        {book.tags.length > 0 ? (
          <ul className="tag-list" aria-label={`Tags for ${book.title}`}>
            {book.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        ) : (
          <p className="book-card__untagged">No tags yet</p>
        )}

        <div className="book-card__controls">
          <label className="compact-field">
            <span>Reading status</span>
            <select
              aria-busy={statusBusy}
              disabled={statusBusy}
              onChange={(event) =>
                onStatusChange(book, event.target.value as BookStatus)
              }
              value={book.status}
            >
              {BOOK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>

          <div className="book-card__actions" aria-label={`Actions for ${book.title}`}>
            <button
              className="icon-button"
              onClick={() => onEdit(book)}
              type="button"
            >
              <PencilIcon />
              <span>Edit</span>
            </button>
            <button
              className="icon-button icon-button--danger"
              onClick={() => onDelete(book)}
              type="button"
            >
              <TrashIcon />
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M14.7 5.3 18.7 9.3M4 20l3.7-.8L19.5 7.4a1.4 1.4 0 0 0 0-2l-.9-.9a1.4 1.4 0 0 0-2 0L4.8 16.3 4 20Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
    </svg>
  );
}
