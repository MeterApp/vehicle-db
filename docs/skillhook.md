# Skillhook operations

Mac mini 2 links `~/dev/vehicle-db` with `skillhook link ~/dev/vehicle-db`.
`vehicle-db-operations` runs under the Car Image Claude account, one job at a
time, after GitHub workflow completions or a Cloud timer daily at 10:43 UTC. The daily sweep
also recovers missed deliveries and checks open `self-heal` / `incident` issues.

GitHub's repository webhook uses the Skillhook Cloud hosted URL for this hook,
JSON content, SSL verification, the `workflow_run` event, and the same secret as
`VEHICLE_DB_GITHUB_WEBHOOK_SECRET` on the machine. The secret is generated on the
machine and is never stored in this repository. Cloud hands the signed delivery
to the machine through its existing outbound sync; no inbound SSH is required.

The package has no Sentry project or deployed service. CI and Publish package
workflow results are the operational signals. Generated plugin repositories are
maintained through their source products and must never be edited here.

Observe with `skillhook jobs list --skill vehicle-db-operations`,
`skillhook deliveries list --skill vehicle-db-operations`, or the Cloud inbox.
Run a check now with `skillhook run vehicle-db-operations`.
The Cloud timer is named `vehicle-db-daily-ci`, with cron `43 10 * * *`, timezone
`Etc/UTC`, machine `8a608a4d-4866-45b1-8612-74a8b22c9a06` and skill
`vehicle-db-operations` (managed through `skillhook cloud save_schedule`). No local
timer is configured, so the two schedulers cannot duplicate the daily sweep.
Replay a failed retained delivery with `skillhook deliveries replay <id>`.
The skill owns small code repairs through PRs and green required checks; package
publication, version changes and source-data changes remain a person's decision.
