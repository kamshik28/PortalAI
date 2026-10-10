# Flowise Agentflow — export

Tento priečinok obsahuje export konfigurácie konverzačného asistenta
realizovaného vo **Flowise**.

- `agentflow-export.json` — export Agentflow určený na import do vlastnej
  inštancie Flowise.

## Dôležité

Flowise beží ako **samostatná externá služba** a **nie je súčasťou** backendu
(`core-api`) ani frontendu (`portal-ai`). Tento export je priložený do
repozitára kvôli **reprodukovateľnosti** — aby bolo možné asistenta obnoviť a
overiť jeho štruktúru.

## Import

1. Spusti vlastnú inštanciu Flowise.
2. V UI zvoľ **Import** a vyber `agentflow-export.json`.
3. Vo `portal-ai/.env` nastav adresu inštancie a ID chatflow-u
   (`FLOWISE_INTERNAL_URL`, `FLOWISE_BASE`, `FLOWISE_CHATFLOW_ID`).

## Vetvenie podľa roly

Frontend posiela do Flowise kontext používateľa (`userRole`, `userId`,
`courseId`), podľa ktorého Agentflow vetví správanie. Export obsahuje okrem
iného nasledujúce uzly:

| Uzol v exporte        | Úloha |
|-----------------------|-------|
| `StudentSupervisor`   | Riadenie toku pre rolu študenta |
| `TeacherSupervisor`   | Riadenie toku pre rolu vyučujúceho |
| `StudentCourseAgent`  | Odpovede ku kurzom z pohľadu študenta |
| `TeacherCourseAgent`  | Odpovede ku kurzom z pohľadu vyučujúceho |
| `CasualChatAgent`     | Bežná konverzácia mimo kurzového kontextu |
| `TestGeneratorAgent`  | Generovanie testových otázok |
| `MaterialAuditAgent`  | Kontrola / audit materiálov |
| `AdminGuard`          | Ochrana pred akciami mimo kompetencie používateľa |

> Pozn.: V texte práce sa uzol `AdminGuard` označuje aj ako `AdminGuardAgent`;
> ide o ten istý prvok Agentflow.
