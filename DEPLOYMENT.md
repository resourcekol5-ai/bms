# Publish this project to production

This project replaces the existing version at https://bmsbmsbms.netlify.app.
Keep the existing Netlify project so its domain, database, and browser history
cookie continue to belong to the same site. Publishing a new production deploy
replaces the version visitors see; taking the old site down first is unnecessary.

## Publish from the agent run

1. Open the agent run containing the current project changes.
2. Use **Publish** on that run page. The **Publish deploy** button on an existing
   Deploy Preview cannot promote a site that uses Netlify Database.
3. Wait for the production deployment to finish successfully. Netlify applies
   pending database migrations during deployment.
4. Open the production URL and verify **Report history** and **Compare** in the
   dashboard. Use the same browser and keep its site cookies to retain access
   to existing report history.

## Publish from Git

Save or merge the project changes into the connected repository's `main` branch.
In the existing Netlify project's **Deploys** page, wait for the production build
for that commit. If no build starts automatically, use **Trigger deploy** to
deploy the latest branch commit. Confirm the deploy is for **Production**, not
a Deploy Preview, before checking the live URL.

The repository's `netlify.toml` sets the application base to
`BatterManagementSystem-main`, the build command to `npm run build`, and the
publish directory to `dist`. Functions and database migrations are inside that
application directory. Keep the report API, database schema, and existing
migration files with the application when publishing.

## Preserve history and compare mode

Do not delete or recreate the Netlify project, reset the database, remove
migrations, or clear production site cookies to resolve a publishing problem.
Keep `ReportHistoryView.tsx`, `reportHistory.ts`, `BatteryCompareView.tsx`, and
their dashboard navigation. A Deploy Preview has an isolated database branch;
reports created there are separate from production reports and are not
automatically copied into production when the code is published.

A failed production deploy should be investigated in its deploy log. Keep the
last working production deployment available while correcting the failure.
