"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BookCard } from "@/components/book-card";
import { BookDialog } from "@/components/book-dialog";
import { DeleteDialog } from "@/components/delete-dialog";
import {
  api,
  isWakeableError,
  messageFromError,
  SESSION_EXPIRED_EVENT,
  wakeApi,
} from "@/lib/api";
import {
  BOOK_STATUSES,
  STATUS_LABELS,
  type Book,
  type BookInput,
  type BookStatus,
  type DashboardSummary,
  type User,
} from "@/lib/types";

type ViewState = "loading" | "waking" | "ready" | "error";

const EMPTY_SUMMARY: DashboardSummary = {
  total: 0,
  byStatus: { "want-to-read": 0, reading: 0, completed: 0 },
  tags: [],
  authorInsight: null,
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function changeStatusCount(
  summary: DashboardSummary,
  from: BookStatus,
  to: BookStatus,
) {
  if (from === to) return summary;
  return {
    ...summary,
    byStatus: {
      ...summary.byStatus,
      [from]: Math.max(0, summary.byStatus[from] - 1),
      [to]: summary.byStatus[to] + 1,
    },
  };
}

export function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [pageError, setPageError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | BookStatus>("");
  const [tagFilter, setTagFilter] = useState("");
  const [filtering, setFiltering] = useState(false);
  const [filterError, setFilterError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Book | null>(null);
  const [statusBusyIds, setStatusBusyIds] = useState<Set<string>>(new Set());
  const [loggingOut, setLoggingOut] = useState(false);
  const [serviceWaking, setServiceWaking] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "info" | "error" } | null>(
    null,
  );
  const initialControllerRef = useRef<AbortController | null>(null);
  const collectionControllerRef = useRef<AbortController | null>(null);
  const collectionGenerationRef = useRef(0);
  const summaryRevisionRef = useRef(0);
  const filtersRef = useRef<{ status: "" | BookStatus; tag: string }>({
    status: "",
    tag: "",
  });
  const initializedRef = useRef(false);
  const collectionHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterDeleteRef = useRef(false);

  const reloadCollection = useCallback(
    async (filters: { status: "" | BookStatus; tag: string }) => {
      const generation = collectionGenerationRef.current + 1;
      collectionGenerationRef.current = generation;
      collectionControllerRef.current?.abort();
      const controller = new AbortController();
      collectionControllerRef.current = controller;
      setFiltering(true);
      setFilterError("");

      try {
        const [booksResponse, dashboardResponse] = await Promise.all([
          api.listBooks(
            {
              status: filters.status || undefined,
              tag: filters.tag || undefined,
            },
            controller.signal,
          ),
          api.dashboard(controller.signal),
        ]);

        if (
          controller.signal.aborted ||
          generation !== collectionGenerationRef.current
        ) {
          return false;
        }

        setBooks(booksResponse.books);
        setSummary(dashboardResponse.summary);
        summaryRevisionRef.current += 1;
        return true;
      } catch (error) {
        if (
          controller.signal.aborted ||
          generation !== collectionGenerationRef.current
        ) {
          return false;
        }
        throw error;
      } finally {
        if (generation === collectionGenerationRef.current) {
          setFiltering(false);
        }
      }
    },
    [],
  );

  const refreshCollection = useCallback(
    () => reloadCollection({ ...filtersRef.current }),
    [reloadCollection],
  );

  const prepareForMutation = useCallback(async () => {
    try {
      await api.health();
    } catch (error) {
      if (!isWakeableError(error)) throw error;
      setServiceWaking(true);
      try {
        await wakeApi();
      } finally {
        setServiceWaking(false);
      }
    }
  }, []);

  const initialize = useCallback(async () => {
    initialControllerRef.current?.abort();
    collectionGenerationRef.current += 1;
    collectionControllerRef.current?.abort();
    const controller = new AbortController();
    initialControllerRef.current = controller;
    initializedRef.current = false;
    setViewState("loading");
    setPageError("");

    try {
      try {
        await api.health(controller.signal);
      } catch (healthError) {
        if (!isWakeableError(healthError)) throw healthError;
        setViewState("waking");
        await wakeApi(controller.signal);
      }

      const [sessionResponse, booksResponse, dashboardResponse] = await Promise.all([
        api.me(controller.signal),
        api.listBooks({}, controller.signal),
        api.dashboard(controller.signal),
      ]);
      if (controller.signal.aborted) return;

      setUser(sessionResponse.user);
      setBooks(booksResponse.books);
      setSummary(dashboardResponse.summary);
      summaryRevisionRef.current += 1;
      initializedRef.current = true;
      setViewState("ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      setPageError(messageFromError(error, "Your library could not be opened."));
      setViewState("error");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void initialize(), 0);
    return () => {
      window.clearTimeout(timer);
      initialControllerRef.current?.abort();
      collectionGenerationRef.current += 1;
      collectionControllerRef.current?.abort();
    };
  }, [initialize]);

  useEffect(() => {
    const clearSession = () => {
      collectionGenerationRef.current += 1;
      collectionControllerRef.current?.abort();
      setUser(null);
      setBooks([]);
      setSummary(EMPTY_SUMMARY);
      summaryRevisionRef.current += 1;
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, clearSession);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, clearSession);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!initializedRef.current) return;
    const filters = { status: statusFilter, tag: tagFilter };
    filtersRef.current = filters;
    const timer = window.setTimeout(() => {
      void reloadCollection(filters)
      .catch((error: unknown) => {
        setFilterError(
          messageFromError(error, "This view of your library could not be loaded."),
        );
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reloadCollection, statusFilter, tagFilter]);

  async function saveBook(input: BookInput) {
    await prepareForMutation();
    if (editingBook) {
      await api.updateBook(editingBook.id, input);
    } else {
      await api.createBook(input);
    }

    setNotice({
      tone: "info",
      message: editingBook ? "Book details updated." : "Book added to your library.",
    });

    try {
      await refreshCollection();
    } catch (error) {
      setNotice({
        tone: "error",
        message: `${editingBook ? "The book was updated" : "The book was added"}, but the collection could not refresh. ${messageFromError(error)}`,
      });
    }
  }

  async function deleteBook(book: Book) {
    await prepareForMutation();
    await api.deleteBook(book.id);
    focusAfterDeleteRef.current = true;
    setBooks((current) => current.filter((item) => item.id !== book.id));
    setSummary((current) => ({
      ...current,
      total: Math.max(0, current.total - 1),
      byStatus: {
        ...current.byStatus,
        [book.status]: Math.max(0, current.byStatus[book.status] - 1),
      },
    }));
    setNotice({ tone: "info", message: "Book removed from your library." });

    try {
      await refreshCollection();
    } catch (error) {
      setNotice({
        tone: "error",
        message: `The book was deleted, but the collection could not refresh. ${messageFromError(error)}`,
      });
    }
  }

  async function updateStatus(book: Book, nextStatus: BookStatus) {
    if (book.status === nextStatus || statusBusyIds.has(book.id)) return;
    const previousStatus = book.status;
    const optimisticSummaryRevision = summaryRevisionRef.current;

    setStatusBusyIds((current) => new Set(current).add(book.id));
    setBooks((current) =>
      current.map((item) =>
        item.id === book.id ? { ...item, status: nextStatus } : item,
      ),
    );
    setSummary((current) => changeStatusCount(current, previousStatus, nextStatus));

    try {
      await prepareForMutation();
      await api.updateBook(book.id, { status: nextStatus });
      try {
        await refreshCollection();
      } catch (refreshError) {
        setNotice({
          tone: "error",
          message: `Status saved, but the collection could not refresh. ${messageFromError(refreshError)}`,
        });
      }
    } catch (error) {
      let reconciled = false;
      let reconciliationError: unknown;
      try {
        reconciled = await refreshCollection();
      } catch (refreshError) {
        reconciliationError = refreshError;
      }

      if (!reconciled && reconciliationError) {
        setBooks((current) =>
          current.map((item) =>
            item.id === book.id && item.status === nextStatus
              ? { ...item, status: previousStatus }
              : item,
          ),
        );
        if (summaryRevisionRef.current === optimisticSummaryRevision) {
          setSummary((current) =>
            changeStatusCount(current, nextStatus, previousStatus),
          );
        }
      }

      setNotice({
        tone: "error",
        message: reconciliationError
          ? `Status was not saved and the latest shelves could not be loaded. ${messageFromError(error)}`
          : `Status was not saved. ${messageFromError(error)}`,
      });
    } finally {
      setStatusBusyIds((current) => {
        const next = new Set(current);
        next.delete(book.id);
        return next;
      });
    }
  }

  async function logout() {
    setLoggingOut(true);
    setNotice(null);
    try {
      await prepareForMutation();
      await api.logout();
      window.location.assign("/login");
    } catch (error) {
      setNotice({ tone: "error", message: messageFromError(error, "Could not sign out.") });
      setLoggingOut(false);
    }
  }

  if (viewState === "loading" || viewState === "waking") {
    return <DashboardLoading waking={viewState === "waking"} />;
  }

  if (viewState === "error") {
    return <DashboardError message={pageError} onRetry={() => void initialize()} />;
  }

  const firstName = user?.name.trim().split(/\s+/)[0] ?? "reader";
  const filtersActive = Boolean(statusFilter || tagFilter);
  const availableTags = tagFilter && !summary.tags.includes(tagFilter)
    ? [tagFilter, ...summary.tags]
    : summary.tags;

  return (
    <div className="dashboard-page">
      <header className="topbar">
        <a className="brand" href="/dashboard" aria-label="Shelfmark dashboard">
          <span className="brand__mark" aria-hidden="true">
            S
          </span>
          <span>Shelfmark</span>
        </a>
        <button
          className="button button--quiet"
          disabled={loggingOut}
          onClick={() => void logout()}
          type="button"
        >
          <LogoutIcon />
          {loggingOut ? "Signing out…" : "Sign out"}
        </button>
      </header>

      <main id="main-content" className="dashboard-main">
        <section className="dashboard-intro">
          <div>
            <p className="eyebrow">Your personal library</p>
            <h1>
              {greeting()}, <em>{firstName}.</em>
            </h1>
            <p>Here is the shape of your reading life today.</p>
          </div>
          <button
            className="button button--primary add-book-button"
            onClick={() => {
              setEditingBook(null);
              setEditorOpen(true);
            }}
            type="button"
          >
            <PlusIcon />
            Add a book
          </button>
        </section>

        {notice && (
          <div
            className={`toast toast--${notice.tone}`}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            <span>{notice.message}</span>
            <button aria-label="Dismiss message" onClick={() => setNotice(null)} type="button">
              ×
            </button>
          </div>
        )}

        {serviceWaking && (
          <div className="toast toast--info" role="status">
            Waking the library service…
          </div>
        )}

        <section className="summary-grid" aria-label="Reading summary">
          <article className="total-card">
            <p>Books on your shelves</p>
            <strong>{summary.total}</strong>
            <span>{summary.total === 1 ? "story collected" : "stories collected"}</span>
          </article>
          <div className="status-summary">
            {BOOK_STATUSES.map((status) => (
              <article className={`status-stat status-stat--${status}`} key={status}>
                <span className="status-stat__dot" aria-hidden="true" />
                <div>
                  <strong>{summary.byStatus[status]}</strong>
                  <p>{STATUS_LABELS[status]}</p>
                </div>
              </article>
            ))}
          </div>
          <AuthorInsight summary={summary} />
        </section>

        <section className="collection" aria-labelledby="collection-title">
          <div className="collection__heading">
            <div>
              <p className="eyebrow">The collection</p>
              <h2 id="collection-title" ref={collectionHeadingRef} tabIndex={-1}>
                Your shelves
              </h2>
            </div>
            <p className="collection__count" aria-live="polite">
              {filtering ? "Updating…" : `${books.length} ${books.length === 1 ? "book" : "books"}`}
            </p>
          </div>

          <div className="filters" aria-label="Filter books">
            <label className="filter-field">
              <span>Status</span>
              <select
                onChange={(event) =>
                  setStatusFilter(event.target.value as "" | BookStatus)
                }
                value={statusFilter}
              >
                <option value="">All statuses</option>
                {BOOK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>Tag</span>
              <select onChange={(event) => setTagFilter(event.target.value)} value={tagFilter}>
                <option value="">All tags</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
            {filtersActive && (
              <button
                className="button button--quiet clear-filters"
                onClick={() => {
                  setStatusFilter("");
                  setTagFilter("");
                }}
                type="button"
              >
                Clear filters
              </button>
            )}
          </div>

          {filterError && (
            <div className="inline-error" role="alert">
              <span>{filterError}</span>
              <button
                className="text-button"
                onClick={() => {
                  setStatusFilter("");
                  setTagFilter("");
                }}
                type="button"
              >
                Show all books
              </button>
            </div>
          )}

          {summary.total === 0 ? (
            <EmptyLibrary
              onAdd={() => {
                setEditingBook(null);
                setEditorOpen(true);
              }}
            />
          ) : books.length === 0 ? (
            <FilteredEmpty onClear={() => {
              setStatusFilter("");
              setTagFilter("");
            }} />
          ) : (
            <div className="book-grid" aria-busy={filtering}>
              {books.map((book) => (
                <BookCard
                  book={book}
                  key={book.id}
                  onDelete={(selected) => {
                    focusAfterDeleteRef.current = false;
                    setDeleteTarget(selected);
                  }}
                  onEdit={(selected) => {
                    setEditingBook(selected);
                    setEditorOpen(true);
                  }}
                  onStatusChange={(selected, status) => void updateStatus(selected, status)}
                  statusBusy={statusBusyIds.has(book.id)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="dashboard-footer">
        <span>Shelfmark</span>
        <span aria-hidden="true">◆</span>
        <span>Your books remain yours.</span>
      </footer>

      {editorOpen && (
        <BookDialog
          book={editingBook}
          onClose={() => setEditorOpen(false)}
          onSave={saveBook}
        />
      )}
      {deleteTarget && (
        <DeleteDialog
          book={deleteTarget}
          onClose={() => {
            setDeleteTarget(null);
            if (focusAfterDeleteRef.current) {
              focusAfterDeleteRef.current = false;
              window.requestAnimationFrame(() => collectionHeadingRef.current?.focus());
            }
          }}
          onConfirm={deleteBook}
        />
      )}
    </div>
  );
}

function AuthorInsight({ summary }: { summary: DashboardSummary }) {
  const insight = summary.authorInsight;
  return (
    <article className="insight-card">
      <div className="insight-card__ornament" aria-hidden="true">
        ✦
      </div>
      <div>
        <p className="eyebrow">A note from your shelves</p>
        {insight ? (
          <>
            <h2>You keep returning to {insight.name}.</h2>
            <p>
              {insight.bookCount} books make them your most-collected author. Perhaps
              it is time to revisit <strong>{insight.rediscovery.title}</strong>.
            </p>
          </>
        ) : (
          <>
            <h2>Your reading pattern is taking shape.</h2>
            <p>
              Add a second book by an author and this space will surface a gentle
              rediscovery from your shelves.
            </p>
          </>
        )}
      </div>
    </article>
  );
}

function EmptyLibrary({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-state__books" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="eyebrow">An open shelf</p>
      <h3>Your collection begins with one book.</h3>
      <p>Add the story that first made you lose track of time—or simply the next one.</p>
      <button className="button button--primary" onClick={onAdd} type="button">
        <PlusIcon />
        Add your first book
      </button>
    </div>
  );
}

function FilteredEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="empty-state empty-state--compact">
      <p className="eyebrow">No match on this shelf</p>
      <h3>No books fit these filters.</h3>
      <p>Clear the filters to return to your full collection.</p>
      <button className="button button--secondary" onClick={onClear} type="button">
        Clear filters
      </button>
    </div>
  );
}

function DashboardLoading({ waking }: { waking: boolean }) {
  return (
    <main id="main-content" className="loading-page" aria-live="polite">
      <a className="brand" href="/dashboard">
        <span className="brand__mark" aria-hidden="true">S</span>
        <span>Shelfmark</span>
      </a>
      <div className="loading-page__content">
        <div className="loading-mark" aria-hidden="true"><span /><span /><span /></div>
        <p className="eyebrow">{waking ? "The server is resting" : "Opening your library"}</p>
        <h1>{waking ? "Waking the server…" : "Finding your place…"}</h1>
        <p>
          {waking
            ? "Free hosting sometimes takes a quiet moment to stir. Your books are safe."
            : "Gathering your shelves and reading notes."}
        </p>
      </div>
    </main>
  );
}

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main id="main-content" className="error-page">
      <div className="error-page__card">
        <p className="eyebrow">The library door stuck</p>
        <h1>We could not open your shelves.</h1>
        <p role="alert">{message}</p>
        <button className="button button--primary" onClick={onRetry} type="button">
          Try again
        </button>
      </div>
    </main>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M10 5H5v14h5m4-3 4-4-4-4m4 4H9" />
    </svg>
  );
}
