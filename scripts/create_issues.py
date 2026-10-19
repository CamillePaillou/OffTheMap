#!/usr/bin/env python3
"""Off the Map : crée les labels, les jalons et les issues GitHub à partir du plan de réalisation.

Source : Plan_de_realisation_Off_the_Map.md
  - l'annexe (bloc `ID|Titre|labels|jalon|responsable|charge|depend|story|gherkin`) donne la liste des issues,
    leur user story et leurs scénarios ;
  - les tableaux de la section 7 donnent le résultat vérifiable et l'estimation ;
  - les titres d'epics et leurs objectifs donnent le contexte de chaque issue.

Bibliothèque standard uniquement. Les appels GitHub passent par la CLI `gh`
(https://cli.github.com), à authentifier avant avec `gh auth login`.

Par défaut le script est en SIMULATION : il affiche ce qu'il ferait sans rien créer.
Ajouter --apply pour exécuter.

Exemples
  python create_issues.py --repo OWNER/REPO                       # simulation
  python create_issues.py --repo OWNER/REPO --apply               # création réelle
  python create_issues.py --repo OWNER/REPO --apply --team team.json --start-date 2026-11-02
  python create_issues.py --repo OWNER/REPO --prio must --apply   # seulement les Must
  python create_issues.py --repo OWNER/REPO --epic E8,E9 --apply  # seulement l'agent et l'option
  python create_issues.py --check                                 # vérifie le plan, sans GitHub
  python create_issues.py --csv backlog.csv --check               # exporte aussi un CSV

team.json (optionnel) associe P1..P4 à des identifiants GitHub :
  {"P1": "pseudo-github-1", "P2": "pseudo-github-2", "P3": "pseudo-github-3", "P4": "pseudo-github-4"}
Le PO et les issues « Tous » ne sont pas assignés automatiquement.

Filtres : --prio must,should,could et --epic E0,E8,... limitent les issues créées. Les liens de
dépendance vers une issue filtrée restent indiqués par son seul identifiant (`E2.3`).

Le script peut être relancé : une issue dont le titre commence déjà par son identifiant
(`E2.4 — ...`) n'est pas recréée.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import subprocess
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

DEFAULT_PLAN = Path(__file__).with_name("Plan_de_realisation_Off_the_Map.md")

# Issues qui touchent une interface partagée : relecture par les personnes concernées.
# types, migrations, tables de l'agent, matrice des transitions, fixtures, port LLM, serveur fictif,
# règles de chiffrage, contrat de l'agent, schéma des permissions.
CONTRACT_IDS = {"E0.4", "E0.5", "E0.8", "E0.12", "E0.13", "E0.14", "E0.16", "E4.1", "E8.2", "E9.1"}

LABEL_COLORS = {
    "epic:": "5319e7",
    "ws:": "1d76db",
    "type:": "a2eeef",
    "prio:must": "b60205",
    "prio:should": "fbca04",
    "prio:could": "c5def5",
    "contract": "d93f0b",
    "blocked": "e11d21",
}
LABEL_DESCRIPTIONS = {
    "contract": "Touche une interface partagée : relecture par les personnes concernées",
    "blocked": "Bloquée par une autre issue",
}


# --------------------------------------------------------------------------- lecture du plan
def read_plan(path: Path) -> str:
    if not path.exists():
        sys.exit(f"Plan introuvable : {path}")
    return path.read_text(encoding="utf-8")


def parse_annex(text: str) -> list[dict]:
    """Lit le bloc de l'annexe : une ligne par issue, séparateur `|`."""
    m = re.search(r"```text\n(ID\|Titre\|labels\|jalon\|responsable\|charge\|depend(?:\|story\|gherkin)?\n.*?)```", text, re.S)
    if not m:
        sys.exit("Annexe introuvable : le bloc `ID|Titre|labels|jalon|responsable|charge|depend` est absent.")
    issues = []
    for line in m.group(1).splitlines()[1:]:
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) == 7:                       # ancien format, sans user story
            parts += ["", ""]
        if len(parts) != 9:
            sys.exit(f"Ligne d'annexe invalide (9 colonnes attendues) : {line}")
        iid, title, labels, milestone, resp, charge, depend, story, gherkin = parts
        issues.append({
            "id": iid.strip(),
            "title": title.strip(),
            "labels": [x for x in labels.split(",") if x],
            "milestone": milestone.strip(),
            "resp": resp.strip(),
            "charge": float(charge),
            "depend": [x for x in depend.split(",") if x],
            "story": story.strip(),
            "gherkin": gherkin.replace("\\n", "\n").strip(),
        })
    return issues


ROW = re.compile(
    r"^\| (E\d+\.\d+) \| (?P<title>.*) \| (?P<resp>P[1-4]|PO|Tous) \| (?P<est>[SML]) \| (?P<charge>[\d,]+) \| "
    r"(?P<dep>.*?) \| (?P<result>.*) \| (?P<prio>[MSC]) \|$"
)


def parse_backlog(text: str) -> dict[str, dict]:
    """Lit les tableaux d'epics de la section 7 : résultat vérifiable et estimation."""
    rows = {}
    for line in text.splitlines():
        m = ROW.match(line)
        if m:
            rows[m.group(1)] = {"estimation": m.group("est"), "result": m.group("result")}
    return rows


def parse_epics(text: str) -> dict[str, dict]:
    """Lit « ### E2 — Fiche de synthèse IA (4,5 j) » puis la ligne « *Objectif : ...* »."""
    epics = {}
    lines = text.splitlines()
    for i, line in enumerate(lines):
        m = re.match(r"^### (E\d+) — (.*?) \(([\d,]+) j\)$", line)
        if m:
            goal = ""
            for nxt in lines[i + 1:i + 4]:
                g = re.match(r"^\*Objectif : (.*)\*$", nxt)
                if g:
                    goal = g.group(1)
                    break
            epics[m.group(1)] = {"name": m.group(2), "goal": goal}
    return epics


# --------------------------------------------------------------------------- contrôles
def check(issues: list[dict], backlog: dict[str, dict]) -> list[str]:
    problems = []
    ids = [i["id"] for i in issues]
    if len(ids) != len(set(ids)):
        problems.append("Identifiants en double dans l'annexe.")
    known = set(ids)
    for i in issues:
        for d in i["depend"]:
            if d not in known:
                problems.append(f"{i['id']} dépend de {d}, qui n'existe pas.")
        if i["id"] not in backlog:
            problems.append(f"{i['id']} est dans l'annexe mais pas dans les tableaux de la section 7.")
    for iid in backlog:
        if iid not in known:
            problems.append(f"{iid} est dans la section 7 mais pas dans l'annexe.")
    # cycles de dépendances
    state: dict[str, int] = {}
    deps = {i["id"]: i["depend"] for i in issues}

    def visit(n: str, trail: list[str]) -> None:
        if state.get(n) == 1:
            problems.append("Cycle de dépendances : " + " -> ".join(trail + [n]))
            return
        if state.get(n) == 2 or n not in deps:
            return
        state[n] = 1
        for d in deps[n]:
            visit(d, trail + [n])
        state[n] = 2

    for n in deps:
        visit(n, [])
    return problems


def summary(issues: list[dict]) -> str:
    by_epic, by_resp, by_prio = defaultdict(float), defaultdict(float), defaultdict(float)
    for i in issues:
        epic = next((l for l in i["labels"] if l.startswith("epic:")), "epic:?")
        prio = next((l for l in i["labels"] if l.startswith("prio:")), "prio:?")
        by_epic[epic[5:]] += i["charge"]
        by_resp[i["resp"]] += i["charge"]
        by_prio[prio[5:]] += i["charge"]
    f = lambda d: ", ".join(f"{k} {v:g}" for k, v in sorted(d.items()))
    return (
        f"{len(issues)} issues, {sum(i['charge'] for i in issues):g} jours de travail\n"
        f"  par epic        : {f(by_epic)}\n"
        f"  par responsable : {f(by_resp)}\n"
        f"  par priorité    : {f(by_prio)}"
    )


# --------------------------------------------------------------------------- GitHub (via gh)
class Gh:
    def __init__(self, repo: str, apply: bool):
        self.repo, self.apply = repo, apply
        if apply and not shutil.which("gh"):
            sys.exit("La CLI `gh` est introuvable. Installer https://cli.github.com puis `gh auth login`.")

    def run(self, args: list[str], stdin: str | None = None, readonly: bool = False) -> str:
        shown = "gh " + " ".join(a if " " not in a else repr(a) for a in args)
        if not self.apply and not readonly:
            print(f"[simulation] {shown[:200]}")
            return ""
        if not self.apply and readonly:
            return ""
        res = subprocess.run(["gh", *args], input=stdin, capture_output=True, text=True)
        if res.returncode != 0:
            sys.exit(f"Échec de la commande : {shown[:200]}\n{res.stderr.strip()}")
        return res.stdout.strip()


def label_color(name: str) -> str:
    if name in LABEL_COLORS:
        return LABEL_COLORS[name]
    for prefix in ("epic:", "ws:", "type:"):
        if name.startswith(prefix):
            return LABEL_COLORS[prefix]
    return "ededed"


def ensure_labels(gh: Gh, issues: list[dict]) -> None:
    names = sorted({l for i in issues for l in i["labels"]} | {"contract", "blocked"})
    print(f"Labels : {len(names)}")
    for n in names:
        args = ["label", "create", n, "--repo", gh.repo, "--color", label_color(n), "--force"]
        if n in LABEL_DESCRIPTIONS:
            args += ["--description", LABEL_DESCRIPTIONS[n]]
        gh.run(args)


def workday(start: date, n: int) -> date:
    """Date du n-ième jour ouvré après `start` (samedi et dimanche sautés)."""
    d = start
    while d.weekday() >= 5:          # un départ un week-end commence le lundi
        d += timedelta(days=1)
    for _ in range(n):
        d += timedelta(days=1)
        while d.weekday() >= 5:
            d += timedelta(days=1)
    return d


def ensure_milestones(gh: Gh, issues: list[dict], start: date | None) -> None:
    titles = []
    for i in issues:
        if i["milestone"] not in titles:
            titles.append(i["milestone"])
    out = gh.run(["api", f"repos/{gh.repo}/milestones?state=all&per_page=100", "--jq", ".[].title"], readonly=True)
    existing = set(out.splitlines())
    print(f"Jalons : {len(titles)}")
    for t in titles:
        if t in existing:
            print(f"  déjà présent : {t}")
            continue
        args = ["api", f"repos/{gh.repo}/milestones", "-f", f"title={t}"]
        m = re.match(r"J([1-7]) ", t)   # J8 et J9 (débordement) et « Hors sprint » n'ont pas d'échéance
        if start and m:
            due = workday(start, int(m.group(1)) - 1)
            args += ["-f", f"due_on={due.isoformat()}T23:59:59Z"]
        gh.run(args)


def gherkin_block(issue: dict) -> str:
    if not issue.get("gherkin"):
        return ""
    return "## Scénarios (Gherkin)\n```gherkin\n" + issue["gherkin"] + "\n```\n\n"


def issue_body(issue: dict, backlog: dict, epics: dict, numbers: dict[str, int] | None) -> str:
    epic_id = next((l[5:] for l in issue["labels"] if l.startswith("epic:")), "")
    epic = epics.get(epic_id, {"name": epic_id, "goal": ""})
    info = backlog.get(issue["id"], {"estimation": "?", "result": ""})
    prio = next((l[5:] for l in issue["labels"] if l.startswith("prio:")), "?")
    if issue["depend"]:
        deps = ", ".join(f"#{numbers[d]} ({d})" if numbers and d in numbers else d for d in issue["depend"])
    else:
        deps = "aucune"
    contract = "oui, relecture par les personnes concernées" if issue["id"] in CONTRACT_IDS else "aucune"
    return (
        f"## User story\n"
        f"{issue.get('story') or '—'}\n\n"
        f"## Contexte\n"
        f"Epic {epic_id} — {epic['name']}. {epic['goal']}\n"
        f"Plan de réalisation, section 7.\n\n"
        f"## Résultat attendu (Definition of Done)\n"
        f"- [ ] {info['result']}\n"
        f"- [ ] Tests ajoutés ou mis à jour\n"
        f"- [ ] Documentation mise à jour si un contrat est impacté\n\n"
        f"{gherkin_block(issue)}"
        f"## Dépendances\n"
        f"Bloquée par : {deps}\n\n"
        f"## Interface impactée\n"
        f"{contract}\n\n"
        f"## Responsable / priorité / estimation / charge\n"
        f"{issue['resp']} / {prio} / {info['estimation']} / {issue['charge']:g} j\n"
    )


def create_issues(gh: Gh, issues: list[dict], backlog: dict, epics: dict, team: dict, project: tuple | None) -> None:
    out = gh.run(["issue", "list", "--repo", gh.repo, "--state", "all", "--limit", "1000", "--json", "number,title"], readonly=True)
    existing: dict[str, int] = {}
    if out:
        for item in json.loads(out):
            m = re.match(r"^(E\d+\.\d+) — ", item["title"])
            if m:
                existing[m.group(1)] = item["number"]
    numbers: dict[str, int] = dict(existing)
    created: list[dict] = []
    print(f"Issues : {len(issues)} à traiter, {len(existing)} déjà présentes")
    for i in issues:
        if i["id"] in existing:
            print(f"  déjà présente : {i['id']} (#{existing[i['id']]})")
            continue
        labels = list(i["labels"]) + (["contract"] if i["id"] in CONTRACT_IDS else [])
        args = ["issue", "create", "--repo", gh.repo, "--title", f"{i['id']} — {i['title']}",
                "--body", issue_body(i, backlog, epics, None), "--label", ",".join(labels),
                "--milestone", i["milestone"]]
        user = team.get(i["resp"])
        if user:
            args += ["--assignee", user]
        url = gh.run(args)
        if gh.apply:
            numbers[i["id"]] = int(url.rstrip("/").split("/")[-1])
            created.append(i)
            print(f"  créée : {i['id']} -> {url}")
            if project:
                gh.run(["project", "item-add", str(project[0]), "--owner", project[1], "--url", url])
    # seconde passe : liens de dépendance vers les numéros d'issues
    if gh.apply and created:
        print("Ajout des liens de dépendance")
        for i in created:
            if i["depend"]:
                gh.run(["issue", "edit", str(numbers[i["id"]]), "--repo", gh.repo, "--body-file", "-"],
                       stdin=issue_body(i, backlog, epics, numbers))


def export_csv(path: Path, issues: list[dict], backlog: dict) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["ID", "Titre", "User story", "Epic", "Responsable", "Estimation", "Charge (j)", "Priorité", "Jalon", "Dépend", "Résultat vérifiable"])
        for i in issues:
            epic = next((l[5:] for l in i["labels"] if l.startswith("epic:")), "")
            prio = next((l[5:] for l in i["labels"] if l.startswith("prio:")), "")
            info = backlog.get(i["id"], {"estimation": "", "result": ""})
            w.writerow([i["id"], i["title"], i.get("story", ""), epic, i["resp"], info["estimation"], f"{i['charge']:g}", prio,
                        i["milestone"], ", ".join(i["depend"]), info["result"]])
    print(f"CSV écrit : {path}")


# --------------------------------------------------------------------------- programme
def main() -> None:
    p = argparse.ArgumentParser(description="Crée labels, jalons et issues GitHub depuis le plan de réalisation.")
    p.add_argument("--plan", type=Path, default=DEFAULT_PLAN, help="fichier Markdown du plan")
    p.add_argument("--repo", help="OWNER/REPO (obligatoire sauf avec --check)")
    p.add_argument("--apply", action="store_true", help="exécute réellement (sinon simulation)")
    p.add_argument("--check", action="store_true", help="vérifie le plan et s'arrête, sans appeler GitHub")
    p.add_argument("--team", type=Path, help="JSON : {\"P1\": \"pseudo-github\", ...}")
    p.add_argument("--start-date", help="AAAA-MM-JJ : date du J1 ; J2 à J7 suivent en jours ouvrés (échéances des jalons)")
    p.add_argument("--project", type=int, help="numéro d'un GitHub Project où ajouter les issues")
    p.add_argument("--project-owner", help="propriétaire du Project (utilisateur ou organisation)")
    p.add_argument("--csv", type=Path, help="exporte aussi le backlog en CSV")
    p.add_argument("--prio", help="priorités à créer, séparées par des virgules : must,should,could (défaut : toutes)")
    p.add_argument("--epic", help="epics à créer, séparés par des virgules : E0,E8,... (défaut : tous)")
    a = p.parse_args()

    text = read_plan(a.plan)
    issues, backlog, epics = parse_annex(text), parse_backlog(text), parse_epics(text)
    problems = check(issues, backlog)
    print(summary(issues))
    if problems:
        print("\nProblèmes détectés dans le plan :")
        for x in problems:
            print("  -", x)
        sys.exit(1)
    print("Plan cohérent : identifiants uniques, dépendances connues, aucun cycle.")
    if a.csv:
        export_csv(a.csv, issues, backlog)
    if a.check:
        return
    if not a.repo:
        p.error("--repo est obligatoire (sauf avec --check)")
    prios = {x.strip().lower() for x in a.prio.split(",")} if a.prio else None
    epic_ids = {x.strip().upper() for x in a.epic.split(",")} if a.epic else None
    if prios and not prios <= {"must", "should", "could"}:
        p.error("--prio accepte must, should, could")
    if prios or epic_ids:
        before = len(issues)
        issues = [i for i in issues
                  if (not prios or any(l == "prio:" + x for l in i["labels"] for x in prios))
                  and (not epic_ids or any(l == "epic:" + x for l in i["labels"] for x in epic_ids))]
        print(f"\nFiltre : {len(issues)} issues retenues sur {before}")
        if not issues:
            sys.exit("Aucune issue ne correspond au filtre.")
    if a.project and not a.project_owner:
        p.error("--project nécessite --project-owner")
    team = json.loads(a.team.read_text(encoding="utf-8")) if a.team else {}
    start = date.fromisoformat(a.start_date) if a.start_date else None
    gh = Gh(a.repo, a.apply)
    print(f"\nDépôt : {a.repo} — {'EXÉCUTION' if a.apply else 'SIMULATION (ajouter --apply pour créer)'}\n")
    ensure_labels(gh, issues)
    ensure_milestones(gh, issues, start)
    create_issues(gh, issues, backlog, epics, team, (a.project, a.project_owner) if a.project else None)
    print("\nTerminé." if a.apply else "\nSimulation terminée : rien n'a été créé.")


if __name__ == "__main__":
    main()
