#!/usr/bin/env python3
"""Upload multiple E2B workspace files to a Tigris test prefix.

This script intentionally does not call Agent Garden's D1 API. It uploads only
under test/e2b-batches/<session-id>/ and prints a signed download URL per file.

Required environment variables:
  TIGRIS_ACCESS_KEY_ID
  TIGRIS_SECRET_ACCESS_KEY
  TIGRIS_BUCKET_NAME       (for example: agent.garden)

Optional environment variables:
  TIGRIS_ENDPOINT          (default: https://t3.storage.dev)
  TIGRIS_REGION            (default: auto)
  E2B_SESSION_ID           (default: e2b-local-test)
  E2B_WORKSPACE_DIR        (default: /tmp/agent-garden-users/workspace)
  Tigris uses standard S3-compatible credentials; never hard-code them here.

Example:
  python3 e2b_multi_upload_test.py --workspace /tmp/e2b-workspace
"""

from __future__ import annotations

import argparse
import mimetypes
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

try:
    import boto3
    from botocore.config import Config
except ImportError as exc:  # pragma: no cover - user-facing dependency check
    raise SystemExit(
        "Missing dependency: boto3. Install it with: python3 -m pip install boto3"
    ) from exc


@dataclass
class UploadResult:
    source: str
    key: str
    size: int
    content_type: str
    url: str | None
    ok: bool
    error: str | None = None


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def make_client():
    # Tigris works with the S3 API. Signature v4 and path-style addressing are
    # retained for compatibility with the Agent Garden Render configuration.
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("TIGRIS_ENDPOINT", "https://t3.storage.dev"),
        region_name=os.environ.get("TIGRIS_REGION", "auto"),
        aws_access_key_id=required_env("TIGRIS_ACCESS_KEY_ID"),
        aws_secret_access_key=required_env("TIGRIS_SECRET_ACCESS_KEY"),
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def iter_files(workspace: Path) -> Iterable[Path]:
    if not workspace.exists():
        raise SystemExit(f"Workspace directory does not exist: {workspace}")
    if not workspace.is_dir():
        raise SystemExit(f"Workspace path is not a directory: {workspace}")
    for path in sorted(workspace.rglob("*")):
        if path.is_file() and not path.is_symlink():
            yield path


def upload_one(client, bucket: str, workspace: Path, source: Path, prefix: str, expires: int, attempts: int) -> UploadResult:
    relative = source.relative_to(workspace).as_posix()
    safe_key = "/".join(part for part in relative.split("/") if part not in ("", ".", ".."))
    key = f"{prefix.rstrip('/')}/{safe_key}"
    content_type = mimetypes.guess_type(source.name)[0] or "application/octet-stream"
    size = source.stat().st_size

    last_error = None
    for attempt in range(attempts):
        try:
            client.upload_file(
                str(source),
                bucket,
                key,
                ExtraArgs={
                    "ContentType": content_type,
                    "ContentDisposition": f'attachment; filename="{source.name}"',
                },
            )
            client.head_object(Bucket=bucket, Key=key)
            url = client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": key},
                ExpiresIn=expires,
            )
            return UploadResult(str(source), key, size, content_type, url, True)
        except Exception as exc:  # boto3 exposes provider-specific exception types
            last_error = str(exc)
            if attempt + 1 < attempts:
                time.sleep(2 ** attempt)

    return UploadResult(str(source), key, size, content_type, None, False, last_error)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", default=os.environ.get("E2B_WORKSPACE_DIR", "/tmp/agent-garden-users/workspace"), type=Path)
    parser.add_argument("--session-id", default=os.environ.get("E2B_SESSION_ID", "e2b-local-test"))
    parser.add_argument("--prefix", default=None, help="Override the object prefix; defaults to test/e2b-batches/<session-id>")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--expires", type=int, default=900, help="Presigned URL lifetime in seconds")
    parser.add_argument("--attempts", type=int, default=3)
    args = parser.parse_args()

    if args.workers < 1 or args.workers > 16:
        raise SystemExit("--workers must be between 1 and 16")
    if args.attempts < 1 or args.attempts > 5:
        raise SystemExit("--attempts must be between 1 and 5")

    bucket = required_env("TIGRIS_BUCKET_NAME")
    workspace = args.workspace.resolve()
    prefix = args.prefix or f"test/e2b-batches/{args.session_id}"
    files = list(iter_files(workspace))
    if not files:
        raise SystemExit(f"No files found in {workspace}")

    client = make_client()
    results: list[UploadResult] = []
    with ThreadPoolExecutor(max_workers=min(args.workers, len(files))) as pool:
        futures = [pool.submit(upload_one, client, bucket, workspace, source, prefix, args.expires, args.attempts) for source in files]
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            status = "uploaded" if result.ok else "failed"
            print(f"[{status}] {result.source} -> {result.key}")
            if result.error:
                print(f"  error: {result.error}", file=sys.stderr)
            elif result.url:
                print(f"  download: {result.url}")

    results.sort(key=lambda item: item.key)
    summary = {
        "bucket": bucket,
        "prefix": prefix,
        "d1Indexed": False,
        "total": len(results),
        "uploaded": sum(item.ok for item in results),
        "failed": sum(not item.ok for item in results),
        "files": [asdict(item) for item in results],
    }
    print("\nSUMMARY_JSON=" + __import__("json").dumps(summary, separators=(",", ":")))
    return 0 if summary["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
