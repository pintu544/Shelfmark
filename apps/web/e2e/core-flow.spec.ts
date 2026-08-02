import { expect, test, type Page, type Route } from "@playwright/test";

type BookStatus = "want-to-read" | "reading" | "completed";

interface TestBook {
  id: string;
  title: string;
  author: string;
  tags: string[];
  status: BookStatus;
  createdAt: string;
  updatedAt: string;
}

const user = {
  id: "64b000000000000000000001",
  name: "Avery Reader",
  email: "avery@example.com",
};

function json(route: Route, status: number, body: unknown, headers = {}) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify(body),
  });
}

async function installApiFixture(page: Page) {
  let authenticated = false;
  let nextId = 1;
  let books: TestBook[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    const method = request.method();

    if (pathname === "/api/health" && method === "GET") {
      await json(route, 200, { status: "ok" });
      return;
    }

    if (pathname === "/api/auth/signup" && method === "POST") {
      authenticated = true;
      await page.context().addCookies([
        {
          name: "thumbstack_session",
          value: "playwright-session",
          domain: "127.0.0.1",
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await json(route, 201, { user });
      return;
    }

    if (pathname === "/api/auth/me" && method === "GET") {
      await json(
        route,
        authenticated ? 200 : 401,
        authenticated
          ? { user }
          : { error: { code: "AUTH_REQUIRED", message: "Please sign in to continue." } },
      );
      return;
    }

    if (pathname === "/api/auth/logout" && method === "POST") {
      authenticated = false;
      await page.context().clearCookies({ name: "thumbstack_session" });
      await route.fulfill({ status: 204 });
      return;
    }

    if (!authenticated) {
      await json(route, 401, {
        error: { code: "AUTH_REQUIRED", message: "Please sign in to continue." },
      });
      return;
    }

    if (pathname === "/api/books" && method === "GET") {
      const status = url.searchParams.get("status");
      const tag = url.searchParams.get("tag");
      const filtered = books.filter(
        (book) =>
          (!status || book.status === status) &&
          (!tag || book.tags.includes(tag.toLocaleLowerCase())),
      );
      await json(route, 200, { books: filtered });
      return;
    }

    if (pathname === "/api/books" && method === "POST") {
      const input = request.postDataJSON() as Omit<TestBook, "id" | "createdAt" | "updatedAt">;
      const now = new Date().toISOString();
      const book: TestBook = {
        ...input,
        id: `64b0000000000000000000${String(nextId++).padStart(2, "0")}`,
        tags: input.tags.map((tag) => tag.toLocaleLowerCase()),
        createdAt: now,
        updatedAt: now,
      };
      books = [book, ...books];
      await json(route, 201, { book });
      return;
    }

    const bookMatch = pathname.match(/^\/api\/books\/([^/]+)$/);
    if (bookMatch && method === "PATCH") {
      const input = request.postDataJSON() as Partial<TestBook>;
      const index = books.findIndex((book) => book.id === bookMatch[1]);
      if (index < 0) {
        await json(route, 404, {
          error: { code: "BOOK_NOT_FOUND", message: "Book not found." },
        });
        return;
      }
      books[index] = {
        ...books[index],
        ...input,
        tags: input.tags?.map((tag) => tag.toLocaleLowerCase()) ?? books[index].tags,
        updatedAt: new Date().toISOString(),
      };
      await json(route, 200, { book: books[index] });
      return;
    }

    if (bookMatch && method === "DELETE") {
      books = books.filter((book) => book.id !== bookMatch[1]);
      await route.fulfill({ status: 204 });
      return;
    }

    if (pathname === "/api/dashboard" && method === "GET") {
      const byStatus: Record<BookStatus, number> = {
        "want-to-read": 0,
        reading: 0,
        completed: 0,
      };
      for (const book of books) byStatus[book.status] += 1;
      const tags = [...new Set(books.flatMap((book) => book.tags))].sort();
      await json(route, 200, {
        summary: {
          total: books.length,
          byStatus,
          tags,
          authorInsight: null,
        },
      });
      return;
    }

    await json(route, 404, {
      error: { code: "ROUTE_NOT_FOUND", message: "Endpoint not found." },
    });
  });
}

test("reader can manage a private collection from signup through logout", async ({ page }) => {
  await installApiFixture(page);
  await page.goto("/signup");

  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password").fill("a-secure-test-password");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /Avery/ })).toBeVisible();

  await page.getByRole("button", { name: "Add a book" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add a book" });
  await addDialog.getByLabel("Title").fill("The Dispossessed");
  await addDialog.getByLabel("Author").fill("Ursula Le Guin");
  await addDialog.getByLabel("Tags").fill("science fiction, classic");
  await addDialog.getByLabel("Reading status").selectOption("reading");
  await addDialog.getByRole("button", { name: "Add to library" }).click();

  let card = page.locator("article.book-card").filter({ hasText: "The Dispossessed" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Edit" }).click();

  const editDialog = page.getByRole("dialog", { name: "Edit book" });
  await editDialog.getByLabel("Title").fill("The Left Hand of Darkness");
  await editDialog.getByRole("button", { name: "Save changes" }).click();

  card = page.locator("article.book-card").filter({ hasText: "The Left Hand of Darkness" });
  await expect(card).toBeVisible();
  await card.getByLabel("Reading status").selectOption("completed");
  await expect(card.getByLabel("Reading status")).toHaveValue("completed");

  const filters = page.locator(".filters select");
  await filters.nth(0).selectOption("completed");
  await filters.nth(1).selectOption("classic");
  await expect(card).toBeVisible();

  await card.getByRole("button", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete this book?" });
  await deleteDialog.getByRole("button", { name: "Delete book" }).click();
  await expect(page.getByRole("heading", { name: "Your collection begins with one book." })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?reason=authentication-required$/);
});
