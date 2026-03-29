from __future__ import annotations

import argparse
import io
import json
import logging
import os
import zipfile
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen


LOGGER_FORMAT = "%(asctime)s | %(levelname)s | %(message)s"
API_VERSION = "2022-11-28"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Restore the latest sync-state artifact from GitHub Actions")
    parser.add_argument("--repo", required=True, help="GitHub repository in owner/name format")
    parser.add_argument("--workflow", required=True, help="Workflow file name, e.g. catalog-sync.yml")
    parser.add_argument("--branch", default="main", help="Branch to inspect for previous runs")
    parser.add_argument("--artifact-name", default=None, help="Preferred exact artifact name")
    parser.add_argument("--artifact-prefix", default=None, help="Fallback artifact name prefix")
    parser.add_argument(
        "--conclusions",
        default="success",
        help="Comma-separated run conclusions to consider, e.g. success,failure,cancelled",
    )
    parser.add_argument(
        "--restore-file",
        action="append",
        default=[],
        help="File path to restore into the workspace, e.g. data/raw_catalog.json",
    )
    parser.add_argument("--exclude-run-id", default=None, help="Current run id to skip when searching history")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    return parser.parse_args()


def configure_logging(verbose: bool) -> None:
    logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO, format=LOGGER_FORMAT)


def github_headers(token: str, *, binary: bool = False) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "belita-sync-state-restore",
    }
    headers["Accept"] = "application/vnd.github+json"
    return headers


def api_get_json(url: str, token: str) -> dict[str, Any]:
    request = Request(url, headers=github_headers(token))
    with urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def api_get_bytes(url: str, token: str) -> bytes:
    request = Request(url, headers=github_headers(token, binary=True))
    opener = build_opener(NoRedirectHandler())
    try:
        with opener.open(request, timeout=60) as response:
            redirect_url = response.headers.get("Location")
    except HTTPError as exc:
        if exc.code not in {301, 302, 303, 307, 308}:
            raise
        redirect_url = exc.headers.get("Location")

    if not redirect_url:
        raise RuntimeError("GitHub artifact download did not return a redirect URL")

    with urlopen(redirect_url, timeout=120) as response:
        return response.read()


class NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[override]
        return None


def normalized_restore_targets(values: list[str]) -> list[Path]:
    result: list[Path] = []
    for value in values:
        candidate = Path(value)
        if candidate in result:
            continue
        result.append(candidate)
    return result


def match_archive_entry(archive_names: list[str], restore_target: Path) -> str | None:
    wanted = restore_target.as_posix().lstrip("./")
    wanted_name = restore_target.name

    exact_matches = [name for name in archive_names if name.lstrip("./") == wanted]
    if exact_matches:
        return exact_matches[0]

    basename_matches = [name for name in archive_names if Path(name).name == wanted_name]
    if basename_matches:
        return basename_matches[0]

    return None


def restore_files_from_archive(archive_bytes: bytes, restore_targets: list[Path]) -> list[Path]:
    restored: list[Path] = []

    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        archive_names = archive.namelist()
        logging.debug("Archive entries: %s", archive_names)

        for target in restore_targets:
            matched_name = match_archive_entry(archive_names, target)
            if matched_name is None:
                logging.info("Archive does not contain %s", target.as_posix())
                continue

            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(matched_name))
            restored.append(target)
            logging.info("Restored %s from archive entry %s", target.as_posix(), matched_name)

    return restored


def artifact_matches(artifact: dict[str, Any], exact_name: str | None, prefix: str | None) -> bool:
    name = str(artifact.get("name") or "")
    if exact_name and name == exact_name:
        return True
    if prefix and name.startswith(prefix):
        return True
    return False


def iter_candidate_runs(repo: str, workflow: str, branch: str, token: str) -> list[dict[str, Any]]:
    query = urlencode({"branch": branch, "status": "completed", "per_page": 30})
    url = f"https://api.github.com/repos/{repo}/actions/workflows/{workflow}/runs?{query}"
    payload = api_get_json(url, token)
    runs = payload.get("workflow_runs")
    if not isinstance(runs, list):
        return []
    return [run for run in runs if isinstance(run, dict)]


def find_matching_artifact(
    repo: str,
    workflow: str,
    branch: str,
    conclusions: set[str],
    exact_name: str | None,
    prefix: str | None,
    exclude_run_id: str | None,
    token: str,
) -> tuple[dict[str, Any], dict[str, Any]] | tuple[None, None]:
    runs = iter_candidate_runs(repo, workflow, branch, token)
    for run in runs:
        run_id = str(run.get("id") or "")
        run_conclusion = str(run.get("conclusion") or "")
        if exclude_run_id and run_id == exclude_run_id:
            continue
        if run_conclusion not in conclusions:
            continue

        artifacts_url = f"https://api.github.com/repos/{repo}/actions/runs/{run_id}/artifacts?per_page=100"
        artifacts_payload = api_get_json(artifacts_url, token)
        artifacts = artifacts_payload.get("artifacts")
        if not isinstance(artifacts, list):
            continue

        exact_matches: list[dict[str, Any]] = []
        prefix_matches: list[dict[str, Any]] = []
        for artifact in artifacts:
            if not isinstance(artifact, dict):
                continue
            if artifact.get("expired"):
                continue
            if exact_name and str(artifact.get("name") or "") == exact_name:
                exact_matches.append(artifact)
                continue
            if prefix and str(artifact.get("name") or "").startswith(prefix):
                prefix_matches.append(artifact)

        if exact_matches:
            return run, exact_matches[0]
        if prefix_matches:
            return run, prefix_matches[0]

    return None, None


def main() -> int:
    args = parse_args()
    configure_logging(args.verbose)

    token = os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN")
    if not token:
        logging.warning("GITHUB_TOKEN/GH_TOKEN not found; skipping state restore")
        return 0

    restore_targets = normalized_restore_targets(args.restore_file)
    if not restore_targets:
        logging.info("No restore targets requested; nothing to do")
        return 0

    conclusions = {item.strip() for item in args.conclusions.split(",") if item.strip()}
    if not conclusions:
        conclusions = {"success"}

    try:
        run, artifact = find_matching_artifact(
            repo=args.repo,
            workflow=args.workflow,
            branch=args.branch,
            conclusions=conclusions,
            exact_name=args.artifact_name,
            prefix=args.artifact_prefix,
            exclude_run_id=args.exclude_run_id,
            token=token,
        )
        if run is None or artifact is None:
            logging.info("No matching prior artifact found for restore")
            return 0

        artifact_name = str(artifact.get("name") or "")
        run_id = str(run.get("id") or "")
        archive_url = str(artifact.get("archive_download_url") or "")
        logging.info("Downloading artifact %s from run %s", artifact_name, run_id)
        archive_bytes = api_get_bytes(archive_url, token)
        restored = restore_files_from_archive(archive_bytes, restore_targets)
        if not restored:
            logging.warning("Artifact downloaded but none of the requested files were restored")
        return 0
    except (HTTPError, URLError, TimeoutError) as exc:
        logging.warning("State restore request failed: %s", exc)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
