# Backend tests

Run commands from the `server/` folder (running from the repo root also works).
The tests use an in-memory database, a fake LLM and fake embeddings, and block
all third-party calls (Cloudinary, Cloudflare, Google, the location API and
SMTP), so no `.env` secrets or running services are needed.

## Setup (once)

```bash
pip install -r requirements.txt
```

## Everyday commands

| What | Command |
| --- | --- |
| Run all tests | `python -m pytest` |
| Quiet output | `python -m pytest -q` |
| Stop at the first failure | `python -m pytest -x` |
| Re-run only what failed last time | `python -m pytest --lf` |
| Show each test name | `python -m pytest -v` |
| Show `print()` output | `python -m pytest -s` |

## Coverage

| What | Command |
| --- | --- |
| Coverage in the terminal (missing lines listed) | `python -m pytest --cov` |
| Same check CI runs (fails below 97%) | `python -m pytest -q --cov --cov-report=term --cov-fail-under=97` |
| HTML report (open `htmlcov/index.html`) | `python -m pytest --cov --cov-report=html` |

## Lint, format and type check

Run from `server/`; settings live in `pyproject.toml`.

| What | Command |
| --- | --- |
| Lint | `python -m ruff check .` |
| Lint and apply safe fixes | `python -m ruff check . --fix` |
| Format | `python -m black .` |
| Type check | `pyrefly check` |

## Running part of the suite

| What | Command |
| --- | --- |
| Only API route tests | `python -m pytest tests/api` |
| Only unit tests | `python -m pytest tests/unit` |
| One file | `python -m pytest tests/api/test_auth_routes.py` |
| One test | `python -m pytest tests/api/test_auth_routes.py::test_login_verify_issues_token` |
| Tests whose name matches a word | `python -m pytest -k witness` |
| The 10 slowest tests | `python -m pytest --durations=10` |

## Against a real MongoDB (optional)

The same suite can run against a real MongoDB server instead of the in-memory
mock. Each test gets its own throwaway database, dropped afterwards. CI runs
both.

```bash
# PowerShell
$env:TEST_MONGODB_URL = "mongodb://localhost:27017"; python -m pytest; Remove-Item Env:TEST_MONGODB_URL

# Git Bash / macOS / Linux
TEST_MONGODB_URL=mongodb://localhost:27017 python -m pytest
```

Start a local server first, for example `docker run -d --rm -p 27017:27017 mongo:8`.

## Known-bug tests (xfail)

A test marked `@pytest.mark.xfail(strict=True, reason="...")` documents a bug
that is not fixed yet. It shows as `x` in the output; list them with
`python -m pytest -rx`. When the bug is fixed the test passes and the run
**fails** with `XPASS(strict)`: delete the `xfail` line to make it a normal
test. (There are none right now.)

## Layout

- `tests/conftest.py`: shared fixtures (database, fake LLM, email outbox, third-party blocks, users, cases)
- `tests/api/`: tests that call the FastAPI routes
- `tests/unit/`: tests for services, utilities and config
- `tests/helpers.py`: small shared helpers, e.g. `boom` (an async stand-in that always fails)
- `tests/api/test_ownership.py`: one table checking 404/403 on every case route; add new case routes there
- `pyproject.toml` (in `server/`): pytest and coverage settings
