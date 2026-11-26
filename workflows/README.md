# workflows/ — workflows Mistral Studio

## patch_errors.py

Workflow durable (`mistralai.workflows`) qui corrige automatiquement les erreurs
de lint et de tests du dépôt :

```
checkout → eslint --fix → node --test → (si erreurs) patch agent Mistral → branche fix/ + push
```

- **Déclenchement** : webhook GitHub (push/PR/**issue ouverte**) ou manuel depuis Studio — l'issue ouverte à la main déclenche `.github/workflows/mistral.yml` (`issues: [opened]`), qui notifie le workflow Studio avec `issue_number`/`issue_title`
  (voir https://docs.mistral.ai/studio/workflows — orchestration déterministe,
  state longue durée, attente d'événements externes).
- **Worker** : `pip install mistralai && python -m workflows.patch_errors`
- **Secrets requis** : `MISTRAL_API_KEY` (et `MISTRAL_MODEL` optionnel).
- L'agent Mistral ne voit que la sortie lint/tests (pas le code entier) et
  retourne un diff appliqué via `git apply`, re-testé avant push.

Le workflow GitHub `.github/workflows/mistral.yml` sert de déclencheur CI :
il lance le lint --fix local et peut notifier le workflow Studio.
