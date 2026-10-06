# Development guide

Run commands from the project root, the folder containing `package.json`.

## Source layout

| File or directory        | Responsibility                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `server.js`              | Load configuration and start the HTTP server.                                                 |
| `server/app.js`          | Route requests, manage capture state, and preserve the legacy device API.                     |
| `server/config.js`       | Read and validate environment settings.                                                       |
| `server/http.js`         | Read bounded JSON bodies, send responses, and serve dashboard assets.                         |
| `server/security.js`     | Check bearer tokens, browser origins, and loopback host names.                                |
| `server/device.js`       | Poll the ESP32 with authentication, a timeout, and one shared request.                        |
| `server/inference.js`    | Run an isolated Python worker for each optical capture.                                       |
| `server/validation.js`   | Validate sample windows and device vitals.                                                    |
| `web/App.jsx`            | Dashboard state, backend polling, demo capture, and CSV import.                               |
| `web/pages/`             | Overview, Sessions, and Model & evidence pages.                                               |
| `web/components/`        | Shared UI: navigation, signal plot, dialogs, and badges.                                      |
| `web/lib/`, `web/hooks/` | Formatting, synthetic demo data, downloads, page metadata, and the dialog focus trap.         |
| `ml/`                    | Shared signal contract, training, and portable inference.                                     |
| `firmware/`              | ESP32 sketch, configuration example, and hardware instructions.                               |
| `tests/`                 | HTTP, React DOM, configuration, concurrency, and Python regression tests.                     |
| `scripts/`               | Publication checks, benchmark synchronization, portable demo export, and transport simulator. |

The HTTP application factory creates its own in-memory session and returns a Node server without binding a port. Tests can start it on an available port and provide a controlled inference function to exercise concurrent captures. Device polling and Python workers run only when their corresponding API routes are used.

## Formatting

Install the development dependencies in your activated virtual environment:

```sh
python -m pip install -r requirements-dev.txt
npm ci
```

Apply formatting:

```sh
npm run format
npm run format:python
```

Check formatting without changing files:

```sh
npm run format:check
npm run format:python:check
```

Prettier formats JavaScript, JSX, CSS, HTML, JSON, Markdown, and workflow files. Black formats Python. Their settings are stored in `.prettierrc.json` and `pyproject.toml`; the Black version is pinned to keep CI formatting stable. Generated demo HTML, benchmark artifacts, model weights, private data, and local review tooling are excluded from the JavaScript formatter.

## Verification

```sh
npm test
```

This builds the dashboard, runs JavaScript tests, and runs Python tests. GitHub CI checks formatting and runs the suite on Windows and Linux. No private training dataset or model weights are needed by these tests. Physical sensor behavior and rendered browser layout require separate checks.

Check publication candidates before staging, then check the actual Git index before committing:

```sh
npm run check:publish
npm run check:publish -- --staged
```

The first command also works before Git initialization using a temporary, ignored Git directory. The staged command requires a repository initialized in this project folder. Both checks fail on private paths, recognized credential patterns, configured firmware secrets, raw JSON captures, and model parameters. They report reasons without copying matched values into logs. The staged check rejects symlinks, submodules, and unresolved merges because their content cannot be reviewed as regular project files. To run the staged check before every commit, enable the included hook with `git config --local core.hooksPath .githooks`. These checks catch common mistakes; they are not a complete secret scanner, so CI also runs Gitleaks across the Git history.

After frontend changes, regenerate the portable demo:

```sh
npm run demo:portable
```

## Configuration

Copy `.env.example` to `.env` for local configuration. `npm start` reads that file. Ports must be integers from 1 to 65535, retention durations must be positive integer milliseconds, and `ESP32_URL` must be an absolute HTTP or HTTPS URL. Invalid settings fail at startup with a descriptive error.

The `private` field in `package.json` prevents accidental npm package publication. GitHub repository visibility is configured separately.

Vite reads only `PORT` settings for its development proxy. Automatic `VITE_*` environment exposure is disabled: browser settings come from the runtime connection UI. Public-directory copying and production source maps are disabled. Add any future public assets through explicit source imports, and keep tokens in local runtime configuration.
