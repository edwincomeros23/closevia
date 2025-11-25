## Cloudinary Integration & Migration Guide

This guide describes how Clovia now integrates with Cloudinary, how to migrate all existing images, and how to keep the platform online while the migration takes place.

---

### 1. Prerequisites

1. Create/upload preset inside Cloudinary (Unsigned or Signed). Copy the preset name into `CLOUDINARY_UPLOAD_PRESET`.
2. Grab the **CLOUDINARY_URL** from the dashboard and set it in your environment.
3. (Optional) Choose a logical folder prefix (defaults to `clovia`) so that assets remain organized (e.g., `clovia/products/...`).

Add these variables to your `.env` based on `env.example`:

```
CLOUDINARY_URL=cloudinary://314494478594127:jD8qiot-StyIHYNuBBqMHeoqpIk@dbhq4jerf
CLOUDINARY_UPLOAD_PRESET=clovia_unsigned
CLOUDINARY_FOLDER_PREFIX=clovia
```

Restart the Go API after updating environment variables so the Cloudinary client is re-initialized.

---

### 2. Runtime Integration Highlights

- **Automatic uploads:** `handlers/product_handler.go` and `handlers/user_handler.go` now attempt to upload every new image to Cloudinary first. On success we persist the secure Cloudinary URL.
- **Smart fallback:** If Cloudinary is misconfigured or returns an error, the code logs the issue and falls back to the existing `/uploads/...` filesystem behavior. This guarantees availability during rollout.
- **Safe filenames & directories:** All filenames are sanitized (`services/media_utils.go`), uploads are partitioned by subfolders (`products`, `profile-pictures`) and directory creation is handled automatically.
- **Absolute URLs for legacy assets:** When we fall back to local storage, `buildAbsoluteURL` makes sure the API responds with a fully qualified URL so the SPA never requests `http://localhost:5173/uploads/...` by accident.

---

### 3. Migration Script Options

| Option | Description | When to use |
| --- | --- | --- |
| **A. Automated Go migrator** | `go run ./scripts/migrate_images.go --dry-run=false` reads every product/user record, uploads local assets to Cloudinary, and updates the DB JSON fields. Supports `--dry-run` (default) and `--limit`. | Use when you have shell access to the server and want a deterministic migration with audit logs. |
| **B. Cloudinary CLI/Upload API** | Use the [Cloudinary CLI](https://cloudinary.com/documentation/cli) or Upload API to bulk upload the `uploads/` directory (`cld uploader upload ./uploads/** --folder clovia/products`). Afterwards, run a small SQL script to update DB rows with the new secure URLs using mapping files. | Helpful when DB access is restricted but files can be synced to Cloudinary separately (e.g., via CI/CD). |

#### Running Option A (recommended)

1. Ensure `.env` is loaded (DB + Cloudinary vars).
2. Preview the work:
   ```
   go run ./scripts/migrate_images.go --dry-run
   ```
3. Execute for real:
   ```
   go run ./scripts/migrate_images.go --dry-run=false
   ```
4. Optional filters: `--limit=100` migrates the first 100 products for a phased rollout.

The script automatically updates `products.image_urls` (JSON array) and `users.profile_picture`. Only records that still point at `/uploads/...` are touched. Missing files are logged and skipped.

#### Running Option B (manual/CLI)

1. Use the Cloudinary CLI to upload *only* the filesystem assets:
   ```
   cld uploader upload ./uploads/products/** --folder clovia/products --resource-type image
   ```
2. Export a CSV mapping (`old_path,new_url`) returned by the CLI.
3. Run a SQL script that uses this mapping to update `products.image_urls` and `users.profile_picture`. You can feed the CSV through MySQL’s `LOAD DATA` and join on `old_path LIKE CONCAT('%', mapping.old_path)` to update JSON arrays.
4. Delete/backup the migrated files once production confirms the new URLs resolve.

---

### 4. Database Update Strategy

1. **Products** – `scripts/migrate_images.go` deserializes `products.image_urls`, replaces every `/uploads/...` entry with the new Cloudinary `secure_url`, and writes the JSON back. Legacy HTTP URLs that already point at Cloudinary or any CDN are left untouched.
2. **Users** – Profile pictures stored as relative URLs become Cloudinary URLs. Absolute links that do not reference `/uploads` are preserved.
3. **Auditing** – Run the migrator in `--dry-run` to capture the log and keep it with the deployment ticket. When running live, redirect stdout/stderr to a file for traceability.
4. **Rollback** – Because the old files remain on disk, you can revert by restoring the previous DB backup if necessary.

---

### 5. Fallback Mechanism & Transition Handling

- **During migration** the API continues to accept uploads even if Cloudinary has an outage. Local copies are still served under `/uploads/...`.
- **Hybrid URLs** are supported: API responses can now contain a mixture of `https://res.cloudinary.com/...` and `/uploads/...`. The frontend already normalizes these paths and the backend builds absolute URLs when necessary.
- **Cache busting** comes for free because Cloudinary public IDs are derived from sanitized filenames plus timestamps. Local fallbacks also include nanosecond prefixes to avoid collisions.
- **Error tolerance**: Failure to migrate an individual record simply logs and continues; it will be retried on a subsequent run (since the URL will still point at `/uploads/...`).

---

### 6. Fixing Current Image Issues

- **Broken URLs / malformed paths** – The migration script normalizes every `/uploads/...` URL. For runtime uploads, all paths are sanitized and directories auto-created, so `../` or whitespace-laden filenames can no longer produce invalid URLs.
- **API endpoint failures** – Cloudinary errors no longer bubble up to the client. They are logged and the request continues using the local filesystem fallback so product creation/profile updates succeed.
- **Reliable delivery** – Once migrated, assets are served from Cloudinary’s CDN. Local storage stays only as a fallback.

---

### 7. Suggested Rollout Checklist

1. Configure Cloudinary env vars in all environments.
2. Deploy the updated backend.
3. Run the migrator in dry-run and review logs.
4. Execute the migrator for real (possibly in batches using `--limit`).
5. Spot-check the UI to ensure both old and new listings render correctly.
6. After full migration, schedule a task to prune unused files in `uploads/`.

That’s it—Cloudinary is now the primary image store, with tools in place to migrate legacy content and keep the app resilient throughout the process.

