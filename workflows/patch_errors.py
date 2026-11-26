#!/usr/bin/env python3
"""Workflow Mistral Studio « patch_errors » — corrige automatiquement les erreurs
de lint et de tests du dépôt GitHub alphaleadership/extractor.

Orchestration durable (SDK mistralai-workflows, backend Temporal) :
  checkout → eslint --fix → node --test → (si erreurs) patch agent Mistral → branche fix/

Déclenchement : trigger webhook GitHub (push / pull_request / issues.opened).
Worker : python -m workflows.patch_errors  (run_worker)
"""
import os
import subprocess
from dataclasses import dataclass

from mistralai.workflows import activity, workflow


@dataclass
class PatchRequest:
    repo: str = "alphaleadership/extractor"
    ref: str = "main"
    pr_number: int = 0
    issue_number: int = 0
    issue_title: str = ""


@activity
async def checkout(repo: str, ref: str) -> str:
    """Clone le dépôt (shallow) et retourne le répertoire de travail."""
    import tempfile
    workdir = tempfile.mkdtemp(prefix="patch-")
    subprocess.run(["git", "clone", "--depth", "1", "-b", ref,
                    f"https://github.com/{repo}.git", workdir], check=True)
    return workdir


@activity
async def lint_fix(workdir: str) -> dict:
    """npm ci + eslint --fix ; retourne les erreurs restantes."""
    import json
    subprocess.run(["npm", "ci"], cwd=workdir, check=True)
    subprocess.run(["npx", "eslint", ".", "--fix"], cwd=workdir, check=False)
    res = subprocess.run(["npx", "eslint", ".", "--format", "json"], cwd=workdir,
                         capture_output=True, text=True)
    problems = []
    for f in json.loads(res.stdout or "[]"):
        for m in f.get("messages", []):
            if m.get("severity") == 2:
                problems.append(f"{f['filePath']}:{m['line']}:{m['column']} {m['ruleId']}: {m['message']}")
    return {"remaining": problems}


@activity
async def run_tests(workdir: str) -> dict:
    """Exécute les tests générés (e2e)."""
    res = subprocess.run(["node", "--test", "test/e2e.test.js"], cwd=workdir,
                         capture_output=True, text=True)
    return {"ok": res.returncode == 0, "output": (res.stdout + res.stderr)[-4000:]}


@activity
async def mistral_patch(workdir: str, errors: str) -> str:
    """Agent Mistral : produit un unified diff minimal pour les erreurs restantes."""
    from mistralai import Mistral
    client = Mistral(api_key=os.environ["MISTRAL_API_KEY"])
    resp = client.chat.complete(
        model=os.environ.get("MISTRAL_MODEL", "mistral-small-latest"),
        messages=[{"role": "user", "content":
                   "Corrige ces erreurs (patch minimal, unified diff pour `git apply`) :\n\n" + errors[:8000]}],
    )
    return resp.choices[0].message.content or ""


@activity
async def apply_and_commit(workdir: str, diff: str, branch: str) -> str:
    """Applique le diff, commit et push la branche fix/."""
    import pathlib
    if diff.strip():
        p = pathlib.Path(workdir) / "patch.diff"
        p.write_text(diff, encoding="utf-8")
        subprocess.run(["git", "apply", "patch.diff"], cwd=workdir, check=True)
    subprocess.run(["git", "checkout", "-b", branch], cwd=workdir, check=True)
    subprocess.run(["git", "add", "-A"], cwd=workdir, check=True)
    subprocess.run(["git", "-c", "user.name=mistral-bot", "-c", "user.email=mistral@mistral.ai",
                    "commit", "-m", "fix(mistral): patch auto lint/tests"], cwd=workdir, check=False)
    subprocess.run(["git", "push", "-u", "origin", branch], cwd=workdir, check=True)
    return branch


@workflow.define(name="patch_errors")
class PatchErrors:
    @workflow.entrypoint
    async def run(self, req: PatchRequest) -> dict:
        workdir = await workflow.execute_activity(checkout, req.repo, req.ref)
        # Temporal: les activités s'exécutent via workflow.execute_activity
        lint = await workflow.execute_activity(lint_fix, workdir)
        tests = await workflow.execute_activity(run_tests, workdir)
        branch = ""
        if lint["remaining"] or not tests["ok"]:
            errors = "LINT:\n" + "\n".join(lint["remaining"][:50]) + "\nTESTS:\n" + tests["output"]
            diff = await workflow.execute_activity(mistral_patch, workdir, errors)
            label = req.issue_number or req.pr_number or "manual"
            branch = await workflow.execute_activity(
                apply_and_commit, workdir, diff, f"fix/mistral-{req.ref}-{label}")
        return {"lint_remaining": lint["remaining"], "tests_ok": tests["ok"], "fix_branch": branch}


if __name__ == "__main__":
    from mistralai.workflows import run_worker
    import asyncio
    asyncio.run(run_worker([PatchErrors]))
